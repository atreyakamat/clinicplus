import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { assertUuid } from '../common/validation/uuid';
import { ScheduleService } from '../doctors/schedule.service';
import { localInfo } from '../clinic-settings/timezone';
import type { ReqUser } from '../clinic-settings/request-user';
import {
  CallNextDto,
  CheckInDto,
  PRIORITY_LEVELS,
  PriorityLevel,
  QueueStatus,
  ReorderDto,
  UpdateEntryDto,
  WalkInDto,
} from './dto';

/**
 * Ordering: `priority` is a sort key = level * PRIORITY_BAND + manual offset.
 * Level 2 = EMERGENCY, 1 = HIGH, 0 = NORMAL, so emergencies are always called
 * first. Manual reordering only changes the offset inside a level. Ties are
 * broken by token number (arrival order).
 */
export const PRIORITY_BAND = 10000;

export function priorityLevel(priority: number): PriorityLevel {
  const level = Math.max(0, Math.min(2, Math.floor(priority / PRIORITY_BAND)));
  return PRIORITY_LEVELS[level];
}

export function priorityValue(level: PriorityLevel = 'NORMAL') {
  return PRIORITY_LEVELS.indexOf(level) * PRIORITY_BAND;
}

const ACTIVE: QueueStatus[] = ['WAITING', 'CALLED', 'IN_PROGRESS'];

const TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  WAITING: ['CALLED', 'IN_PROGRESS', 'CANCELLED'],
  CALLED: ['WAITING', 'IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const ORDER: Prisma.QueueEntryOrderByWithRelationInput[] = [{ priority: 'desc' }, { tokenNumber: 'asc' }];

type Db = PrismaService | Prisma.TransactionClient;

const ENTRY_INCLUDE = {
  appointment: {
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      appointmentType: true,
      patient: { select: { id: true, firstName: true, lastName: true, phone: true, patientCode: true } },
      doctor: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.QueueEntryInclude;

type EntryRow = Prisma.QueueEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;
type DecoratedEntry = EntryRow & { priorityLevel: PriorityLevel };


@Injectable()
export class QueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantAssertService,
    private readonly schedule: ScheduleService,
  ) {}

  /** One queue per branch per local calendar day, so token numbers restart daily. */
  private async today(user: Pick<ReqUser, 'organizationId' | 'branchId'>) {
    const tz = await this.schedule.branchTimezone(user.organizationId, user.branchId);
    const date = localInfo(new Date(), tz).date;
    return { tz, date, name: `Daily queue ${date}` };
  }

  private decorate<T extends { priority: number }>(entry: T) {
    return { ...entry, priorityLevel: priorityLevel(entry.priority) };
  }



  async getLiveQueue(user: ReqUser) {
    const { date, name, tz } = await this.today(user);
    const queue = await this.prisma.queue.findFirst({
      where: { organizationId: user.organizationId, branchId: user.branchId, name },
    });
    if (!queue) return { id: null, name, date, timezone: tz, entries: [] as DecoratedEntry[], completed: [] as DecoratedEntry[] };
    const [entries, completed] = await Promise.all([
      this.prisma.queueEntry.findMany({
        where: { queueId: queue.id, status: { in: ACTIVE } },
        include: ENTRY_INCLUDE,
        orderBy: ORDER,
      }),
      this.prisma.queueEntry.findMany({
        where: { queueId: queue.id, status: { in: ['COMPLETED', 'CANCELLED'] } },
        include: ENTRY_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      ...queue,
      date,
      timezone: tz,
      entries: entries.map((e) => this.decorate(e)),
      completed: completed.map((e) => this.decorate(e)),
    };
  }

  /** Minimal, privacy-preserving payload for a waiting-room TV (first name + last initial only). */
  async getDisplay(user: ReqUser) {
    const live = await this.getLiveQueue(user);
    const branch = await this.prisma.branch.findFirst({
      where: { id: user.branchId, organizationId: user.organizationId },
      select: { name: true, organization: { select: { name: true, logoUrl: true } } },
    });
    const label = (p?: { firstName: string; lastName: string } | null) =>
      p ? `${p.firstName} ${p.lastName ? p.lastName[0] + '.' : ''}`.trim() : '';
    const doctor = (d?: { firstName: string; lastName: string } | null) => (d ? `Dr. ${d.firstName} ${d.lastName}` : '');
    const map = (e: (typeof live.entries)[number]) => ({
      token: e.tokenNumber,
      status: e.status,
      room: e.room,
      priorityLevel: e.priorityLevel,
      patient: label(e.appointment?.patient),
      doctor: doctor(e.appointment?.doctor),
      calledTime: e.calledTime,
    });
    return {
      clinic: branch?.organization?.name ?? '',
      logoUrl: branch?.organization?.logoUrl ?? null,
      branch: branch?.name ?? '',
      date: live.date,
      nowServing: live.entries.filter((e) => e.status !== 'WAITING').map(map),
      waiting: live.entries.filter((e) => e.status === 'WAITING').map(map),
      updatedAt: new Date().toISOString(),
    };
  }

  /** Serialises queue writes per branch (token numbers + daily queue creation). */
  private async lockBranch(tx: Prisma.TransactionClient, branchId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'queue:' + branchId}))`;
  }

  private async findOrCreateQueue(tx: Prisma.TransactionClient, user: ReqUser) {
    const { name } = await this.today(user);
    const existing = await tx.queue.findFirst({
      where: { organizationId: user.organizationId, branchId: user.branchId, name },
    });
    if (existing) return existing;
    return tx.queue.create({ data: { organizationId: user.organizationId, branchId: user.branchId, name } });
  }

  private async enqueue(
    tx: Prisma.TransactionClient,
    user: ReqUser,
    appointmentId: string,
    priority?: PriorityLevel,
    room?: string,
  ) {
    await this.lockBranch(tx, user.branchId);
    const active = await tx.queueEntry.findFirst({
      where: { appointmentId, organizationId: user.organizationId, status: { in: ACTIVE } },
    });
    if (active) throw new ConflictException(`Patient is already in the queue (token ${active.tokenNumber})`);
    const queue = await this.findOrCreateQueue(tx, user);
    const last = await tx.queueEntry.findFirst({ where: { queueId: queue.id }, orderBy: { tokenNumber: 'desc' } });
    const entry = await tx.queueEntry.create({
      data: {
        queueId: queue.id,
        appointmentId,
        organizationId: user.organizationId,
        branchId: user.branchId,
        tokenNumber: (last?.tokenNumber ?? 0) + 1,
        checkInTime: new Date(),
        status: 'WAITING',
        priority: priorityValue(priority),
        room: room || null,
      },
      include: ENTRY_INCLUDE,
    });
    await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'CHECKED_IN', updatedBy: user.id } });
    return entry;
  }

  /** Checks an appointment in: issues a token for today's queue and marks the appointment CHECKED_IN. */
  async checkIn(user: ReqUser, dto: CheckInDto) {
    const appointment = await this.tenant.appointment(dto.appointmentId, user.organizationId, user.branchId);
    if (!['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(appointment.status)) {
      throw new ConflictException(`Cannot check in an appointment that is ${appointment.status}`);
    }
    const entry = await this.prisma.$transaction((tx) =>
      this.enqueue(tx, user, appointment.id, dto.priority, dto.room),
    );
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CHECK_IN',
      resource: 'queue_entry',
      resourceId: entry.id,
      afterData: { appointmentId: appointment.id, tokenNumber: entry.tokenNumber, priority: dto.priority ?? 'NORMAL' },
    });
    return this.decorate(entry);
  }

  /** Walk-in / emergency: creates an appointment starting now and checks it in. */
  async walkIn(user: ReqUser, dto: WalkInDto) {
    await this.tenant.patient(dto.patientId, user.organizationId);
    await this.tenant.user(dto.doctorId, user.organizationId, { role: 'Doctor', label: 'Doctor' });
    const start = new Date();
    const end = new Date(start.getTime() + (dto.durationMinutes ?? 15) * 60000);
    const entry = await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          organizationId: user.organizationId,
          branchId: user.branchId,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          scheduledStart: start,
          scheduledEnd: end,
          appointmentSource: 'WALK_IN',
          appointmentType: dto.priority === 'EMERGENCY' ? 'EMERGENCY' : 'WALK_IN',
          notes: dto.notes,
          status: 'SCHEDULED',
          createdBy: user.id,
        },
      });
      return this.enqueue(tx, user, appointment.id, dto.priority, dto.room);
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'WALK_IN',
      resource: 'queue_entry',
      resourceId: entry.id,
      afterData: { appointmentId: entry.appointmentId, tokenNumber: entry.tokenNumber, priority: dto.priority ?? 'NORMAL' },
    });
    return this.decorate(entry);
  }

  private async findEntry(user: ReqUser, id: string, db: Db = this.prisma) {
    assertUuid(id, 'id');
    const entry = await db.queueEntry.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
      include: ENTRY_INCLUDE,
    });
    if (!entry) throw new NotFoundException('Queue entry not found');
    return entry;
  }

  async updateEntry(user: ReqUser, id: string, dto: UpdateEntryDto) {
    const entry = await this.findEntry(user, id);
    if (!ACTIVE.includes(entry.status as QueueStatus)) {
      throw new ConflictException(`Queue entry is ${entry.status}`);
    }
    const updated = await this.prisma.queueEntry.update({
      where: { id: entry.id },
      data: {
        ...(dto.priority ? { priority: priorityValue(dto.priority) } : {}),
        ...(dto.room !== undefined ? { room: dto.room || null } : {}),
      },
      include: ENTRY_INCLUDE,
    });
    return this.decorate(updated);
  }

  async updateStatus(user: ReqUser, id: string, status: QueueStatus) {
    const entry = await this.findEntry(user, id);
    const from = entry.status as QueueStatus;
    if (from === status) return this.decorate(entry);
    if (!TRANSITIONS[from].includes(status)) {
      throw new ConflictException(`Cannot change queue entry from ${from} to ${status}`);
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.queueEntry.update({
        where: { id: entry.id },
        data: {
          status,
          ...(status === 'CALLED' ? { calledTime: now } : {}),
          ...(status === 'IN_PROGRESS' && !entry.calledTime ? { calledTime: now } : {}),
          ...(status === 'COMPLETED' ? { completedTime: now } : {}),
        },
        include: ENTRY_INCLUDE,
      });
      const appt = entry.appointment;
      if (status === 'IN_PROGRESS' && ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(appt.status)) {
        await tx.appointment.update({ where: { id: appt.id }, data: { status: 'IN_PROGRESS', updatedBy: user.id } });
      }
      if (status === 'COMPLETED' && appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED') {
        await tx.appointment.update({ where: { id: appt.id }, data: { status: 'COMPLETED', updatedBy: user.id } });
      }
      return row;
    });
    return this.decorate(updated);
  }

  /** Calls the highest-priority waiting patient (optionally for one doctor) into a room. */
  async callNext(user: ReqUser, dto: CallNextDto) {
    const { name } = await this.today(user);
    const next = await this.prisma.queueEntry.findFirst({
      where: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        status: 'WAITING',
        queue: { name },
        ...(dto.doctorId ? { appointment: { doctorId: dto.doctorId } } : {}),
      },
      orderBy: ORDER,
    });
    if (!next) throw new NotFoundException('No patients waiting');
    const updated = await this.prisma.queueEntry.update({
      where: { id: next.id },
      data: { status: 'CALLED', calledTime: new Date(), ...(dto.room ? { room: dto.room } : {}) },
      include: ENTRY_INCLUDE,
    });
    return this.decorate(updated);
  }

  /** Reorders WAITING entries. Emergency/high/normal bands are preserved; order applies within each band. */
  async reorder(user: ReqUser, dto: ReorderDto) {
    if (new Set(dto.entryIds).size !== dto.entryIds.length) throw new BadRequestException('entryIds must be unique');
    const entries = await this.prisma.queueEntry.findMany({
      where: { id: { in: dto.entryIds }, organizationId: user.organizationId, branchId: user.branchId, status: 'WAITING' },
    });
    if (entries.length !== dto.entryIds.length) {
      throw new NotFoundException('One or more entries were not found or are no longer waiting');
    }
    const byId = new Map(entries.map((e) => [e.id, e]));
    const bands = new Map<number, string[]>();
    for (const id of dto.entryIds) {
      const level = PRIORITY_LEVELS.indexOf(priorityLevel(byId.get(id)!.priority));
      bands.set(level, [...(bands.get(level) ?? []), id]);
    }
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    for (const [level, ids] of bands) {
      ids.forEach((id, i) => {
        updates.push(
          this.prisma.queueEntry.update({ where: { id }, data: { priority: level * PRIORITY_BAND + Math.min(ids.length - i, PRIORITY_BAND - 1) } }),
        );
      });
    }
    await this.prisma.$transaction(updates);
    return this.getLiveQueue(user);
  }
}
