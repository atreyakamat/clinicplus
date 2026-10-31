import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { assertUuid } from '../common/validation/uuid';
import { pageArgs, paginated } from '../common/pagination';
import { ScheduleService, FREE_STATUSES } from '../doctors/schedule.service';
import { QueuesService } from '../queues/queues.service';
import { addDays, isValidDateOnly, zonedTimeToUtc } from '../clinic-settings/timezone';
import { DOCTOR_ROLE, can, hasRole, type ReqUser } from '../clinic-settings/request-user';
import {
  APPOINTMENT_STATUSES,
  AppointmentStatusValue,
  CreateAppointmentDto,
  CreateWaitlistDto,
  ListAppointmentsQueryDto,
  ListWaitlistQueryDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
  UpdateWaitlistDto,
} from './dto/create-appointment.dto';

/**
 * Appointment lifecycle:
 *
 *   SCHEDULED ─┬─> CONFIRMED ─┬─> CHECKED_IN ─> IN_PROGRESS ─> COMPLETED
 *              │              │        └──────────────────────> COMPLETED
 *              └──────────────┴─> CANCELLED (any non-final state) / NO_SHOW (after start time, not yet arrived)
 *
 * COMPLETED, CANCELLED and NO_SHOW are final. Reschedule is allowed while
 * SCHEDULED or CONFIRMED and returns the appointment to SCHEDULED.
 */
export const TRANSITIONS: Record<AppointmentStatusValue, AppointmentStatusValue[]> = {
  SCHEDULED: ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const MAX_DURATION_MS = 8 * 60 * 60 * 1000;

const LIST_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true, patientCode: true } },
  doctor: { select: { id: true, firstName: true, lastName: true, specialization: true } },
} satisfies Prisma.AppointmentInclude;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tenant: TenantAssertService,
    private readonly schedule: ScheduleService,
    private readonly queues: QueuesService,
  ) {}

  /**
   * Doctors (role "Doctor" without front-desk `appointments.create`) may only
   * change appointments where they are the treating doctor.
   */
  private assertMayModify(user: ReqUser, appointment: { doctorId: string }) {
    if (hasRole(user, DOCTOR_ROLE) && !can(user, 'appointments.create') && appointment.doctorId !== user.id) {
      throw new ForbiddenException('Doctors can only update their own appointments');
    }
  }

  private parseRange(startRaw: string, endRaw: string) {
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('scheduledStart and scheduledEnd must be valid date-times');
    }
    if (end <= start) throw new BadRequestException('scheduledEnd must be after scheduledStart');
    if (end.getTime() - start.getTime() > MAX_DURATION_MS) {
      throw new BadRequestException('An appointment cannot be longer than 8 hours');
    }
    if (start < new Date()) throw new BadRequestException('Cannot book an appointment in the past');
    return { start, end };
  }

  /** Schedule + double-booking validation. Must run inside the doctor's advisory lock. */
  private async validateSlot(
    tx: Prisma.TransactionClient,
    user: ReqUser,
    doctorId: string,
    start: Date,
    end: Date,
    force: boolean | undefined,
    excludeId?: string,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'appt:' + doctorId}))`;
    const overlapping = await tx.appointment.findFirst({
      where: {
        organizationId: user.organizationId,
        doctorId,
        status: { notIn: [...FREE_STATUSES] },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (overlapping) throw new ConflictException('Doctor is already booked for this time slot');

    const issues = await this.schedule.scheduleIssues(user.organizationId, user.branchId, doctorId, start, end);
    if (issues.length === 0) return [];
    if (!force) {
      const hint = can(user, 'appointments.update') ? ' Resend with "force": true to book anyway.' : '';
      throw new ConflictException(`Slot not available: ${issues.join('; ')}.${hint}`);
    }
    if (!can(user, 'appointments.update')) {
      throw new ForbiddenException('Overriding the schedule requires the appointments.update permission');
    }
    return issues;
  }

  async create(user: ReqUser, dto: CreateAppointmentDto) {
    const { start, end } = this.parseRange(dto.scheduledStart, dto.scheduledEnd);
    await this.tenant.patient(dto.patientId, user.organizationId);
    await this.tenant.user(dto.doctorId, user.organizationId, { role: DOCTOR_ROLE, label: 'Doctor' });

    const { appointment, overridden } = await this.prisma.$transaction(async (tx) => {
      const overridden = await this.validateSlot(tx, user, dto.doctorId, start, end, dto.force);
      const appointment = await tx.appointment.create({
        data: {
          organizationId: user.organizationId,
          branchId: user.branchId,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          scheduledStart: start,
          scheduledEnd: end,
          appointmentType: dto.appointmentType,
          appointmentSource: dto.appointmentSource ?? 'FRONT_DESK',
          notes: dto.notes,
          status: 'SCHEDULED',
          createdBy: user.id,
        },
      });
      return { appointment, overridden };
    });

    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'appointment',
      resourceId: appointment.id,
      afterData: { ...appointment, ...(overridden.length ? { scheduleOverride: overridden } : {}) },
    });
    return { ...appointment, ...(overridden.length ? { scheduleOverride: overridden } : {}) };
  }

  private async buildWhere(user: ReqUser, q: ListAppointmentsQueryDto) {
    const where: Prisma.AppointmentWhereInput = { organizationId: user.organizationId, branchId: user.branchId };
    if (q.doctorId) where.doctorId = q.doctorId;
    if (q.patientId) where.patientId = q.patientId;

    if (q.status) {
      const statuses = q.status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const bad = statuses.filter((s) => !(APPOINTMENT_STATUSES as readonly string[]).includes(s));
      if (bad.length) throw new BadRequestException(`Unknown status: ${bad.join(', ')}`);
      where.status = { in: statuses as AppointmentStatusValue[] };
    } else if (q.includeCancelled !== 'true') {
      where.status = { not: 'CANCELLED' };
    }

    if (q.date || q.from || q.to) {
      const tz = await this.schedule.branchTimezone(user.organizationId, user.branchId);
      const parse = (v: string, isEnd: boolean, name: string) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          if (!isValidDateOnly(v)) throw new BadRequestException(`${name} is not a valid date`);
          return zonedTimeToUtc(isEnd ? addDays(v, 1) : v, '00:00', tz);
        }
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) throw new BadRequestException(`${name} must be YYYY-MM-DD or an ISO date-time`);
        return d;
      };
      const range: Prisma.DateTimeFilter = {};
      if (q.date) {
        range.gte = parse(q.date, false, 'date');
        range.lt = parse(q.date, true, 'date');
      }
      if (q.from) range.gte = parse(q.from, false, 'from');
      if (q.to) range.lt = parse(q.to, true, 'to');
      where.scheduledStart = range;
    }
    return where;
  }

  async findAll(user: ReqUser, q: ListAppointmentsQueryDto = {} as ListAppointmentsQueryDto) {
    const where = await this.buildWhere(user, q);
    const { page, limit, skip, take } = pageArgs(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { scheduledStart: q.order ?? 'asc' },
        skip,
        take,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  async exportRows(user: ReqUser, q: ListAppointmentsQueryDto) {
    const where = await this.buildWhere(user, q);
    return this.prisma.appointment.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: { scheduledStart: 'asc' },
      take: 10000,
    });
  }

  async findOne(user: ReqUser, id: string) {
    assertUuid(id, 'id');
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, patientCode: true, gender: true, dateOfBirth: true } },
        doctor: { select: { id: true, firstName: true, lastName: true, specialization: true } },
        queueEntries: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  private async load(user: ReqUser, id: string) {
    assertUuid(id, 'id');
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  /** Applies a status transition, keeping today's queue entry in sync. */
  async transition(user: ReqUser, id: string, to: AppointmentStatusValue, opts: { reason?: string } = {}) {
    const before = await this.load(user, id);
    this.assertMayModify(user, before);
    const from = before.status as AppointmentStatusValue;
    if (from === to) return before;
    if (!TRANSITIONS[from].includes(to)) {
      throw new ConflictException(`Cannot change an appointment from ${from} to ${to}`);
    }
    if (to === 'NO_SHOW' && before.scheduledStart > new Date()) {
      throw new ConflictException('An appointment can only be marked no-show after its start time');
    }
    if (to === 'CHECKED_IN') {
      await this.queues.checkIn(user, { appointmentId: id });
      return this.load(user, id);
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: to,
          updatedBy: user.id,
          ...(to === 'CANCELLED' ? { cancellationReason: opts.reason ?? null } : {}),
        },
      });
      const entryStatus =
        to === 'CANCELLED' || to === 'NO_SHOW' ? 'CANCELLED' : to === 'COMPLETED' ? 'COMPLETED' : to === 'IN_PROGRESS' ? 'IN_PROGRESS' : null;
      if (entryStatus) {
        await tx.queueEntry.updateMany({
          where: { appointmentId: id, organizationId: user.organizationId, status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS'] } },
          data: { status: entryStatus, ...(entryStatus === 'COMPLETED' ? { completedTime: new Date() } : {}) },
        });
      }
      return updated;
    });

    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: `STATUS_${to}`,
      resource: 'appointment',
      resourceId: id,
      beforeData: { status: from },
      afterData: { status: to, ...(opts.reason ? { reason: opts.reason } : {}) },
    });
    return appointment;
  }

  async update(user: ReqUser, id: string, dto: UpdateAppointmentDto) {
    const before = await this.load(user, id);
    this.assertMayModify(user, before);
    const data: Prisma.AppointmentUpdateInput = {};
    if (dto.appointmentType !== undefined) data.appointmentType = dto.appointmentType;
    if (dto.appointmentSource !== undefined) data.appointmentSource = dto.appointmentSource;
    if (dto.notes !== undefined) data.notes = dto.notes;
    let appointment = before;
    if (Object.keys(data).length) {
      appointment = await this.prisma.appointment.update({ where: { id }, data: { ...data, updatedBy: user.id } });
      await this.auditService.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'UPDATE',
        resource: 'appointment',
        resourceId: id,
        beforeData: before,
        afterData: appointment,
      });
    }
    if (dto.status && dto.status !== appointment.status) {
      if (dto.status === 'CANCELLED' && !can(user, 'appointments.delete')) {
        throw new ForbiddenException('Cancelling appointments requires the appointments.delete permission');
      }
      appointment = await this.transition(user, id, dto.status, { reason: dto.cancellationReason });
    }
    return appointment;
  }

  async reschedule(user: ReqUser, id: string, dto: RescheduleAppointmentDto) {
    const before = await this.load(user, id);
    this.assertMayModify(user, before);
    if (!['SCHEDULED', 'CONFIRMED'].includes(before.status)) {
      throw new ConflictException(`Cannot reschedule an appointment that is ${before.status}`);
    }
    const { start, end } = this.parseRange(dto.scheduledStart, dto.scheduledEnd);
    const doctorId = dto.doctorId ?? before.doctorId;
    if (doctorId !== before.doctorId) {
      await this.tenant.user(doctorId, user.organizationId, { role: DOCTOR_ROLE, label: 'Doctor' });
      // A doctor without front-desk rights cannot hand appointments to colleagues.
      this.assertMayModify(user, { doctorId });
    }
    const { appointment, overridden } = await this.prisma.$transaction(async (tx) => {
      const overridden = await this.validateSlot(tx, user, doctorId, start, end, dto.force, id);
      const appointment = await tx.appointment.update({
        where: { id },
        data: { scheduledStart: start, scheduledEnd: end, doctorId, status: 'SCHEDULED', updatedBy: user.id },
      });
      return { appointment, overridden };
    });
    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'RESCHEDULE',
      resource: 'appointment',
      resourceId: id,
      beforeData: { scheduledStart: before.scheduledStart, scheduledEnd: before.scheduledEnd, doctorId: before.doctorId, status: before.status },
      afterData: {
        scheduledStart: start,
        scheduledEnd: end,
        doctorId,
        ...(dto.reason ? { reason: dto.reason } : {}),
        ...(overridden.length ? { scheduleOverride: overridden } : {}),
      },
    });
    return appointment;
  }

  /** DELETE = cancel (appointments are never hard-deleted). */
  async remove(user: ReqUser, id: string, reason?: string) {
    return this.transition(user, id, 'CANCELLED', { reason });
  }

  // ---------------------------------------------------------------- waitlist
  async listWaitlist(user: ReqUser, q: ListWaitlistQueryDto) {
    return this.prisma.waitingList.findMany({
      where: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        ...(q.doctorId ? { doctorId: q.doctorId } : {}),
        ...(q.status ? { status: q.status } : q.includeClosed === 'true' ? {} : { status: { in: ['WAITING', 'CONTACTED'] } }),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async addToWaitlist(user: ReqUser, dto: CreateWaitlistDto) {
    await this.tenant.patient(dto.patientId, user.organizationId);
    await this.tenant.user(dto.doctorId, user.organizationId, { role: DOCTOR_ROLE, label: 'Doctor' });
    if (dto.preferredDate && !isValidDateOnly(dto.preferredDate)) {
      throw new BadRequestException('preferredDate is not a valid date');
    }
    const dup = await this.prisma.waitingList.findFirst({
      where: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        status: { in: ['WAITING', 'CONTACTED'] },
      },
    });
    if (dup) throw new ConflictException('Patient is already on the waitlist for this doctor');
    return this.prisma.waitingList.create({
      data: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        preferredDate: dto.preferredDate ? new Date(`${dto.preferredDate}T00:00:00.000Z`) : null,
        status: 'WAITING',
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  private async findWaitlist(user: ReqUser, id: string) {
    assertUuid(id, 'id');
    const row = await this.prisma.waitingList.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
    });
    if (!row) throw new NotFoundException('Waitlist entry not found');
    return row;
  }

  async updateWaitlist(user: ReqUser, id: string, dto: UpdateWaitlistDto) {
    const row = await this.findWaitlist(user, id);
    return this.prisma.waitingList.update({ where: { id: row.id }, data: { status: dto.status } });
  }

  async removeFromWaitlist(user: ReqUser, id: string) {
    const row = await this.findWaitlist(user, id);
    await this.prisma.waitingList.delete({ where: { id: row.id } });
    return { id: row.id, deleted: true };
  }
}
