import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { TaskAutomationService } from '../tasks/task-automation.service';
import {
  FOLLOW_UP_STATUS,
  FOLLOW_UP_TRANSITIONS,
  FollowUpStatus,
  OPEN_FOLLOW_UP_STATUSES,
  normalizeFollowUpStatus,
} from './follow-up.constants';
import {
  AddFollowUpOutcomeDto,
  CreateFollowUpDto,
  FollowUpMetricsQueryDto,
  ListFollowUpsQueryDto,
  UpdateFollowUpDto,
} from './dto/follow-up.dto';

export interface FollowUpActor {
  id: string;
  organizationId: string;
  branchId: string;
}

const FOLLOW_UP_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  doctor: { select: { id: true, firstName: true, lastName: true } },
  outcomes: { orderBy: { recordedAt: 'desc' } },
} satisfies Prisma.FollowUpInclude;

/** Open = PENDING / SCHEDULED, or legacy rows with no status. */
export const openStatusWhere = (): Prisma.FollowUpWhereInput => ({
  OR: [{ status: { in: OPEN_FOLLOW_UP_STATUSES } }, { status: null }],
});

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAssertService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly automation: TaskAutomationService,
  ) {}

  private async assertAppointmentFor(appointmentId: string, patientId: string, actor: FollowUpActor) {
    const appt = await this.tenant.appointment(appointmentId, actor.organizationId);
    if (appt.patientId !== patientId) {
      throw new BadRequestException('Appointment belongs to a different patient');
    }
    if (appt.deletedAt || appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') {
      throw new BadRequestException('A cancelled or no-show appointment cannot fulfil a follow-up');
    }
    return appt;
  }

  async create(dto: CreateFollowUpDto, actor: FollowUpActor) {
    const patient = await this.tenant.patient(dto.patientId, actor.organizationId);
    const doctorId = dto.doctorId ?? actor.id;
    await this.tenant.user(doctorId, actor.organizationId, { label: 'Doctor' });
    if (dto.consultationId) {
      const c = await this.tenant.consultation(dto.consultationId, actor.organizationId);
      if (c.patientId !== patient.id) throw new BadRequestException('Consultation belongs to a different patient');
    }
    if (dto.appointmentId) await this.assertAppointmentFor(dto.appointmentId, patient.id, actor);

    const followUp = await this.prisma.followUp.create({
      data: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        patientId: patient.id,
        doctorId,
        consultationId: dto.consultationId,
        appointmentId: dto.appointmentId,
        scheduledDate: new Date(dto.scheduledDate),
        reason: dto.reason,
        notes: dto.notes,
        status: dto.appointmentId ? FOLLOW_UP_STATUS.SCHEDULED : FOLLOW_UP_STATUS.PENDING,
      },
      include: FOLLOW_UP_INCLUDE,
    });
    await this.timeline.record({
      organizationId: actor.organizationId,
      patientId: patient.id,
      eventType: 'FOLLOW_UP_CREATED',
      eventCategory: 'FOLLOW_UP',
      title: 'Follow-up planned',
      description: `${followUp.scheduledDate.toISOString().slice(0, 10)}${dto.reason ? ` — ${dto.reason}` : ''}`,
      metadata: { followUpId: followUp.id },
      createdBy: actor.id,
    });
    return followUp;
  }

  async findAll(query: ListFollowUpsQueryDto, actor: FollowUpActor) {
    const { page, limit, skip, take } = pageArgs(query);
    const now = new Date();
    const and: Prisma.FollowUpWhereInput[] = [];
    if (query.status === 'PENDING') and.push({ OR: [{ status: 'PENDING' }, { status: null }] });
    else if (query.status) and.push({ status: query.status });
    if (query.overdue) and.push(openStatusWhere(), { scheduledDate: { lt: now } });
    if (query.from || query.to) {
      and.push({
        scheduledDate: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }
    if (query.search) {
      const q = query.search.trim();
      and.push({
        patient: {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        },
      });
    }
    const where: Prisma.FollowUpWhereInput = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      ...(query.doctorId ? { doctorId: query.doctorId } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      AND: and,
    };
    const [rows, total] = await Promise.all([
      this.prisma.followUp.findMany({
        where,
        include: FOLLOW_UP_INCLUDE,
        orderBy: { scheduledDate: 'asc' },
        skip,
        take,
      }),
      this.prisma.followUp.count({ where }),
    ]);
    const items = rows.map((f) => this.decorate(f, now));
    return paginated(items, total, page, limit);
  }

  private decorate<T extends { status: string | null; scheduledDate: Date }>(f: T, now = new Date()) {
    const status = normalizeFollowUpStatus(f.status);
    return {
      ...f,
      status,
      isOverdue: OPEN_FOLLOW_UP_STATUSES.includes(status) && f.scheduledDate < now,
    };
  }

  async findOne(id: string, actor: FollowUpActor) {
    assertUuid(id, 'followUpId');
    const followUp = await this.prisma.followUp.findFirst({
      where: { id, organizationId: actor.organizationId, branchId: actor.branchId },
      include: FOLLOW_UP_INCLUDE,
    });
    if (!followUp) throw new NotFoundException('Follow-up not found');
    const appointment = followUp.appointmentId
      ? await this.prisma.appointment.findFirst({
          where: { id: followUp.appointmentId, organizationId: actor.organizationId },
          select: { id: true, scheduledStart: true, status: true, doctorId: true },
        })
      : null;
    return { ...this.decorate(followUp), appointment };
  }

  async update(id: string, dto: UpdateFollowUpDto, actor: FollowUpActor) {
    const before = await this.findOne(id, actor);
    if (before.status === 'COMPLETED' && (dto.scheduledDate || dto.appointmentId !== undefined)) {
      throw new BadRequestException('A completed follow-up cannot be rescheduled');
    }
    const data: Prisma.FollowUpUncheckedUpdateInput = {};
    if (dto.reason !== undefined) data.reason = dto.reason;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.doctorId !== undefined) {
      await this.tenant.user(dto.doctorId, actor.organizationId, { label: 'Doctor' });
      data.doctorId = dto.doctorId;
    }
    if (dto.scheduledDate) {
      data.scheduledDate = new Date(dto.scheduledDate);
      // Rescheduling re-opens a missed/cancelled follow-up and restarts reminders.
      if (before.status === 'MISSED' || before.status === 'CANCELLED') data.status = FOLLOW_UP_STATUS.PENDING;
      data.reminderCount = 0;
      data.lastRemindedAt = null;
    }
    if (dto.appointmentId !== undefined) {
      if (dto.appointmentId) {
        await this.assertAppointmentFor(dto.appointmentId, before.patientId, actor);
        data.appointmentId = dto.appointmentId;
        data.status = FOLLOW_UP_STATUS.SCHEDULED;
      } else {
        data.appointmentId = null;
        if (before.status === 'SCHEDULED') data.status = FOLLOW_UP_STATUS.PENDING;
      }
    }
    await this.prisma.followUp.update({ where: { id }, data });
    if (dto.scheduledDate || data.status) {
      await this.audit.log({
        organizationId: actor.organizationId,
        userId: actor.id,
        action: dto.scheduledDate ? 'FOLLOW_UP_RESCHEDULED' : 'FOLLOW_UP_UPDATED',
        resource: 'FollowUp',
        resourceId: id,
        beforeData: { scheduledDate: before.scheduledDate, status: before.status, appointmentId: before.appointmentId },
        afterData: { scheduledDate: data.scheduledDate, status: data.status, appointmentId: data.appointmentId },
      });
    }
    return this.findOne(id, actor);
  }

  async updateStatus(id: string, status: FollowUpStatus, actor: FollowUpActor) {
    const before = await this.findOne(id, actor);
    if (before.status === status) return before;
    if (!FOLLOW_UP_TRANSITIONS[before.status].includes(status)) {
      throw new BadRequestException(`Cannot change a ${before.status} follow-up to ${status}`);
    }
    await this.prisma.followUp.update({ where: { id }, data: { status } });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'FOLLOW_UP_STATUS_CHANGED',
      resource: 'FollowUp',
      resourceId: id,
      beforeData: { status: before.status },
      afterData: { status },
    });
    if (status === 'MISSED') {
      await this.automation.ensureMissedFollowUpTask(this.prisma, {
        ...before,
        patient: before.patient,
      });
    }
    if (status === 'COMPLETED' || status === 'MISSED') {
      await this.timeline.record({
        organizationId: actor.organizationId,
        patientId: before.patientId,
        eventType: status === 'COMPLETED' ? 'FOLLOW_UP_COMPLETED' : 'FOLLOW_UP_MISSED',
        eventCategory: 'FOLLOW_UP',
        title: status === 'COMPLETED' ? 'Follow-up completed' : 'Follow-up missed',
        metadata: { followUpId: id },
        createdBy: actor.id,
      });
    }
    return this.findOne(id, actor);
  }

  async addOutcome(id: string, dto: AddFollowUpOutcomeDto, actor: FollowUpActor) {
    const followUp = await this.findOne(id, actor);
    const outcome = await this.prisma.followUpOutcome.create({
      data: {
        organizationId: actor.organizationId,
        branchId: followUp.branchId,
        followUpId: id,
        outcomeType: dto.outcomeType,
        remarks: dto.remarks,
      },
    });
    await this.timeline.record({
      organizationId: actor.organizationId,
      patientId: followUp.patientId,
      eventType: 'FOLLOW_UP_OUTCOME',
      eventCategory: 'FOLLOW_UP',
      title: `Follow-up outcome: ${dto.outcomeType.replace(/_/g, ' ').toLowerCase()}`,
      description: dto.remarks,
      metadata: { followUpId: id, outcomeId: outcome.id },
      createdBy: actor.id,
    });
    if (dto.complete && followUp.status !== 'COMPLETED') {
      await this.updateStatus(id, FOLLOW_UP_STATUS.COMPLETED, actor);
    }
    return outcome;
  }

  /** Doctors of the active branch, for list filters. */
  doctors(actor: FollowUpActor) {
    return this.prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { name: 'Doctor' } } },
      },
      select: { id: true, firstName: true, lastName: true, specialization: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  /**
   * Compliance for follow-ups scheduled in [from, to] (default: 90 days either side of today):
   * completion / missed rate among resolved or past-due follow-ups, plus the
   * at-risk list = missed follow-ups whose patient has no later appointment.
   */
  async metrics(query: FollowUpMetricsQueryDto, actor: FollowUpActor) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : new Date(now.getTime() + 90 * 24 * 3600_000);
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 90 * 24 * 3600_000);
    if (from > to) throw new BadRequestException('from must be before to');
    const base: Prisma.FollowUpWhereInput = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      ...(query.doctorId ? { doctorId: query.doctorId } : {}),
    };

    const [byStatus, openPastDue, overdue, upcoming7d, missedRows] = await Promise.all([
      this.prisma.followUp.groupBy({
        by: ['status'],
        where: { ...base, scheduledDate: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.followUp.count({
        where: { ...base, ...openStatusWhere(), scheduledDate: { gte: from, lte: to < now ? to : now } },
      }),
      this.prisma.followUp.count({ where: { ...base, ...openStatusWhere(), scheduledDate: { lt: now } } }),
      this.prisma.followUp.count({
        where: {
          ...base,
          ...openStatusWhere(),
          scheduledDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 3600_000) },
        },
      }),
      this.prisma.followUp.findMany({
        where: { ...base, status: FOLLOW_UP_STATUS.MISSED },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { scheduledDate: 'desc' },
        take: 500,
      }),
    ]);

    const counts: Record<FollowUpStatus, number> = { PENDING: 0, SCHEDULED: 0, COMPLETED: 0, MISSED: 0, CANCELLED: 0 };
    for (const row of byStatus) counts[normalizeFollowUpStatus(row.status)] += row._count._all;
    // Denominator: follow-ups that are resolved (completed / missed) or already past due.
    const dueTotal = counts.COMPLETED + counts.MISSED + openPastDue;

    // At-risk: latest missed follow-up per patient with no later (non-cancelled) appointment.
    const latestMissed = new Map<string, (typeof missedRows)[number]>();
    for (const f of missedRows) if (!latestMissed.has(f.patientId)) latestMissed.set(f.patientId, f);
    const patientIds = [...latestMissed.keys()];
    const laterAppointments = patientIds.length
      ? await this.prisma.appointment.findMany({
          where: {
            organizationId: actor.organizationId,
            patientId: { in: patientIds },
            deletedAt: null,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
          select: { patientId: true, scheduledStart: true },
        })
      : [];
    const atRisk = [...latestMissed.values()]
      .filter(
        (f) => !laterAppointments.some((a) => a.patientId === f.patientId && a.scheduledStart > f.scheduledDate),
      )
      .map((f) => ({
        followUpId: f.id,
        patient: f.patient,
        doctor: f.doctor,
        missedDate: f.scheduledDate,
        reason: f.reason,
        daysSinceMissed: Math.max(0, Math.floor((now.getTime() - f.scheduledDate.getTime()) / (24 * 3600_000))),
      }));

    return {
      range: { from, to },
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      byStatus: counts,
      due: dueTotal,
      completionRate: pct(counts.COMPLETED, dueTotal),
      missedRate: pct(counts.MISSED, dueTotal),
      overdue,
      upcoming7d,
      atRiskCount: atRisk.length,
      atRiskPatients: atRisk.slice(0, 50),
    };
  }
}
