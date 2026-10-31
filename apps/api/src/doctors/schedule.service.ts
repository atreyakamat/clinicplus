import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  DAY_NAMES,
  addDays,
  dateOnlyToUtc,
  fromMinutes,
  isValidDateOnly,
  isValidTimezone,
  localInfo,
  toMinutes,
  zonedTimeToUtc,
} from '../clinic-settings/timezone';

/** Appointment statuses that do not occupy the doctor's time. */
export const FREE_STATUSES = ['CANCELLED', 'NO_SHOW'] as const;

export interface Slot {
  start: string;
  end: string;
  time: string;
  available: boolean;
  reason?: 'past' | 'booked' | 'leave';
}

export interface DaySlots {
  doctorId: string;
  date: string;
  dayOfWeek: number;
  timezone: string;
  closed: boolean;
  reason?: string;
  slots: Slot[];
}

/**
 * Scheduling rules shared by the slot finder and appointment validation.
 *
 * Rules (all evaluated in the branch timezone):
 *  - Clinic holidays (org-wide) block the whole day.
 *  - Branch working hours are enforced only once the branch has configured any;
 *    a weekday without a row is then a closed day. Breaks are excluded.
 *  - Doctor availability is enforced only once the doctor has any availability
 *    configured in the branch (so clinics can start booking before setup).
 *  - Doctor leave (any branch) blocks overlapping time.
 *  - Existing non-cancelled / non-no-show appointments of the doctor block time.
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  defaultTimezone() {
    const tz = this.config.get<string>('DEFAULT_TIMEZONE');
    return isValidTimezone(tz) ? tz : 'Asia/Kolkata';
  }

  async branchTimezone(organizationId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
      select: { timezone: true },
    });
    return isValidTimezone(branch?.timezone) ? branch!.timezone! : this.defaultTimezone();
  }

  async getSlots(
    organizationId: string,
    branchId: string,
    doctorId: string,
    date: string,
    opts: { duration?: number; excludeAppointmentId?: string; now?: Date } = {},
  ): Promise<DaySlots> {
    if (!isValidDateOnly(date)) throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    const tz = await this.branchTimezone(organizationId, branchId);
    const dow = dateOnlyToUtc(date).getUTCDay();
    const base: DaySlots = { doctorId, date, dayOfWeek: dow, timezone: tz, closed: false, slots: [] };
    const dayStart = zonedTimeToUtc(date, '00:00', tz);
    const dayEnd = zonedTimeToUtc(addDays(date, 1), '00:00', tz);

    const holiday = await this.prisma.clinicHoliday.findFirst({
      where: { organizationId, date: dateOnlyToUtc(date) },
    });
    if (holiday) return { ...base, closed: true, reason: `Clinic holiday: ${holiday.name}` };

    const hours = await this.prisma.workingHour.findMany({ where: { organizationId, branchId } });
    const todayHours = hours.find((h) => h.dayOfWeek === dow);
    if (hours.length > 0 && !todayHours) {
      return { ...base, closed: true, reason: `Clinic is closed on ${DAY_NAMES[dow]}` };
    }

    const blocks = await this.prisma.doctorAvailability.findMany({
      where: { organizationId, branchId, doctorId, dayOfWeek: dow },
      orderBy: { startTime: 'asc' },
    });
    if (blocks.length === 0) {
      return { ...base, reason: `Doctor has no availability on ${DAY_NAMES[dow]}` };
    }

    const [leaves, appointments] = await Promise.all([
      this.prisma.doctorLeave.findMany({
        where: { organizationId, doctorId, startDate: { lt: dayEnd }, endDate: { gt: dayStart } },
      }),
      this.prisma.appointment.findMany({
        where: {
          organizationId,
          doctorId,
          status: { notIn: [...FREE_STATUSES] },
          scheduledStart: { lt: dayEnd },
          scheduledEnd: { gt: dayStart },
          ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
        },
        select: { scheduledStart: true, scheduledEnd: true },
      }),
    ]);

    const now = opts.now ?? new Date();
    const seen = new Set<string>();
    const slots: Slot[] = [];
    for (const block of blocks) {
      const step = block.slotDuration;
      const length = opts.duration ?? block.slotDuration;
      const blockStart = toMinutes(block.startTime);
      const blockEnd = toMinutes(block.endTime);
      for (let t = blockStart; t + length <= blockEnd; t += step) {
        if (todayHours) {
          if (t < toMinutes(todayHours.openTime) || t + length > toMinutes(todayHours.closeTime)) continue;
          if (todayHours.breakStart && todayHours.breakEnd) {
            const bs = toMinutes(todayHours.breakStart);
            const be = toMinutes(todayHours.breakEnd);
            if (t < be && t + length > bs) continue;
          }
        }
        const time = fromMinutes(t);
        if (seen.has(time)) continue;
        seen.add(time);
        const start = zonedTimeToUtc(date, time, tz);
        const end = new Date(start.getTime() + length * 60000);
        let reason: Slot['reason'];
        if (start < now) reason = 'past';
        else if (leaves.some((l) => l.startDate < end && l.endDate > start)) reason = 'leave';
        else if (appointments.some((a) => a.scheduledStart < end && a.scheduledEnd > start)) reason = 'booked';
        slots.push({ start: start.toISOString(), end: end.toISOString(), time, available: !reason, ...(reason ? { reason } : {}) });
      }
    }
    slots.sort((a, b) => a.start.localeCompare(b.start));
    const onLeaveAllDay = slots.length > 0 && slots.every((s) => s.reason === 'leave');
    return { ...base, slots, ...(onLeaveAllDay ? { reason: 'Doctor is on leave' } : {}) };
  }

  /**
   * Returns human-readable reasons why [start, end) is outside the clinic /
   * doctor schedule (empty = OK). Overlaps with other appointments are checked
   * separately by the caller.
   */
  async scheduleIssues(organizationId: string, branchId: string, doctorId: string, start: Date, end: Date) {
    const issues: string[] = [];
    const tz = await this.branchTimezone(organizationId, branchId);
    const s = localInfo(start, tz);
    const e = localInfo(end, tz);
    const endMinutes = e.date === s.date ? e.minutes : e.date === addDays(s.date, 1) && e.minutes === 0 ? 1440 : -1;
    if (endMinutes < 0) {
      issues.push('Appointment must start and end on the same day');
      return issues;
    }
    const day = DAY_NAMES[s.dayOfWeek];

    const holiday = await this.prisma.clinicHoliday.findFirst({ where: { organizationId, date: dateOnlyToUtc(s.date) } });
    if (holiday) issues.push(`Clinic is closed on ${s.date} (holiday: ${holiday.name})`);

    const hours = await this.prisma.workingHour.findMany({ where: { organizationId, branchId } });
    if (hours.length > 0) {
      const h = hours.find((x) => x.dayOfWeek === s.dayOfWeek);
      if (!h) {
        issues.push(`Clinic is closed on ${day}`);
      } else {
        if (s.minutes < toMinutes(h.openTime) || endMinutes > toMinutes(h.closeTime)) {
          issues.push(`Outside clinic working hours (${day} ${h.openTime}-${h.closeTime})`);
        }
        if (h.breakStart && h.breakEnd && s.minutes < toMinutes(h.breakEnd) && endMinutes > toMinutes(h.breakStart)) {
          issues.push(`Overlaps the clinic break (${h.breakStart}-${h.breakEnd})`);
        }
      }
    }

    const availability = await this.prisma.doctorAvailability.findMany({ where: { organizationId, branchId, doctorId } });
    if (availability.length > 0) {
      const today = availability.filter((a) => a.dayOfWeek === s.dayOfWeek);
      const fits = today.some((a) => toMinutes(a.startTime) <= s.minutes && endMinutes <= toMinutes(a.endTime));
      if (!fits) {
        const ranges = today
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((a) => `${a.startTime}-${a.endTime}`)
          .join(', ');
        issues.push(
          ranges
            ? `Outside the doctor's availability (${day}: ${ranges})`
            : `Doctor is not available on ${day}`,
        );
      }
    }

    const leave = await this.prisma.doctorLeave.findFirst({
      where: { organizationId, doctorId, startDate: { lt: end }, endDate: { gt: start } },
    });
    if (leave) issues.push(`Doctor is on leave${leave.reason ? ` (${leave.reason})` : ''}`);
    return issues;
  }
}
