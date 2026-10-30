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
import { assertUuid, isUuid } from '../common/validation/uuid';
import { DATE_RE, isValidDateOnly, addDays, toMinutes, zonedTimeToUtc } from '../clinic-settings/timezone';
import { DOCTOR_ROLE, can, type ReqUser } from '../clinic-settings/request-user';
import { FREE_STATUSES, ScheduleService } from './schedule.service';
import {
  AvailabilityBlockDto,
  CreateLeaveDto,
  ListDoctorsQueryDto,
  ListLeavesQueryDto,
  PutAvailabilityDto,
  SlotsQueryDto,
  UpdateAvailabilityBlockDto,
  UpdateDoctorProfileDto,
  UpdateLeaveDto,
} from './dto';

export const DOCTOR_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  status: true,
  qualification: true,
  specialization: true,
  registrationNumber: true,
  experienceYears: true,
  bio: true,
  consultationFee: true,
  signatureUrl: true,
} satisfies Prisma.UserSelect;

/**
 * Doctors are staff users holding the "Doctor" role. A doctor belongs to a
 * branch through their home branch, a Doctor role assignment in the branch, or
 * availability configured in the branch.
 *
 * Write access: `doctors.manage` for any doctor; `doctors.update_own` lets a
 * doctor manage only their own profile, availability and leave.
 */
@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schedule: ScheduleService,
  ) {}

  private branchWhere(branchId: string): Prisma.UserWhereInput {
    return {
      OR: [
        { branchId },
        { roles: { some: { branchId, role: { name: DOCTOR_ROLE } } } },
        { doctorAvailability: { some: { branchId } } },
      ],
    };
  }

  private doctorWhere(user: ReqUser): Prisma.UserWhereInput {
    return {
      organizationId: user.organizationId,
      status: 'ACTIVE',
      roles: { some: { role: { name: DOCTOR_ROLE, organizationId: user.organizationId } } },
    };
  }

  async list(user: ReqUser, q: ListDoctorsQueryDto) {
    const and: Prisma.UserWhereInput[] = [this.doctorWhere(user), this.branchWhere(user.branchId)];
    if (q.search) {
      and.push({
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' } },
          { lastName: { contains: q.search, mode: 'insensitive' } },
          { specialization: { contains: q.search, mode: 'insensitive' } },
        ],
      });
    }
    if (q.specialization) and.push({ specialization: { equals: q.specialization, mode: 'insensitive' } });
    return this.prisma.user.findMany({
      where: { AND: and },
      select: {
        ...DOCTOR_SELECT,
        doctorAvailability: {
          where: { branchId: user.branchId },
          select: { dayOfWeek: true, startTime: true, endTime: true, slotDuration: true },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  /** Doctor of the caller's organization (and active branch, for branch-level users), else 404. */
  async findDoctor(user: ReqUser, id: string) {
    assertUuid(id, 'doctorId');
    const and: Prisma.UserWhereInput[] = [{ id }, this.doctorWhere(user)];
    if (!user.orgWide) and.push(this.branchWhere(user.branchId));
    const doctor = await this.prisma.user.findFirst({ where: { AND: and }, select: DOCTOR_SELECT });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  /** Enforces doctors.manage, or doctors.update_own on the caller's own record. */
  assertCanManage(user: ReqUser, doctorId: string) {
    if (can(user, 'doctors.manage')) return;
    if (can(user, 'doctors.update_own') && doctorId === user.id) return;
    throw new ForbiddenException('You can only manage your own doctor profile, availability and leave');
  }

  async get(user: ReqUser, id: string) {
    const doctor = await this.findDoctor(user, id);
    const [availability, leaves] = await Promise.all([
      this.listAvailability(user, id, doctor),
      this.prisma.doctorLeave.findMany({
        where: { organizationId: user.organizationId, doctorId: id, endDate: { gte: new Date() } },
        orderBy: { startDate: 'asc' },
      }),
    ]);
    const timezone = await this.schedule.branchTimezone(user.organizationId, user.branchId);
    return { ...doctor, availability, upcomingLeaves: leaves, timezone };
  }

  async updateProfile(user: ReqUser, id: string, dto: UpdateDoctorProfileDto) {
    this.assertCanManage(user, id);
    const before = await this.findDoctor(user, id);
    const data: Prisma.UserUpdateInput = { updatedBy: user.id };
    for (const key of ['qualification', 'specialization', 'registrationNumber', 'experienceYears', 'bio', 'signatureUrl', 'phone'] as const) {
      if (dto[key] !== undefined) (data as any)[key] = dto[key];
    }
    if (dto.consultationFee !== undefined) data.consultationFee = new Prisma.Decimal(dto.consultationFee);
    const after = await this.prisma.user.update({ where: { id: before.id }, data, select: DOCTOR_SELECT });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'doctor_profile',
      resourceId: id,
      beforeData: before,
      afterData: after,
    });
    return after;
  }

  // ------------------------------------------------------------ availability
  async listAvailability(user: ReqUser, doctorId: string, known?: unknown) {
    if (!known) await this.findDoctor(user, doctorId);
    return this.prisma.doctorAvailability.findMany({
      where: { organizationId: user.organizationId, branchId: user.branchId, doctorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  private validateBlocks(blocks: Array<{ id?: string; dayOfWeek: number; startTime: string; endTime: string }>) {
    for (const b of blocks) {
      if (toMinutes(b.startTime) >= toMinutes(b.endTime)) {
        throw new BadRequestException(`startTime must be before endTime (${b.startTime}-${b.endTime})`);
      }
    }
    const byDay = new Map<number, typeof blocks>();
    for (const b of blocks) byDay.set(b.dayOfWeek, [...(byDay.get(b.dayOfWeek) ?? []), b]);
    for (const [day, list] of byDay) {
      const sorted = [...list].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        if (toMinutes(sorted[i].startTime) < toMinutes(sorted[i - 1].endTime)) {
          throw new BadRequestException(
            `Availability blocks overlap on day ${day} (${sorted[i - 1].startTime}-${sorted[i - 1].endTime} and ${sorted[i].startTime}-${sorted[i].endTime})`,
          );
        }
      }
    }
  }

  /** Replaces the doctor's weekly schedule in the active branch. */
  async putAvailability(user: ReqUser, doctorId: string, dto: PutAvailabilityDto) {
    this.assertCanManage(user, doctorId);
    await this.findDoctor(user, doctorId);
    this.validateBlocks(dto.blocks);
    const where = { organizationId: user.organizationId, branchId: user.branchId, doctorId };
    const before = await this.prisma.doctorAvailability.findMany({ where });
    await this.prisma.$transaction([
      this.prisma.doctorAvailability.deleteMany({ where }),
      this.prisma.doctorAvailability.createMany({
        data: dto.blocks.map((b) => ({ ...where, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime, slotDuration: b.slotDuration })),
      }),
    ]);
    const after = await this.listAvailability(user, doctorId, true);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'doctor_availability',
      resourceId: doctorId,
      beforeData: before,
      afterData: after,
    });
    return after;
  }

  async addAvailability(user: ReqUser, doctorId: string, dto: AvailabilityBlockDto) {
    this.assertCanManage(user, doctorId);
    await this.findDoctor(user, doctorId);
    const existing = await this.listAvailability(user, doctorId, true);
    this.validateBlocks([...existing, dto]);
    return this.prisma.doctorAvailability.create({
      data: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        doctorId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotDuration: dto.slotDuration,
      },
    });
  }

  private async findBlock(user: ReqUser, doctorId: string, blockId: string) {
    assertUuid(blockId, 'availabilityId');
    const row = await this.prisma.doctorAvailability.findFirst({
      where: { id: blockId, doctorId, organizationId: user.organizationId, branchId: user.branchId },
    });
    if (!row) throw new NotFoundException('Availability block not found');
    return row;
  }

  async updateAvailability(user: ReqUser, doctorId: string, blockId: string, dto: UpdateAvailabilityBlockDto) {
    this.assertCanManage(user, doctorId);
    await this.findDoctor(user, doctorId);
    const row = await this.findBlock(user, doctorId, blockId);
    const merged = { ...row, ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) };
    const others = (await this.listAvailability(user, doctorId, true)).filter((b) => b.id !== row.id);
    this.validateBlocks([...others, merged]);
    return this.prisma.doctorAvailability.update({
      where: { id: row.id },
      data: { dayOfWeek: merged.dayOfWeek, startTime: merged.startTime, endTime: merged.endTime, slotDuration: merged.slotDuration },
    });
  }

  async deleteAvailability(user: ReqUser, doctorId: string, blockId: string) {
    this.assertCanManage(user, doctorId);
    await this.findDoctor(user, doctorId);
    const row = await this.findBlock(user, doctorId, blockId);
    await this.prisma.doctorAvailability.delete({ where: { id: row.id } });
    return { id: row.id, deleted: true };
  }

  // ------------------------------------------------------------------ leaves
  async listLeaves(user: ReqUser, doctorId: string, q: ListLeavesQueryDto) {
    await this.findDoctor(user, doctorId);
    let from: Date | undefined;
    if (q.from) {
      const tz = await this.schedule.branchTimezone(user.organizationId, user.branchId);
      from = zonedTimeToUtc(q.from, '00:00', tz);
    }
    return this.prisma.doctorLeave.findMany({
      where: { organizationId: user.organizationId, doctorId, ...(from ? { endDate: { gte: from } } : {}) },
      orderBy: { startDate: 'asc' },
    });
  }

  /** Date-only values are whole days in the branch timezone; end is inclusive. */
  private async parseLeaveRange(user: ReqUser, startRaw: string, endRaw: string) {
    const tz = await this.schedule.branchTimezone(user.organizationId, user.branchId);
    const parse = (v: string, isEnd: boolean, name: string) => {
      if (DATE_RE.test(v)) {
        if (!isValidDateOnly(v)) throw new BadRequestException(`${name} is not a valid date`);
        return isEnd ? zonedTimeToUtc(addDays(v, 1), '00:00', tz) : zonedTimeToUtc(v, '00:00', tz);
      }
      const d = new Date(v);
      if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(v)) {
        throw new BadRequestException(`${name} must be YYYY-MM-DD or an ISO date-time`);
      }
      return d;
    };
    const start = parse(startRaw, false, 'startDate');
    const end = parse(endRaw, true, 'endDate');
    if (end <= start) throw new BadRequestException('endDate must be after startDate');
    if (end.getTime() - start.getTime() > 366 * 86400000) throw new BadRequestException('Leave cannot exceed one year');
    return { start, end };
  }

  private async assertNoLeaveOverlap(user: ReqUser, doctorId: string, start: Date, end: Date, exceptId?: string) {
    const clash = await this.prisma.doctorLeave.findFirst({
      where: {
        organizationId: user.organizationId,
        doctorId,
        startDate: { lt: end },
        endDate: { gt: start },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException('This leave overlaps an existing leave');
  }

  private async conflictingAppointments(user: ReqUser, doctorId: string, start: Date, end: Date) {
    return this.prisma.appointment.count({
      where: {
        organizationId: user.organizationId,
        doctorId,
        status: { notIn: [...FREE_STATUSES, 'COMPLETED'] },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
    });
  }

  async createLeave(user: ReqUser, doctorId: string, dto: CreateLeaveDto) {
    this.assertCanManage(user, doctorId);
    await this.findDoctor(user, doctorId);
    const { start, end } = await this.parseLeaveRange(user, dto.startDate, dto.endDate);
    await this.assertNoLeaveOverlap(user, doctorId, start, end);
    const leave = await this.prisma.doctorLeave.create({
      data: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        doctorId,
        startDate: start,
        endDate: end,
        reason: dto.reason,
        createdBy: user.id,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'doctor_leave',
      resourceId: leave.id,
      afterData: leave,
    });
    return { ...leave, conflictingAppointments: await this.conflictingAppointments(user, doctorId, start, end) };
  }

  private async findLeave(user: ReqUser, doctorId: string, leaveId: string) {
    if (!isUuid(leaveId)) throw new BadRequestException('leaveId must be a valid UUID');
    const row = await this.prisma.doctorLeave.findFirst({ where: { id: leaveId, doctorId, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Leave not found');
    return row;
  }

  async updateLeave(user: ReqUser, doctorId: string, leaveId: string, dto: UpdateLeaveDto) {
    this.assertCanManage(user, doctorId);
    await this.findDoctor(user, doctorId);
    const row = await this.findLeave(user, doctorId, leaveId);
    let start = row.startDate;
    let end = row.endDate;
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const range = await this.parseLeaveRange(
        user,
        dto.startDate ?? row.startDate.toISOString(),
        dto.endDate ?? row.endDate.toISOString(),
      );
      start = range.start;
      end = range.end;
      await this.assertNoLeaveOverlap(user, doctorId, start, end, row.id);
    }
    const leave = await this.prisma.doctorLeave.update({
      where: { id: row.id },
      data: { startDate: start, endDate: end, ...(dto.reason !== undefined ? { reason: dto.reason } : {}) },
    });
    return { ...leave, conflictingAppointments: await this.conflictingAppointments(user, doctorId, start, end) };
  }

  async deleteLeave(user: ReqUser, doctorId: string, leaveId: string) {
    this.assertCanManage(user, doctorId);
    await this.findDoctor(user, doctorId);
    const row = await this.findLeave(user, doctorId, leaveId);
    await this.prisma.doctorLeave.delete({ where: { id: row.id } });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'DELETE',
      resource: 'doctor_leave',
      resourceId: row.id,
      beforeData: row,
    });
    return { id: row.id, deleted: true };
  }

  // ------------------------------------------------------------------- slots
  async slots(user: ReqUser, doctorId: string, q: SlotsQueryDto) {
    await this.findDoctor(user, doctorId);
    if (q.excludeAppointmentId) assertUuid(q.excludeAppointmentId, 'excludeAppointmentId');
    return this.schedule.getSlots(user.organizationId, user.branchId, doctorId, q.date, {
      duration: q.duration,
      excludeAppointmentId: q.excludeAppointmentId,
    });
  }
}
