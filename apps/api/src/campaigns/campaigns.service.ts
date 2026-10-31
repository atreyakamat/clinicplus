import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Campaign, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { assertUuid } from '../common/validation/uuid';
import { pageArgs, paginated } from '../common/pagination';
import { MessagingService } from '../messages/messaging.service';
import { MessageContextService } from '../messages/message-context.service';
import { contentVariablesFor, renderTemplate, unknownTemplateVariables, TEMPLATE_VARIABLES } from '../messages/template-render';
import { ACCEPTED_STATUSES } from '../messages/messaging.types';
import { AudienceFilterDto, CampaignListQueryDto, CreateCampaignDto, SendCampaignDto, UpdateCampaignDto } from './dto/campaigns.dto';

export interface CampaignActor {
  organizationId: string;
  branchId: string;
  userId?: string;
  orgWide?: boolean;
}

export const CAMPAIGN_BATCH_SIZE = 50;
const ACTIVE_APPT = ['SCHEDULED', 'CONFIRMED'] as const;
const VISIT_DONE = ['COMPLETED'] as const;

export const campaignKey = (campaignId: string, patientId: string) => `campaign:${campaignId}:${patientId}`;

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
    private readonly context: MessageContextService,
  ) {}

  // ---------------------------------------------------------------- audience

  /** Prisma filter for a campaign audience. Opted-out, phoneless and archived patients are always excluded. */
  audienceWhere(organizationId: string, branchId: string | null, filter: AudienceFilterDto | null | undefined): Prisma.PatientWhereInput {
    const f = filter ?? {};
    const now = Date.now();
    const and: Prisma.PatientWhereInput[] = [
      { organizationId, deletedAt: null, status: 'ACTIVE', communicationOptIn: true, phone: { not: null } },
      { NOT: { phone: '' } },
    ];
    const branch = branchId ?? f.branchId ?? null;
    if (branch) and.push({ branchId: branch });
    if (f.tags?.length) and.push({ tags: { some: { tagName: { in: f.tags } } } });
    if (f.gender) and.push({ gender: { equals: f.gender, mode: 'insensitive' } });
    if (f.ageMin !== undefined) {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - f.ageMin);
      and.push({ dateOfBirth: { lte: d } });
    }
    if (f.ageMax !== undefined) {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - f.ageMax - 1);
      and.push({ dateOfBirth: { gt: d } });
    }
    if (f.lastVisitBeforeDays !== undefined) {
      const cutoff = new Date(now - f.lastVisitBeforeDays * 86_400_000);
      and.push({ appointments: { some: { status: { in: [...VISIT_DONE] } } } });
      and.push({ appointments: { none: { status: { in: [...VISIT_DONE] }, scheduledStart: { gte: cutoff } } } });
    }
    if (f.lastVisitAfterDays !== undefined) {
      const cutoff = new Date(now - f.lastVisitAfterDays * 86_400_000);
      and.push({ appointments: { some: { status: { in: [...VISIT_DONE] }, scheduledStart: { gte: cutoff } } } });
    }
    if (f.hasUpcomingAppointment !== undefined) {
      const upcoming: Prisma.AppointmentWhereInput = { status: { in: [...ACTIVE_APPT] }, scheduledStart: { gte: new Date(now) }, deletedAt: null };
      and.push(f.hasUpcomingAppointment ? { appointments: { some: upcoming } } : { appointments: { none: upcoming } });
    }
    return { AND: and };
  }

  private targetBranch(actor: CampaignActor, allBranches?: boolean): string | null {
    if (allBranches) {
      if (!actor.orgWide) throw new BadRequestException('Only organization-wide users can target all branches');
      return null;
    }
    return actor.branchId;
  }

  async previewAudience(actor: CampaignActor, audience: AudienceFilterDto | undefined, allBranches?: boolean) {
    const branchId = this.targetBranch(actor, allBranches);
    this.assertAudienceBranch(actor, audience);
    const where = this.audienceWhere(actor.organizationId, branchId, audience);
    const optedOutWhere = this.audienceWhere(actor.organizationId, branchId, audience);
    // Same filter but counting only the opted-out patients (for transparency in the UI).
    (optedOutWhere.AND as Prisma.PatientWhereInput[])[0] = { organizationId: actor.organizationId, deletedAt: null, status: 'ACTIVE', communicationOptIn: false, phone: { not: null } };
    const [count, optedOut, sample] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.count({ where: optedOutWhere }),
      this.prisma.patient.findMany({ where, take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    return { count, excludedOptedOut: optedOut, sample };
  }

  private assertAudienceBranch(actor: CampaignActor, audience?: AudienceFilterDto | null) {
    if (audience?.branchId && !actor.orgWide && audience.branchId !== actor.branchId) {
      throw new BadRequestException('You can only target your own branch');
    }
  }

  // ---------------------------------------------------------------- CRUD

  private visibleWhere(actor: CampaignActor): Prisma.CampaignWhereInput {
    return actor.orgWide
      ? { organizationId: actor.organizationId }
      : { organizationId: actor.organizationId, OR: [{ branchId: actor.branchId }, { branchId: null }] };
  }

  async list(actor: CampaignActor, q: CampaignListQueryDto = {}) {
    const { page, limit, skip, take } = pageArgs(q);
    const where: Prisma.CampaignWhereInput = { ...this.visibleWhere(actor), ...(q.status ? { status: q.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.campaign.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  private async getOwned(actor: CampaignActor, id: string): Promise<Campaign> {
    assertUuid(id, 'id');
    const row = await this.prisma.campaign.findFirst({ where: { id, ...this.visibleWhere(actor) } });
    if (!row) throw new NotFoundException('Campaign not found');
    return row;
  }

  async findOne(actor: CampaignActor, id: string) {
    const campaign = await this.getOwned(actor, id);
    const breakdown = await this.prisma.message.groupBy({
      by: ['deliveryStatus'],
      where: { organizationId: actor.organizationId, reminderKey: { startsWith: `campaign:${campaign.id}:` } },
      _count: { _all: true },
    });
    const template = campaign.templateId
      ? await this.prisma.template.findFirst({ where: { id: campaign.templateId, organizationId: actor.organizationId }, select: { id: true, name: true, templateContent: true } })
      : null;
    return {
      ...campaign,
      template,
      deliveryBreakdown: breakdown.map((b) => ({ deliveryStatus: b.deliveryStatus, count: b._count._all })),
    };
  }

  private async validateContent(organizationId: string, templateId?: string | null, body?: string | null) {
    if (templateId) {
      const tpl = await this.prisma.template.findFirst({ where: { id: templateId, organizationId } });
      if (!tpl) throw new NotFoundException('Template not found');
    }
    if (body) {
      const unknown = unknownTemplateVariables(body);
      if (unknown.length) throw new BadRequestException(`Unknown variable(s): ${unknown.join(', ')}. Allowed: ${TEMPLATE_VARIABLES.join(', ')}`);
    }
  }

  async create(actor: CampaignActor, dto: CreateCampaignDto) {
    if (!dto.templateId && !dto.messageBody) throw new BadRequestException('Either templateId or messageBody is required');
    await this.validateContent(actor.organizationId, dto.templateId, dto.messageBody);
    this.assertAudienceBranch(actor, dto.audience);
    const row = await this.prisma.campaign.create({
      data: {
        organizationId: actor.organizationId,
        branchId: this.targetBranch(actor, dto.allBranches),
        name: dto.name,
        channel: dto.channel,
        status: 'DRAFT',
        templateId: dto.templateId ?? null,
        messageBody: dto.messageBody ?? null,
        audience: (dto.audience ?? {}) as Prisma.InputJsonValue,
        createdBy: actor.userId ?? null,
      },
    });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'CAMPAIGN_CREATED', resource: 'Campaign', resourceId: row.id, afterData: row });
    return row;
  }

  async update(actor: CampaignActor, id: string, dto: UpdateCampaignDto) {
    const before = await this.getOwned(actor, id);
    if (!['DRAFT', 'SCHEDULED'].includes(before.status ?? 'DRAFT')) throw new BadRequestException(`A ${before.status} campaign cannot be edited`);
    await this.validateContent(actor.organizationId, dto.templateId, dto.messageBody);
    this.assertAudienceBranch(actor, dto.audience);
    const templateId = dto.templateId !== undefined ? dto.templateId : before.templateId;
    const messageBody = dto.messageBody !== undefined ? dto.messageBody : before.messageBody;
    if (!templateId && !messageBody) throw new BadRequestException('Either templateId or messageBody is required');
    const row = await this.prisma.campaign.update({
      where: { id: before.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.channel !== undefined ? { channel: dto.channel } : {}),
        templateId,
        messageBody,
        ...(dto.audience !== undefined ? { audience: dto.audience as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'CAMPAIGN_UPDATED', resource: 'Campaign', resourceId: row.id, beforeData: before, afterData: row });
    return row;
  }

  async remove(actor: CampaignActor, id: string) {
    const before = await this.getOwned(actor, id);
    if ((before.status ?? 'DRAFT') !== 'DRAFT') throw new BadRequestException('Only draft campaigns can be deleted; cancel it instead');
    await this.prisma.campaign.delete({ where: { id: before.id } });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'CAMPAIGN_DELETED', resource: 'Campaign', resourceId: before.id, beforeData: before });
    return { id: before.id, deleted: true };
  }

  async cancel(actor: CampaignActor, id: string) {
    const before = await this.getOwned(actor, id);
    if (['COMPLETED', 'CANCELLED'].includes(before.status ?? '')) throw new BadRequestException(`Campaign is already ${before.status}`);
    const row = await this.prisma.campaign.update({ where: { id: before.id }, data: { status: 'CANCELLED', endedAt: new Date() } });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'CAMPAIGN_CANCELLED', resource: 'Campaign', resourceId: row.id, beforeData: before, afterData: row });
    return row;
  }

  /** Schedules (future scheduledAt) or starts sending now; the first batch is sent inline. */
  async send(actor: CampaignActor, id: string, dto: SendCampaignDto) {
    const before = await this.getOwned(actor, id);
    if (!['DRAFT', 'SCHEDULED'].includes(before.status ?? 'DRAFT')) throw new BadRequestException(`A ${before.status} campaign cannot be sent`);
    const driver = this.messaging.driver;
    if (driver.name === 'twilio' && !driver.isChannelConfigured(before.channel as 'SMS' | 'WHATSAPP')) {
      throw new BadRequestException(`${before.channel} is not configured for this clinic`);
    }
    const at = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (at && at.getTime() > Date.now() + 60_000) {
      const row = await this.prisma.campaign.update({ where: { id: before.id }, data: { status: 'SCHEDULED', scheduledAt: at } });
      await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'CAMPAIGN_SCHEDULED', resource: 'Campaign', resourceId: row.id, afterData: { scheduledAt: at } });
      return row;
    }
    await this.prisma.campaign.update({ where: { id: before.id }, data: { status: 'SENDING', scheduledAt: new Date(), startedAt: new Date() } });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'CAMPAIGN_SENT', resource: 'Campaign', resourceId: before.id });
    const progress = await this.processCampaign(before.id, 1);
    if (!progress.completed) {
      // Continue in the background; the scheduler also resumes SENDING campaigns after restarts.
      setImmediate(() => {
        this.processCampaign(before.id).catch((err) => this.logger.error(`Campaign ${before.id} failed: ${err?.message ?? err}`));
      });
    }
    return this.findOne(actor, before.id);
  }

  // ---------------------------------------------------------------- processing

  /**
   * Sends to recipients that have not been messaged yet, in batches. Safe to run concurrently
   * (per-recipient reminderKey is unique), and resumable after a crash.
   */
  async processCampaign(campaignId: string, maxBatches = Number.MAX_SAFE_INTEGER): Promise<{ sent: number; failed: number; completed: boolean }> {
    if (this.running.has(campaignId)) return { sent: 0, failed: 0, completed: false };
    this.running.add(campaignId);
    let sent = 0;
    let failed = 0;
    try {
      for (let batch = 0; batch < maxBatches; batch++) {
        const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign || campaign.status !== 'SENDING') return { sent, failed, completed: true };
        const template = campaign.templateId
          ? await this.prisma.template.findFirst({ where: { id: campaign.templateId, organizationId: campaign.organizationId } })
          : null;
        const content = template?.templateContent ?? campaign.messageBody ?? '';
        if (!content) {
          await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'CANCELLED', endedAt: new Date() } });
          this.logger.warn(`Campaign ${campaign.id} cancelled: template missing and no message body`);
          return { sent, failed, completed: true };
        }
        const where: Prisma.PatientWhereInput = {
          AND: [
            this.audienceWhere(campaign.organizationId, campaign.branchId, campaign.audience as AudienceFilterDto | null),
            { messages: { none: { reminderKey: { startsWith: `campaign:${campaign.id}:` } } } },
          ],
        };
        const recipients = await this.prisma.patient.findMany({ where, select: { id: true }, orderBy: { id: 'asc' }, take: CAMPAIGN_BATCH_SIZE });
        if (!recipients.length) {
          await this.prisma.campaign.updateMany({ where: { id: campaign.id, status: 'SENDING' }, data: { status: 'COMPLETED', endedAt: new Date() } });
          return { sent, failed, completed: true };
        }
        const channel = campaign.channel as 'SMS' | 'WHATSAPP';
        for (const r of recipients) {
          const vars = await this.context.varsForPatient(campaign.organizationId, r.id);
          const useContent = channel === 'WHATSAPP' && template?.channel === 'WHATSAPP' && template.externalTemplateId;
          const out = await this.messaging.sendToPatient({
            organizationId: campaign.organizationId,
            patientId: r.id,
            channel,
            body: renderTemplate(content, vars) || content,
            reminderKey: campaignKey(campaign.id, r.id),
            essential: false,
            contentSid: useContent ? template!.externalTemplateId : null,
            contentVariables: useContent ? contentVariablesFor(content, vars) : undefined,
          });
          if (!out.message) continue;
          const ok = ACCEPTED_STATUSES.includes(out.message.deliveryStatus ?? '');
          if (ok) sent++;
          else failed++;
          await this.prisma.campaign.update({
            where: { id: campaign.id },
            data: ok ? { sentCount: { increment: 1 } } : { failedCount: { increment: 1 } },
          });
        }
        if (recipients.length < CAMPAIGN_BATCH_SIZE && (await this.prisma.patient.count({ where })) === 0) {
          await this.prisma.campaign.updateMany({ where: { id: campaign.id, status: 'SENDING' }, data: { status: 'COMPLETED', endedAt: new Date() } });
          return { sent, failed, completed: true };
        }
      }
      return { sent, failed, completed: false };
    } finally {
      this.running.delete(campaignId);
    }
  }

  /** Called by the scheduler: starts due SCHEDULED campaigns and resumes SENDING ones. */
  async processDueCampaigns(organizationId?: string) {
    const orgFilter = organizationId ? { organizationId } : {};
    await this.prisma.campaign.updateMany({
      where: { ...orgFilter, status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      data: { status: 'SENDING', startedAt: new Date() },
    });
    const sending = await this.prisma.campaign.findMany({ where: { ...orgFilter, status: 'SENDING' }, select: { id: true }, take: 20 });
    let sent = 0;
    let failed = 0;
    for (const c of sending) {
      const r = await this.processCampaign(c.id, 4);
      sent += r.sent;
      failed += r.failed;
    }
    return { campaigns: sending.length, sent, failed };
  }
}
