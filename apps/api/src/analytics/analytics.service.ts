import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { netPaidSql } from '../reports/reports.service';
import { AnalyticsQueryDto, TodayQueryDto } from './analytics.dto';
import { ReqUser, Scope, branchSql, num, resolveScope, userCan } from './scope.util';
import { ResolvedRange, pct, resolveRange, todayRange } from './date-range.util';

const COLLECTED = Prisma.sql`('PAID','PARTIALLY_REFUNDED','REFUNDED')`;

function doctorSql(doctorId: string | null | undefined, alias: string): Prisma.Sql {
  return doctorId ? Prisma.sql`AND ${Prisma.raw(`${alias}.doctor_id`)} = ${doctorId}::uuid` : Prisma.empty;
}

/** Local-time bucket of a UTC `timestamp` column. */
function localTs(column: string, tz: string): Prisma.Sql {
  return Prisma.sql`((${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAssertService,
  ) {}

  private async ctx(user: ReqUser, q: AnalyticsQueryDto, defaultDays = 30) {
    const scope = await resolveScope(this.prisma, user, q);
    const range = resolveRange(q, scope.tz, defaultDays);
    return { scope, range };
  }

  // ------------------------------------------------------------------ building blocks

  private async appointmentStats(scope: Scope, range: Pick<ResolvedRange, 'start' | 'end'>, doctorId?: string | null) {
    const [r] = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.status::text = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE a.status::text = 'NO_SHOW')::int AS no_show,
        COUNT(*) FILTER (WHERE a.status::text = 'CANCELLED')::int AS cancelled,
        COUNT(*) FILTER (WHERE a.status::text IN ('SCHEDULED','CONFIRMED'))::int AS upcoming,
        COUNT(*) FILTER (WHERE a.status::text IN ('CHECKED_IN','IN_PROGRESS'))::int AS in_clinic,
        COUNT(DISTINCT a.patient_id) FILTER (WHERE a.status::text <> 'CANCELLED')::int AS patients
      FROM appointments a
      WHERE a.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'a')} ${doctorSql(doctorId, 'a')}
        AND a.deleted_at IS NULL AND a.scheduled_start >= ${range.start} AND a.scheduled_start < ${range.end}`;
    return {
      total: r.total,
      completed: r.completed,
      noShow: r.no_show,
      cancelled: r.cancelled,
      upcoming: r.upcoming,
      inClinic: r.in_clinic,
      uniquePatients: r.patients,
      // share of appointments that were due and missed (attended + missed as denominator)
      noShowRate: pct(r.no_show, r.completed + r.no_show),
    };
  }

  private async newVsReturning(scope: Scope, range: ResolvedRange, doctorId?: string | null) {
    const [r] = await this.prisma.$queryRaw<any[]>`
      WITH inrange AS (
        SELECT DISTINCT a.patient_id FROM appointments a
        WHERE a.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'a')} ${doctorSql(doctorId, 'a')}
          AND a.deleted_at IS NULL AND a.status::text <> 'CANCELLED'
          AND a.scheduled_start >= ${range.start} AND a.scheduled_start < ${range.end}
      ), prior AS (
        SELECT DISTINCT a.patient_id FROM appointments a
        WHERE a.organization_id = ${scope.organizationId}::uuid ${doctorSql(doctorId, 'a')}
          AND a.deleted_at IS NULL AND a.status::text <> 'CANCELLED' AND a.scheduled_start < ${range.start}
          AND a.patient_id IN (SELECT patient_id FROM inrange)
      )
      SELECT (SELECT COUNT(*) FROM inrange)::int AS total, (SELECT COUNT(*) FROM prior)::int AS returning`;
    return { patientsSeen: r.total, returning: r.returning, new: r.total - r.returning, returningRate: pct(r.returning, r.total) };
  }

  private async queueWait(scope: Scope, range: Pick<ResolvedRange, 'start' | 'end'>, doctorId?: string | null) {
    const [r] = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS seen,
             AVG(EXTRACT(EPOCH FROM (q.called_time - q.check_in_time)) / 60)::float AS avg_wait
      FROM queue_entries q
      ${doctorId ? Prisma.sql`JOIN appointments a ON a.id = q.appointment_id` : Prisma.empty}
      WHERE q.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'q')} ${doctorSql(doctorId, 'a')}
        AND q.check_in_time >= ${range.start} AND q.check_in_time < ${range.end}
        AND q.called_time IS NOT NULL AND q.called_time >= q.check_in_time`;
    return { patientsCalled: r.seen, avgWaitMinutes: r.avg_wait === null ? null : Math.round(r.avg_wait * 10) / 10 };
  }

  private async followUpCompliance(scope: Scope, range: Pick<ResolvedRange, 'start' | 'end'>, doctorId?: string | null) {
    const now = new Date();
    const until = range.end < now ? range.end : now;
    const [r] = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*) FILTER (WHERE UPPER(COALESCE(f.status, '')) <> 'CANCELLED')::int AS due,
             COUNT(*) FILTER (WHERE UPPER(COALESCE(f.status, '')) = 'COMPLETED')::int AS completed,
             COUNT(*) FILTER (WHERE UPPER(COALESCE(f.status, '')) IN ('MISSED','OVERDUE'))::int AS missed
      FROM follow_ups f
      WHERE f.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'f')} ${doctorSql(doctorId, 'f')}
        AND f.scheduled_date >= ${range.start} AND f.scheduled_date < ${until}`;
    return { due: r.due, completed: r.completed, missed: r.missed, complianceRate: pct(r.completed, r.due) };
  }

  private async revenueTotals(scope: Scope, range: Pick<ResolvedRange, 'start' | 'end'>) {
    const org = scope.organizationId;
    const [r] = await this.prisma.$queryRaw<any[]>`
      SELECT
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
          WHERE p.organization_id = ${org}::uuid ${branchSql(scope, 'p')} AND p.is_refund = false
            AND p.payment_status::text IN ${COLLECTED}
            AND COALESCE(p.paid_at, p.created_at) >= ${range.start} AND COALESCE(p.paid_at, p.created_at) < ${range.end}
        )::numeric(14,2)::text AS collected,
        (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r
          WHERE r.organization_id = ${org}::uuid ${branchSql(scope, 'r')} AND COALESCE(r.status, '') <> 'FAILED'
            AND COALESCE(r.processed_at, r.created_at) >= ${range.start} AND COALESCE(r.processed_at, r.created_at) < ${range.end}
        )::numeric(14,2)::text AS refunded,
        (SELECT COALESCE(SUM(i.total), 0) FROM invoices i
          WHERE i.organization_id = ${org}::uuid ${branchSql(scope, 'i')} AND i.deleted_at IS NULL
            AND i.status::text NOT IN ('DRAFT','VOID') AND i.created_at >= ${range.start} AND i.created_at < ${range.end}
        )::numeric(14,2)::text AS invoiced,
        (SELECT COALESCE(SUM(i.total - ${netPaidSql('i')}), 0) FROM invoices i
          WHERE i.organization_id = ${org}::uuid ${branchSql(scope, 'i')} AND i.deleted_at IS NULL
            AND i.status::text IN ('SENT','PARTIALLY_PAID','OVERDUE')
        )::numeric(14,2)::text AS outstanding`;
    const net = new Prisma.Decimal(r.collected).minus(r.refunded);
    return { collected: r.collected, refunded: r.refunded, net: net.toFixed(2), invoiced: r.invoiced, outstanding: r.outstanding };
  }

  // ------------------------------------------------------------------ endpoints

  /** Clinic overview KPIs. Revenue only for analytics.financial holders. */
  async overview(user: ReqUser, q: AnalyticsQueryDto) {
    const { scope, range } = await this.ctx(user, q);
    const today = todayRange(scope.tz);
    const [appointments, todayStats, patients, queue, followUps, registered] = await Promise.all([
      this.appointmentStats(scope, range),
      this.appointmentStats(scope, today),
      this.newVsReturning(scope, range),
      this.queueWait(scope, range),
      this.followUpCompliance(scope, range),
      this.prisma.patient.count({
        where: {
          organizationId: scope.organizationId,
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          deletedAt: null,
          createdAt: { gte: range.start, lt: range.end },
        },
      }),
    ]);
    const revenue = userCan(user, 'analytics.financial') ? await this.revenueTotals(scope, range) : undefined;
    return {
      range: { from: range.from, to: range.to, timezone: range.tz, days: range.days },
      scope: scope.branchId ? 'branch' : 'org',
      appointments,
      today: { total: todayStats.total, completed: todayStats.completed, upcoming: todayStats.upcoming, inClinic: todayStats.inClinic, noShow: todayStats.noShow },
      patients: { ...patients, registered },
      queue,
      followUps,
      ...(revenue ? { revenue } : {}),
    };
  }

  /** Collections / refunds / invoiced per day|week|month. */
  async revenueTrends(user: ReqUser, q: AnalyticsQueryDto) {
    const { scope, range } = await this.ctx(user, q);
    const interval = q.interval ?? (range.days > 120 ? 'month' : range.days > 45 ? 'week' : 'day');
    const step = `1 ${interval}`;
    const org = scope.organizationId;
    const rows = await this.prisma.$queryRaw<any[]>`
      WITH series AS (
        SELECT generate_series(date_trunc(${interval}, ${range.from}::date::timestamp),
                               ${range.to}::date::timestamp, ${step}::interval) AS bucket
      ), c AS (
        SELECT date_trunc(${interval}, ${localTs('COALESCE(p.paid_at, p.created_at)', scope.tz)}) AS bucket,
               SUM(p.amount) AS amount, COUNT(*)::int AS count
        FROM payments p
        WHERE p.organization_id = ${org}::uuid ${branchSql(scope, 'p')} AND p.is_refund = false
          AND p.payment_status::text IN ${COLLECTED}
          AND COALESCE(p.paid_at, p.created_at) >= ${range.start} AND COALESCE(p.paid_at, p.created_at) < ${range.end}
        GROUP BY 1
      ), r AS (
        SELECT date_trunc(${interval}, ${localTs('COALESCE(r.processed_at, r.created_at)', scope.tz)}) AS bucket, SUM(r.amount) AS amount
        FROM refunds r
        WHERE r.organization_id = ${org}::uuid ${branchSql(scope, 'r')} AND COALESCE(r.status, '') <> 'FAILED'
          AND COALESCE(r.processed_at, r.created_at) >= ${range.start} AND COALESCE(r.processed_at, r.created_at) < ${range.end}
        GROUP BY 1
      ), i AS (
        SELECT date_trunc(${interval}, ${localTs('i.created_at', scope.tz)}) AS bucket, SUM(i.total) AS amount, COUNT(*)::int AS count
        FROM invoices i
        WHERE i.organization_id = ${org}::uuid ${branchSql(scope, 'i')} AND i.deleted_at IS NULL
          AND i.status::text NOT IN ('DRAFT','VOID') AND i.created_at >= ${range.start} AND i.created_at < ${range.end}
        GROUP BY 1
      )
      SELECT to_char(s.bucket, 'YYYY-MM-DD') AS period,
             COALESCE(c.amount, 0)::numeric(14,2)::text AS collected,
             COALESCE(c.count, 0)::int AS payments,
             COALESCE(r.amount, 0)::numeric(14,2)::text AS refunded,
             (COALESCE(c.amount, 0) - COALESCE(r.amount, 0))::numeric(14,2)::text AS net,
             COALESCE(i.amount, 0)::numeric(14,2)::text AS invoiced,
             COALESCE(i.count, 0)::int AS invoices
      FROM series s
      LEFT JOIN c ON c.bucket = s.bucket
      LEFT JOIN r ON r.bucket = s.bucket
      LEFT JOIN i ON i.bucket = s.bucket
      ORDER BY s.bucket`;
    const totals = await this.revenueTotals(scope, range);
    return {
      range: { from: range.from, to: range.to, timezone: range.tz },
      interval,
      scope: scope.branchId ? 'branch' : 'org',
      series: rows,
      totals,
    };
  }

  /**
   * Practice analytics for one doctor. `self` = the caller asked for their own data;
   * revenue is shown to the doctor themself or to analytics.financial holders.
   */
  async doctor(user: ReqUser, doctorId: string, q: AnalyticsQueryDto, self: boolean) {
    if (!self) await this.tenant.doctor(doctorId, user.organizationId);
    const { scope, range } = await this.ctx(user, q);
    const today = todayRange(scope.tz);
    const [appointments, todayStats, patients, queue, followUps, consultations, daily, todayList] = await Promise.all([
      this.appointmentStats(scope, range, doctorId),
      this.appointmentStats(scope, today, doctorId),
      this.newVsReturning(scope, range, doctorId),
      this.queueWait(scope, range, doctorId),
      this.followUpCompliance(scope, range, doctorId),
      this.prisma.consultation.count({
        where: {
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          organizationId: scope.organizationId,
          doctorId,
          deletedAt: null,
          status: 'COMPLETED',
          consultationDate: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.$queryRaw<any[]>`
        WITH series AS (
          SELECT generate_series(${range.from}::date::timestamp, ${range.to}::date::timestamp, '1 day'::interval) AS d
        ), a AS (
          SELECT date_trunc('day', ${localTs('a.scheduled_start', scope.tz)}) AS d,
                 COUNT(*) FILTER (WHERE a.status::text <> 'CANCELLED')::int AS booked,
                 COUNT(*) FILTER (WHERE a.status::text = 'COMPLETED')::int AS completed,
                 COUNT(*) FILTER (WHERE a.status::text = 'NO_SHOW')::int AS no_show
          FROM appointments a
          WHERE a.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'a')} ${doctorSql(doctorId, 'a')}
            AND a.deleted_at IS NULL AND a.scheduled_start >= ${range.start} AND a.scheduled_start < ${range.end}
          GROUP BY 1
        )
        SELECT to_char(s.d, 'YYYY-MM-DD') AS date, COALESCE(a.booked, 0)::int AS booked,
               COALESCE(a.completed, 0)::int AS completed, COALESCE(a.no_show, 0)::int AS "noShow"
        FROM series s LEFT JOIN a ON a.d = s.d ORDER BY s.d`,
      this.prisma.appointment.findMany({
        where: {
          organizationId: scope.organizationId,
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          doctorId,
          deletedAt: null,
          scheduledStart: { gte: today.start, lt: today.end },
        },
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          appointmentType: true,
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        },
        orderBy: { scheduledStart: 'asc' },
        take: 100,
      }),
    ]);

    let revenue: { billed: string; collected: string; invoices: number } | undefined;
    if (self || userCan(user, 'analytics.financial')) {
      const [r] = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int AS invoices, COALESCE(SUM(i.total), 0)::numeric(14,2)::text AS billed,
               COALESCE(SUM(${netPaidSql('i')}), 0)::numeric(14,2)::text AS collected
        FROM invoices i JOIN appointments a ON a.id = i.appointment_id
        WHERE i.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'i')} AND a.doctor_id = ${doctorId}::uuid
          AND i.deleted_at IS NULL AND i.status::text NOT IN ('DRAFT','VOID')
          AND i.created_at >= ${range.start} AND i.created_at < ${range.end}`;
      revenue = { billed: r.billed, collected: r.collected, invoices: r.invoices };
    }

    return {
      doctorId,
      range: { from: range.from, to: range.to, timezone: range.tz, days: range.days },
      scope: scope.branchId ? 'branch' : 'org',
      appointments,
      today: { ...todayStats, appointments: todayList },
      patients,
      consultationsCompleted: consultations,
      queue,
      followUps,
      daily,
      ...(revenue ? { revenue } : {}),
    };
  }

  /** Repeat-visit rate for the period and month-by-month returning share. */
  async retention(user: ReqUser, q: AnalyticsQueryDto) {
    const { scope, range } = await this.ctx(user, q, 180);
    const org = scope.organizationId;
    const [summary] = await this.prisma.$queryRaw<any[]>`
      WITH v AS (
        SELECT a.patient_id, COUNT(*)::int AS visits FROM appointments a
        WHERE a.organization_id = ${org}::uuid ${branchSql(scope, 'a')} AND a.deleted_at IS NULL
          AND a.status::text = 'COMPLETED' AND a.scheduled_start >= ${range.start} AND a.scheduled_start < ${range.end}
        GROUP BY a.patient_id
      )
      SELECT COUNT(*)::int AS patients, COUNT(*) FILTER (WHERE visits >= 2)::int AS repeat_patients,
             COALESCE(AVG(visits), 0)::float AS avg_visits
      FROM v`;
    const monthly = await this.prisma.$queryRaw<any[]>`
      WITH v AS (
        SELECT a.patient_id, a.scheduled_start, date_trunc('month', ${localTs('a.scheduled_start', scope.tz)}) AS month
        FROM appointments a
        WHERE a.organization_id = ${org}::uuid ${branchSql(scope, 'a')} AND a.deleted_at IS NULL
          AND a.status::text = 'COMPLETED' AND a.scheduled_start < ${range.end}
      ), firsts AS (
        SELECT patient_id, MIN(month) AS first_month FROM v GROUP BY patient_id
      ), active AS (
        SELECT DISTINCT patient_id, month FROM v WHERE scheduled_start >= ${range.start}
      )
      SELECT to_char(ac.month, 'YYYY-MM') AS month, COUNT(*)::int AS active,
             COUNT(*) FILTER (WHERE f.first_month < ac.month)::int AS returning,
             COUNT(*) FILTER (WHERE f.first_month = ac.month)::int AS new
      FROM active ac JOIN firsts f ON f.patient_id = ac.patient_id
      GROUP BY ac.month ORDER BY ac.month`;
    return {
      range: { from: range.from, to: range.to, timezone: range.tz },
      scope: scope.branchId ? 'branch' : 'org',
      patientsWithVisits: summary.patients,
      repeatPatients: summary.repeat_patients,
      repeatRate: pct(summary.repeat_patients, summary.patients),
      avgVisitsPerPatient: Math.round(num(summary.avg_visits) * 100) / 100,
      monthly: monthly.map((r) => ({ ...r, returningRate: pct(r.returning, r.active) })),
    };
  }

  /** Side-by-side branch KPIs (org-wide roles only). */
  async branches(user: ReqUser, q: AnalyticsQueryDto) {
    if (!user.orgWide) throw new ForbiddenException('Branch comparison requires an organization-level role');
    const { scope, range } = await this.ctx(user, { ...q, scope: 'org' });
    const org = scope.organizationId;
    const financial = userCan(user, 'analytics.financial');
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT b.id, b.name,
        (SELECT COUNT(*) FROM appointments a WHERE a.branch_id = b.id AND a.deleted_at IS NULL
           AND a.scheduled_start >= ${range.start} AND a.scheduled_start < ${range.end})::int AS appointments,
        (SELECT COUNT(*) FROM appointments a WHERE a.branch_id = b.id AND a.deleted_at IS NULL AND a.status::text = 'COMPLETED'
           AND a.scheduled_start >= ${range.start} AND a.scheduled_start < ${range.end})::int AS completed,
        (SELECT COUNT(*) FROM appointments a WHERE a.branch_id = b.id AND a.deleted_at IS NULL AND a.status::text = 'NO_SHOW'
           AND a.scheduled_start >= ${range.start} AND a.scheduled_start < ${range.end})::int AS no_show,
        (SELECT COUNT(*) FROM patients p WHERE p.branch_id = b.id AND p.deleted_at IS NULL
           AND p.created_at >= ${range.start} AND p.created_at < ${range.end})::int AS new_patients,
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.branch_id = b.id AND p.is_refund = false
           AND p.payment_status::text IN ${COLLECTED}
           AND COALESCE(p.paid_at, p.created_at) >= ${range.start} AND COALESCE(p.paid_at, p.created_at) < ${range.end}
        )::numeric(14,2)::text AS collected,
        (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r WHERE r.branch_id = b.id AND COALESCE(r.status, '') <> 'FAILED'
           AND COALESCE(r.processed_at, r.created_at) >= ${range.start} AND COALESCE(r.processed_at, r.created_at) < ${range.end}
        )::numeric(14,2)::text AS refunded
      FROM branches b
      WHERE b.organization_id = ${org}::uuid AND b.deleted_at IS NULL
      ORDER BY b.name`;
    return {
      range: { from: range.from, to: range.to, timezone: range.tz },
      branches: rows.map((r) => ({
        branchId: r.id,
        name: r.name,
        appointments: r.appointments,
        completed: r.completed,
        noShow: r.no_show,
        noShowRate: pct(r.no_show, r.completed + r.no_show),
        newPatients: r.new_patients,
        ...(financial
          ? { collected: r.collected, refunded: r.refunded, net: new Prisma.Decimal(r.collected).minus(r.refunded).toFixed(2) }
          : {}),
      })),
    };
  }

  /** Front-desk "today" snapshot; each block is included only if the caller may see it. */
  async today(user: ReqUser, q: TodayQueryDto) {
    const scope = await resolveScope(this.prisma, user, { tz: q.tz });
    const range = todayRange(scope.tz);
    const doctorId = q.mine ? user.id : null;
    const result: Record<string, unknown> = { date: range.from, timezone: range.tz };

    if (userCan(user, 'appointments.view')) {
      const [stats, upcoming] = await Promise.all([
        this.appointmentStats(scope, range, doctorId),
        this.prisma.appointment.findMany({
          where: {
            organizationId: scope.organizationId,
            branchId: scope.branchId!,
            ...(doctorId ? { doctorId } : {}),
            deletedAt: null,
            scheduledStart: { gte: range.start, lt: range.end },
            status: { notIn: ['CANCELLED'] },
          },
          select: {
            id: true,
            scheduledStart: true,
            status: true,
            appointmentType: true,
            patient: { select: { id: true, firstName: true, lastName: true } },
            doctor: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { scheduledStart: 'asc' },
          take: 50,
        }),
      ]);
      result.appointments = { ...stats, list: upcoming };
    }

    if (userCan(user, 'queues.view')) {
      const [counts] = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*) FILTER (WHERE q.status::text = 'WAITING')::int AS waiting,
               COUNT(*) FILTER (WHERE q.status::text IN ('CALLED','IN_PROGRESS'))::int AS in_progress,
               COUNT(*) FILTER (WHERE q.status::text = 'COMPLETED')::int AS completed
        FROM queue_entries q
        ${doctorId ? Prisma.sql`JOIN appointments a ON a.id = q.appointment_id` : Prisma.empty}
        WHERE q.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'q')} ${doctorSql(doctorId, 'a')}
          AND q.created_at >= ${range.start} AND q.created_at < ${range.end}`;
      const wait = await this.queueWait(scope, range, doctorId);
      result.queue = { waiting: counts.waiting, inProgress: counts.in_progress, completed: counts.completed, ...wait };
    }

    if (userCan(user, 'payments.view')) {
      const methods = await this.prisma.$queryRaw<any[]>`
        SELECT p.payment_method AS method, COUNT(*)::int AS count, SUM(p.amount)::numeric(14,2)::text AS amount
        FROM payments p
        WHERE p.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'p')} AND p.is_refund = false
          AND p.payment_status::text IN ${COLLECTED}
          AND COALESCE(p.paid_at, p.created_at) >= ${range.start} AND COALESCE(p.paid_at, p.created_at) < ${range.end}
        GROUP BY p.payment_method ORDER BY 3 DESC`;
      const total = methods.reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0));
      result.collections = { total: total.toFixed(2), byMethod: methods };
    }

    if (userCan(user, 'invoices.view')) {
      const [r] = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int AS open, COALESCE(SUM(i.total - ${netPaidSql('i')}), 0)::numeric(14,2)::text AS outstanding,
               COUNT(*) FILTER (WHERE i.status::text = 'OVERDUE' OR (i.due_date IS NOT NULL AND i.due_date < NOW() AT TIME ZONE 'UTC'))::int AS overdue
        FROM invoices i
        WHERE i.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'i')} AND i.deleted_at IS NULL
          AND i.status::text IN ('SENT','PARTIALLY_PAID','OVERDUE')`;
      result.invoices = { open: r.open, overdue: r.overdue, outstanding: r.outstanding };
    }
    return result;
  }
}
