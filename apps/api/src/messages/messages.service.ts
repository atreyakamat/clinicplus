import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { pageArgs, paginated } from '../common/pagination';
import { MessagingService } from './messaging.service';
import { MessageContextService } from './message-context.service';
import { contentVariablesFor, renderTemplate } from './template-render';
import { ConversationQueryDto, MessageLogQueryDto, SendMessageDto } from './dto/messages.dto';
import { OutboundChannel } from './messaging.types';

export interface Scope {
  organizationId: string;
  branchId: string;
  orgWide?: boolean;
}

const PATIENT_SELECT = { id: true, firstName: true, lastName: true, phone: true, communicationOptIn: true, preferredChannel: true } as const;

/** Reminder-key prefixes written by automations. */
export const AUTOMATION_KEY_PREFIXES = ['confirm:', 'cancel:', 'remind24:', 'remind2:', 'fu-due:', 'fu-overdue:'];

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly context: MessageContextService,
    private readonly tenant: TenantAssertService,
  ) {}

  /** Delivery log for the active branch. */
  async findAll(scope: Scope, q: MessageLogQueryDto = {}) {
    const { page, limit, skip, take } = pageArgs(q);
    const where: Prisma.MessageWhereInput = { organizationId: scope.organizationId, branchId: scope.branchId };
    if (q.channel) where.channel = q.channel as any;
    if (q.direction) where.direction = q.direction;
    if (q.status) where.deliveryStatus = q.status;
    if (q.patientId) where.patientId = q.patientId;
    if (q.source === 'campaign') where.reminderKey = { startsWith: 'campaign:' };
    else if (q.source === 'automation') where.OR = AUTOMATION_KEY_PREFIXES.map((p) => ({ reminderKey: { startsWith: p } }));
    else if (q.source === 'manual') where.reminderKey = null;
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.message.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  /** Delivery counts by status for the active branch over the last `days` days. */
  async stats(scope: Scope, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.message.groupBy({
      by: ['deliveryStatus', 'direction', 'channel'],
      where: { organizationId: scope.organizationId, branchId: scope.branchId, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return { since, rows: rows.map((r) => ({ deliveryStatus: r.deliveryStatus, direction: r.direction, channel: r.channel, count: r._count._all })) };
  }

  /** Inbox: one row per patient, most recent conversation first. */
  async conversations(scope: Scope, q: ConversationQueryDto = {}) {
    const { page, limit, skip, take } = pageArgs(q);
    const where: Prisma.MessageWhereInput = { organizationId: scope.organizationId, branchId: scope.branchId };
    if (q.search) {
      const s = q.search;
      where.patient = {
        OR: [
          { firstName: { contains: s, mode: 'insensitive' } },
          { lastName: { contains: s, mode: 'insensitive' } },
          { phone: { contains: s } },
        ],
      };
    }
    const groups = await this.prisma.message.groupBy({
      by: ['patientId'],
      where,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });
    const total = groups.length;
    const pageGroups = groups.slice(skip, skip + take);
    const ids = pageGroups.map((g) => g.patientId);
    if (!ids.length) return paginated([], total, page, limit);

    const [patients, lastMessages, inboundCounts] = await Promise.all([
      this.prisma.patient.findMany({ where: { id: { in: ids }, organizationId: scope.organizationId }, select: PATIENT_SELECT }),
      Promise.all(
        ids.map((patientId) =>
          this.prisma.message.findFirst({
            where: { organizationId: scope.organizationId, branchId: scope.branchId, patientId },
            orderBy: { createdAt: 'desc' },
          }),
        ),
      ),
      this.prisma.message.groupBy({
        by: ['patientId'],
        where: { organizationId: scope.organizationId, branchId: scope.branchId, patientId: { in: ids }, direction: 'INBOUND' },
        _count: { _all: true },
      }),
    ]);
    const pById = new Map(patients.map((p) => [p.id, p]));
    const inbound = new Map(inboundCounts.map((r) => [r.patientId, r._count._all]));
    const items = ids.map((id, i) => ({
      patient: pById.get(id) ?? null,
      lastMessage: lastMessages[i],
      lastMessageAt: pageGroups[i]._max.createdAt,
      inboundCount: inbound.get(id) ?? 0,
      awaitingReply: lastMessages[i]?.direction === 'INBOUND',
    }));
    return paginated(items, total, page, limit);
  }

  private async assertPatient(scope: Scope, patientId: string) {
    return this.tenant.patient(patientId, scope.organizationId, scope.orgWide ? undefined : scope.branchId);
  }

  async thread(scope: Scope, patientId: string) {
    await this.assertPatient(scope, patientId);
    const [patient, messages] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: patientId, organizationId: scope.organizationId }, select: PATIENT_SELECT }),
      this.prisma.message.findMany({
        where: { organizationId: scope.organizationId, patientId },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
    ]);
    return { patient, messages };
  }

  /** Staff-initiated send (reply / compose). */
  async send(scope: Scope, dto: SendMessageDto) {
    const patient = await this.assertPatient(scope, dto.patientId);
    let body = dto.body?.trim() ?? '';
    let contentSid: string | null = null;
    let contentVariables: Record<string, string> | undefined;
    const channel: OutboundChannel = this.messaging.resolveChannel(patient.preferredChannel, dto.channel ?? null);
    if (dto.templateId) {
      const tpl = await this.prisma.template.findFirst({ where: { id: dto.templateId, organizationId: scope.organizationId } });
      if (!tpl) throw new NotFoundException('Template not found');
      const vars = await this.context.varsForPatient(scope.organizationId, patient.id, { link: dto.link ?? null });
      body = renderTemplate(tpl.templateContent, vars);
      if (channel === 'WHATSAPP' && tpl.channel === 'WHATSAPP' && tpl.externalTemplateId) {
        contentSid = tpl.externalTemplateId;
        contentVariables = contentVariablesFor(tpl.templateContent, vars);
      }
    }
    if (!body) throw new BadRequestException('Either body or templateId is required');
    if (dto.channel && this.messaging.driver.name === 'twilio' && !this.messaging.driver.isChannelConfigured(dto.channel)) {
      throw new BadRequestException(`${dto.channel} is not configured for this clinic`);
    }
    return this.messaging.sendToPatientOrThrow({
      organizationId: scope.organizationId,
      branchId: patient.branchId,
      patientId: patient.id,
      channel,
      body,
      essential: false, // patients who replied STOP are not messaged by staff (they can reply START)
      contentSid,
      contentVariables,
    });
  }

  async reply(scope: Scope, patientId: string, body: string, channel?: OutboundChannel) {
    return this.send(scope, { patientId, body, channel } as SendMessageDto);
  }

  async listTemplates(organizationId: string) {
    return this.prisma.template.findMany({
      where: { organizationId, channel: { in: ['WHATSAPP', 'SMS'] } },
      orderBy: { name: 'asc' },
    });
  }
}
