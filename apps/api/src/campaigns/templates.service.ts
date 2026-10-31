import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { assertUuid } from '../common/validation/uuid';
import { MessageContextService } from '../messages/message-context.service';
import {
  DEFAULT_TEMPLATES,
  SAMPLE_TEMPLATE_VARS,
  TEMPLATE_VARIABLES,
  renderTemplate,
  unknownTemplateVariables,
} from '../messages/template-render';
import { CreateTemplateDto, PreviewTemplateDto, UpdateTemplateDto } from './dto/templates.dto';

interface Actor {
  organizationId: string;
  userId?: string;
  branchId?: string;
  orgWide?: boolean;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly context: MessageContextService,
    private readonly tenant: TenantAssertService,
  ) {}

  /** Seeds the default templates the first time an organization lists templates. */
  async ensureDefaults(organizationId: string) {
    const existing = await this.prisma.template.count({ where: { organizationId } });
    if (existing > 0) return;
    await this.prisma.$transaction(async (tx) => {
      // Per-org lock so concurrent first listings cannot seed twice.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'templates-seed:' + organizationId}))`;
      const again = await tx.template.count({ where: { organizationId } });
      if (again > 0) return;
      await tx.template.createMany({
        data: DEFAULT_TEMPLATES.map((t) => ({
          organizationId,
          name: t.name,
          channel: 'SMS' as const,
          templateContent: t.content,
          purpose: t.purpose,
          isActive: true,
        })),
      });
    });
  }

  async list(organizationId: string) {
    await this.ensureDefaults(organizationId);
    const items = await this.prisma.template.findMany({
      where: { organizationId, channel: { in: ['SMS', 'WHATSAPP'] } },
      orderBy: [{ purpose: 'asc' }, { name: 'asc' }],
    });
    return { items, variables: TEMPLATE_VARIABLES };
  }

  async findOne(organizationId: string, id: string) {
    assertUuid(id, 'id');
    const row = await this.prisma.template.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Template not found');
    return row;
  }

  private validateContent(content: string) {
    const unknown = unknownTemplateVariables(content);
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown template variable(s): ${unknown.map((v) => `{{${v}}}`).join(', ')}. Allowed: ${TEMPLATE_VARIABLES.join(', ')}`,
      );
    }
  }

  async create(actor: Actor, dto: CreateTemplateDto) {
    this.validateContent(dto.content);
    const row = await this.prisma.template.create({
      data: {
        organizationId: actor.organizationId,
        name: dto.name,
        channel: dto.channel,
        templateContent: dto.content,
        purpose: dto.purpose ?? 'CUSTOM',
        isActive: dto.isActive ?? true,
        externalTemplateId: dto.externalTemplateId ?? null,
      },
    });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'TEMPLATE_CREATED', resource: 'Template', resourceId: row.id, afterData: row });
    return row;
  }

  async update(actor: Actor, id: string, dto: UpdateTemplateDto) {
    const before = await this.findOne(actor.organizationId, id);
    if (dto.content !== undefined) this.validateContent(dto.content);
    const row = await this.prisma.template.update({
      where: { id: before.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.channel !== undefined ? { channel: dto.channel } : {}),
        ...(dto.content !== undefined ? { templateContent: dto.content } : {}),
        ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.externalTemplateId !== undefined ? { externalTemplateId: dto.externalTemplateId } : {}),
      },
    });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'TEMPLATE_UPDATED', resource: 'Template', resourceId: row.id, beforeData: before, afterData: row });
    return row;
  }

  async remove(actor: Actor, id: string) {
    const before = await this.findOne(actor.organizationId, id);
    const inUse = await this.prisma.campaign.count({
      where: { organizationId: actor.organizationId, templateId: before.id, status: { in: ['DRAFT', 'SCHEDULED', 'SENDING'] } },
    });
    if (inUse) throw new BadRequestException('Template is used by a draft, scheduled or sending campaign');
    await this.prisma.template.delete({ where: { id: before.id } });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.userId, action: 'TEMPLATE_DELETED', resource: 'Template', resourceId: before.id, beforeData: before });
    return { id: before.id, deleted: true };
  }

  /** Renders template text with a real patient's data or sample values. */
  async preview(actor: Actor, dto: PreviewTemplateDto) {
    const unknownVariables = unknownTemplateVariables(dto.content);
    let vars: Record<string, string | null | undefined> = { ...SAMPLE_TEMPLATE_VARS, ...(dto.link ? { link: dto.link } : {}) };
    if (dto.patientId) {
      await this.tenant.patient(dto.patientId, actor.organizationId, actor.orgWide ? undefined : actor.branchId);
      const upcoming = await this.prisma.appointment.findFirst({
        where: { organizationId: actor.organizationId, patientId: dto.patientId, scheduledStart: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
        orderBy: { scheduledStart: 'asc' },
        select: { id: true },
      });
      vars = await this.context.varsForPatient(actor.organizationId, dto.patientId, { appointmentId: upcoming?.id, link: dto.link ?? null });
    } else {
      const org = await this.prisma.organization.findUnique({ where: { id: actor.organizationId }, select: { name: true } });
      if (org) vars.clinicName = org.name;
    }
    const rendered = renderTemplate(dto.content, vars);
    return { rendered, length: rendered.length, segments: Math.max(1, Math.ceil(rendered.length / 160)), unknownVariables, variables: vars };
  }
}
