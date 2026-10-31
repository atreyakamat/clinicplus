import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import {
  ConvertReferralDto,
  CreateReferralDto,
  ListReferralsQueryDto,
  REFERRAL_STATUSES,
  UpdateReferralDto,
} from './dto/review.dto';
import { ReviewActor } from './reviews.service';

const REFERRAL_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
} satisfies Prisma.ReferralInclude;

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAssertService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
  ) {}

  private async withConverted<T extends { convertedPatientId: string | null }>(rows: T[], organizationId: string) {
    const ids = [...new Set(rows.map((r) => r.convertedPatientId).filter((x): x is string => !!x))];
    const patients = ids.length
      ? await this.prisma.patient.findMany({
          where: { id: { in: ids }, organizationId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const byId = new Map(patients.map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      convertedPatient: r.convertedPatientId ? (byId.get(r.convertedPatientId) ?? null) : null,
    }));
  }

  async findAll(query: ListReferralsQueryDto, actor: ReviewActor) {
    const { page, limit, skip, take } = pageArgs(query);
    const where: Prisma.ReferralWhereInput = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      ...(query.status
        ? query.status === 'NEW'
          ? { OR: [{ status: 'NEW' }, { status: null }] }
          : { status: query.status }
        : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.referral.findMany({ where, include: REFERRAL_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.referral.count({ where }),
    ]);
    const items = (await this.withConverted(rows, actor.organizationId)).map((r) => ({
      ...r,
      status: r.status ?? 'NEW',
    }));
    return paginated(items, total, page, limit);
  }

  async findOne(id: string, actor: ReviewActor) {
    assertUuid(id, 'referralId');
    const row = await this.prisma.referral.findFirst({
      where: { id, organizationId: actor.organizationId, branchId: actor.branchId },
      include: REFERRAL_INCLUDE,
    });
    if (!row) throw new NotFoundException('Referral not found');
    const [withPatient] = await this.withConverted([row], actor.organizationId);
    return { ...withPatient, status: row.status ?? 'NEW' };
  }

  async create(dto: CreateReferralDto, actor: ReviewActor) {
    const referrer = await this.tenant.patient(dto.patientId, actor.organizationId);
    const referral = await this.prisma.referral.create({
      data: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        patientId: referrer.id,
        referredName: dto.referredName,
        referredPhone: dto.referredPhone,
        source: dto.source ?? 'PATIENT',
        campaignName: dto.campaignName,
        notes: dto.notes,
        status: 'NEW',
      },
      include: REFERRAL_INCLUDE,
    });
    await this.timeline.record({
      organizationId: actor.organizationId,
      patientId: referrer.id,
      eventType: 'REFERRAL_CREATED',
      eventCategory: 'ENGAGEMENT',
      title: `Referred ${dto.referredName}`,
      metadata: { referralId: referral.id },
      createdBy: actor.id,
    });
    return { ...referral, convertedPatient: null };
  }

  async update(id: string, dto: UpdateReferralDto, actor: ReviewActor) {
    const before = await this.findOne(id, actor);
    if (dto.status === 'CONVERTED' && !before.convertedPatientId) {
      throw new BadRequestException('Use the convert action to link the new patient record');
    }
    await this.prisma.referral.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.referredName !== undefined ? { referredName: dto.referredName } : {}),
        ...(dto.referredPhone !== undefined ? { referredPhone: dto.referredPhone } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    if (dto.status && dto.status !== before.status) {
      await this.audit.log({
        organizationId: actor.organizationId,
        userId: actor.id,
        action: 'REFERRAL_STATUS_CHANGED',
        resource: 'Referral',
        resourceId: id,
        beforeData: { status: before.status },
        afterData: { status: dto.status },
      });
    }
    return this.findOne(id, actor);
  }

  async convert(id: string, dto: ConvertReferralDto, actor: ReviewActor) {
    const before = await this.findOne(id, actor);
    const patient = await this.tenant.patient(dto.convertedPatientId, actor.organizationId);
    if (patient.id === before.patientId) {
      throw new BadRequestException('A patient cannot be converted from their own referral');
    }
    await this.prisma.referral.update({
      where: { id },
      data: { status: 'CONVERTED', convertedPatientId: patient.id },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'REFERRAL_CONVERTED',
      resource: 'Referral',
      resourceId: id,
      beforeData: { status: before.status },
      afterData: { status: 'CONVERTED', convertedPatientId: patient.id },
    });
    await this.timeline.record({
      organizationId: actor.organizationId,
      patientId: before.patientId,
      eventType: 'REFERRAL_CONVERTED',
      eventCategory: 'ENGAGEMENT',
      title: `Referral converted: ${patient.firstName} ${patient.lastName} registered`,
      metadata: { referralId: id, convertedPatientId: patient.id },
      createdBy: actor.id,
    });
    return this.findOne(id, actor);
  }

  async remove(id: string, actor: ReviewActor) {
    const before = await this.findOne(id, actor);
    await this.prisma.referral.delete({ where: { id } });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'REFERRAL_DELETED',
      resource: 'Referral',
      resourceId: id,
      beforeData: { referredName: before.referredName, status: before.status },
    });
    return { id, deleted: true };
  }

  /** Funnel by status, conversion rate and top referring patients for the active branch. */
  async stats(actor: ReviewActor) {
    const where = { organizationId: actor.organizationId, branchId: actor.branchId };
    const [byStatusRows, top, convertedByPatient] = await Promise.all([
      this.prisma.referral.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.referral.groupBy({
        by: ['patientId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { patientId: 'desc' } },
        take: 10,
      }),
      this.prisma.referral.groupBy({
        by: ['patientId'],
        where: { ...where, status: 'CONVERTED' },
        _count: { _all: true },
      }),
    ]);
    const byStatus: Record<string, number> = Object.fromEntries(REFERRAL_STATUSES.map((s) => [s, 0]));
    for (const row of byStatusRows) byStatus[row.status ?? 'NEW'] = (byStatus[row.status ?? 'NEW'] ?? 0) + row._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const patients = await this.prisma.patient.findMany({
      where: { id: { in: top.map((t) => t.patientId) }, organizationId: actor.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    const pById = new Map(patients.map((p) => [p.id, p]));
    const convById = new Map(convertedByPatient.map((c) => [c.patientId, c._count._all]));
    return {
      total,
      byStatus,
      conversionRate: total ? Math.round((byStatus.CONVERTED / total) * 1000) / 10 : 0,
      topReferrers: top.map((t) => ({
        patientId: t.patientId,
        name: pById.has(t.patientId) ? `${pById.get(t.patientId)!.firstName} ${pById.get(t.patientId)!.lastName}` : 'Unknown',
        referrals: t._count._all,
        converted: convById.get(t.patientId) ?? 0,
      })),
    };
  }
}
