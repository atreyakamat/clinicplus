import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../payments/ledger.service';
import { pageArgs } from '../common/pagination';
import { ReqUser, Scope, branchSql, resolveScope } from '../analytics/scope.util';
import { addDaysYmd, localYmd, resolveRange, zonedDayStart } from '../analytics/date-range.util';
import { ReportQueryDto } from './reports.dto';

/** Net amount paid on invoice `alias` (collected payments − refunds), as a SQL expression. */
export function netPaidSql(alias: string): Prisma.Sql {
  const i = Prisma.raw(alias);
  return Prisma.sql`(
    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = ${i}.id AND p.is_refund = false
              AND p.payment_status::text IN ('PAID','PARTIALLY_REFUNDED','REFUNDED')), 0)
  - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = ${i}.id AND p.is_refund = true), 0)
  - COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r."invoiceId" = ${i}.id AND COALESCE(r.status, '') <> 'FAILED'), 0)
  )`;
}

const OPEN = Prisma.sql`('SENT','PARTIALLY_PAID','OVERDUE')`;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  scope(user: ReqUser, q: ReportQueryDto) {
    return resolveScope(this.prisma, user, q);
  }

  // ------------------------------------------------------------ outstanding receivables per patient

  async outstanding(scope: Scope, q: ReportQueryDto) {
    await this.ledger.refreshOverdue(scope.organizationId, scope.branchId);
    const { page, limit, skip, take } = pageArgs(q);
    const base = Prisma.sql`
      WITH inv AS (
        SELECT i.id, i.patient_id, i.total, i.due_date, i.created_at, ${netPaidSql('i')} AS net_paid
        FROM invoices i
        WHERE i.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'i')}
          AND i.deleted_at IS NULL AND i.status::text IN ${OPEN}
      ), open_inv AS (SELECT * FROM inv WHERE total - net_paid > 0)`;
    const rows = await this.prisma.$queryRaw<any[]>`${base}
      SELECT o.patient_id, pt.first_name, pt.last_name, pt.phone, pt.patient_code,
             COUNT(*)::int AS invoice_count,
             SUM(o.total)::numeric(14,2)::text AS billed,
             SUM(o.net_paid)::numeric(14,2)::text AS paid,
             SUM(o.total - o.net_paid)::numeric(14,2)::text AS outstanding,
             MIN(COALESCE(o.due_date, o.created_at)) AS oldest_due
      FROM open_inv o JOIN patients pt ON pt.id = o.patient_id
      GROUP BY o.patient_id, pt.first_name, pt.last_name, pt.phone, pt.patient_code
      ORDER BY SUM(o.total - o.net_paid) DESC, o.patient_id
      LIMIT ${take} OFFSET ${skip}`;
    const [summary] = await this.prisma.$queryRaw<any[]>`${base}
      SELECT COUNT(DISTINCT patient_id)::int AS patients, COUNT(*)::int AS invoices,
             COALESCE(SUM(total - net_paid), 0)::numeric(14,2)::text AS outstanding
      FROM open_inv`;
    return {
      rows: rows.map((r) => ({
        patientId: r.patient_id,
        patientName: `${r.first_name} ${r.last_name}`.trim(),
        patientCode: r.patient_code,
        phone: r.phone,
        invoiceCount: r.invoice_count,
        billed: r.billed,
        paid: r.paid,
        outstanding: r.outstanding,
        oldestDue: r.oldest_due,
      })),
      summary: { patients: summary.patients, invoices: summary.invoices, outstanding: summary.outstanding },
      page,
      limit,
      total: summary.patients,
      scope: scope.branchId ? 'branch' : 'org',
    };
  }

  // ------------------------------------------------------------ AR ageing

  async ageing(scope: Scope) {
    await this.ledger.refreshOverdue(scope.organizationId, scope.branchId);
    const rows = await this.prisma.$queryRaw<any[]>`
      WITH inv AS (
        SELECT i.id, i.patient_id, i.total - ${netPaidSql('i')} AS due,
               GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() AT TIME ZONE 'UTC' - COALESCE(i.due_date, i.created_at))) / 86400))::int AS age
        FROM invoices i
        WHERE i.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'i')}
          AND i.deleted_at IS NULL AND i.status::text IN ${OPEN}
      ), b AS (
        SELECT patient_id, due,
          CASE WHEN age <= 30 THEN 'd0_30' WHEN age <= 60 THEN 'd31_60' WHEN age <= 90 THEN 'd61_90' ELSE 'd90_plus' END AS bucket
        FROM inv WHERE due > 0
      )
      SELECT b.patient_id, pt.first_name, pt.last_name, pt.phone,
        COALESCE(SUM(due) FILTER (WHERE bucket = 'd0_30'), 0)::numeric(14,2)::text AS d0_30,
        COALESCE(SUM(due) FILTER (WHERE bucket = 'd31_60'), 0)::numeric(14,2)::text AS d31_60,
        COALESCE(SUM(due) FILTER (WHERE bucket = 'd61_90'), 0)::numeric(14,2)::text AS d61_90,
        COALESCE(SUM(due) FILTER (WHERE bucket = 'd90_plus'), 0)::numeric(14,2)::text AS d90_plus,
        SUM(due)::numeric(14,2)::text AS total,
        COUNT(*)::int AS invoices
      FROM b JOIN patients pt ON pt.id = b.patient_id
      GROUP BY b.patient_id, pt.first_name, pt.last_name, pt.phone
      ORDER BY SUM(due) DESC
      LIMIT 1000`;
    const [agg] = await this.prisma.$queryRaw<any[]>`
      WITH inv AS (
        SELECT i.total - ${netPaidSql('i')} AS due,
               GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() AT TIME ZONE 'UTC' - COALESCE(i.due_date, i.created_at))) / 86400))::int AS age
        FROM invoices i
        WHERE i.organization_id = ${scope.organizationId}::uuid ${branchSql(scope, 'i')}
          AND i.deleted_at IS NULL AND i.status::text IN ${OPEN}
      )
      SELECT
        COALESCE(SUM(due) FILTER (WHERE age <= 30), 0)::numeric(14,2)::text AS d0_30,
        COALESCE(SUM(due) FILTER (WHERE age > 30 AND age <= 60), 0)::numeric(14,2)::text AS d31_60,
        COALESCE(SUM(due) FILTER (WHERE age > 60 AND age <= 90), 0)::numeric(14,2)::text AS d61_90,
        COALESCE(SUM(due) FILTER (WHERE age > 90), 0)::numeric(14,2)::text AS d90_plus,
        COUNT(*) FILTER (WHERE age <= 30)::int AS c0_30,
        COUNT(*) FILTER (WHERE age > 30 AND age <= 60)::int AS c31_60,
        COUNT(*) FILTER (WHERE age > 60 AND age <= 90)::int AS c61_90,
        COUNT(*) FILTER (WHERE age > 90)::int AS c90_plus,
        COALESCE(SUM(due), 0)::numeric(14,2)::text AS total
      FROM inv WHERE due > 0`;
    return {
      buckets: [
        { bucket: '0-30', amount: agg.d0_30, invoices: agg.c0_30 },
        { bucket: '31-60', amount: agg.d31_60, invoices: agg.c31_60 },
        { bucket: '61-90', amount: agg.d61_90, invoices: agg.c61_90 },
        { bucket: '90+', amount: agg.d90_plus, invoices: agg.c90_plus },
      ],
      total: agg.total,
      rows: rows.map((r) => ({
        patientId: r.patient_id,
        patientName: `${r.first_name} ${r.last_name}`.trim(),
        phone: r.phone,
        invoices: r.invoices,
        d0_30: r.d0_30,
        d31_60: r.d31_60,
        d61_90: r.d61_90,
        d90_plus: r.d90_plus,
        total: r.total,
      })),
      scope: scope.branchId ? 'branch' : 'org',
    };
  }

  // ------------------------------------------------------------ daily close

  async dailyClose(scope: Scope, q: ReportQueryDto) {
    const date = q.date || localYmd(new Date(), scope.tz);
    const start = zonedDayStart(date, scope.tz);
    const end = zonedDayStart(addDaysYmd(date, 1), scope.tz);
    const org = scope.organizationId;

    const collections = await this.prisma.$queryRaw<any[]>`
      SELECT p.payment_method AS method, COUNT(*)::int AS count, SUM(p.amount)::numeric(14,2)::text AS amount
      FROM payments p
      WHERE p.organization_id = ${org}::uuid ${branchSql(scope, 'p')}
        AND p.is_refund = false AND p.payment_status::text IN ('PAID','PARTIALLY_REFUNDED','REFUNDED')
        AND COALESCE(p.paid_at, p.created_at) >= ${start} AND COALESCE(p.paid_at, p.created_at) < ${end}
      GROUP BY p.payment_method ORDER BY p.payment_method`;
    const refunds = await this.prisma.$queryRaw<any[]>`
      SELECT method, COUNT(*)::int AS count, SUM(amount)::numeric(14,2)::text AS amount FROM (
        SELECT p.payment_method AS method, r.amount
        FROM refunds r JOIN payments p ON p.id = r.payment_id
        WHERE r.organization_id = ${org}::uuid ${branchSql(scope, 'r')}
          AND COALESCE(r.status, '') <> 'FAILED'
          AND COALESCE(r.processed_at, r.created_at) >= ${start} AND COALESCE(r.processed_at, r.created_at) < ${end}
        UNION ALL
        SELECT p.payment_method, p.amount FROM payments p
        WHERE p.organization_id = ${org}::uuid ${branchSql(scope, 'p')} AND p.is_refund = true
          AND p.created_at >= ${start} AND p.created_at < ${end}
      ) x GROUP BY method ORDER BY method`;
    const [inv] = await this.prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*) FILTER (WHERE i.status::text NOT IN ('DRAFT','VOID'))::int AS raised_count,
        COALESCE(SUM(i.total) FILTER (WHERE i.status::text NOT IN ('DRAFT','VOID')), 0)::numeric(14,2)::text AS raised_total,
        COUNT(*) FILTER (WHERE i.status::text = 'DRAFT')::int AS draft_count
      FROM invoices i
      WHERE i.organization_id = ${org}::uuid ${branchSql(scope, 'i')} AND i.deleted_at IS NULL
        AND i.created_at >= ${start} AND i.created_at < ${end}`;
    const [voided] = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(i.total), 0)::numeric(14,2)::text AS total
      FROM invoices i
      WHERE i.organization_id = ${org}::uuid ${branchSql(scope, 'i')} AND i.status::text = 'VOID'
        AND i.updated_at >= ${start} AND i.updated_at < ${end}`;

    const sum = (rows: any[]) => rows.reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0));
    const collected = sum(collections);
    const refunded = sum(refunds);
    return {
      date,
      timezone: scope.tz,
      collections: collections.map((r) => ({ method: r.method, count: r.count, amount: r.amount })),
      totalCollected: collected.toFixed(2),
      refunds: refunds.map((r) => ({ method: r.method, count: r.count, amount: r.amount })),
      totalRefunded: refunded.toFixed(2),
      net: collected.minus(refunded).toFixed(2),
      invoices: {
        raisedCount: inv.raised_count,
        raisedTotal: inv.raised_total,
        draftCount: inv.draft_count,
        voidedCount: voided.count,
        voidedTotal: voided.total,
      },
      scope: scope.branchId ? 'branch' : 'org',
    };
  }

  // ------------------------------------------------------------ revenue breakdowns

  async revenue(scope: Scope, q: ReportQueryDto) {
    const range = resolveRange(q, scope.tz);
    const groupBy = q.groupBy ?? 'method';
    const org = scope.organizationId;
    const { start, end } = range;
    let rows: any[];

    if (groupBy === 'method') {
      const raw = await this.prisma.$queryRaw<any[]>`
        WITH c AS (
          SELECT p.payment_method AS method, COUNT(*)::int AS count, SUM(p.amount) AS amount
          FROM payments p
          WHERE p.organization_id = ${org}::uuid ${branchSql(scope, 'p')}
            AND p.is_refund = false AND p.payment_status::text IN ('PAID','PARTIALLY_REFUNDED','REFUNDED')
            AND COALESCE(p.paid_at, p.created_at) >= ${start} AND COALESCE(p.paid_at, p.created_at) < ${end}
          GROUP BY p.payment_method
        ), r AS (
          SELECT p.payment_method AS method, SUM(r.amount) AS amount
          FROM refunds r JOIN payments p ON p.id = r.payment_id
          WHERE r.organization_id = ${org}::uuid ${branchSql(scope, 'r')} AND COALESCE(r.status, '') <> 'FAILED'
            AND COALESCE(r.processed_at, r.created_at) >= ${start} AND COALESCE(r.processed_at, r.created_at) < ${end}
          GROUP BY p.payment_method
        )
        SELECT COALESCE(c.method, r.method) AS key, COALESCE(c.count, 0)::int AS count,
               COALESCE(c.amount, 0)::numeric(14,2)::text AS collected,
               COALESCE(r.amount, 0)::numeric(14,2)::text AS refunded,
               (COALESCE(c.amount, 0) - COALESCE(r.amount, 0))::numeric(14,2)::text AS net
        FROM c FULL OUTER JOIN r ON r.method = c.method
        ORDER BY (COALESCE(c.amount, 0) - COALESCE(r.amount, 0)) DESC`;
      rows = raw.map((r) => ({ key: r.key, label: r.key, count: r.count, collected: r.collected, refunded: r.refunded, net: r.net }));
    } else if (groupBy === 'doctor') {
      const raw = await this.prisma.$queryRaw<any[]>`
        SELECT a.doctor_id AS key, u.first_name, u.last_name,
               COUNT(*)::int AS count,
               SUM(i.total)::numeric(14,2)::text AS billed,
               SUM(${netPaidSql('i')})::numeric(14,2)::text AS collected
        FROM invoices i
        LEFT JOIN appointments a ON a.id = i.appointment_id AND a.organization_id = i.organization_id
        LEFT JOIN users u ON u.id = a.doctor_id
        WHERE i.organization_id = ${org}::uuid ${branchSql(scope, 'i')} AND i.deleted_at IS NULL
          AND i.status::text NOT IN ('DRAFT','VOID')
          AND i.created_at >= ${start} AND i.created_at < ${end}
        GROUP BY a.doctor_id, u.first_name, u.last_name
        ORDER BY SUM(i.total) DESC`;
      rows = raw.map((r) => ({
        key: r.key,
        label: r.key ? `Dr. ${r.first_name} ${r.last_name}` : 'Not linked to an appointment',
        count: r.count,
        billed: r.billed,
        collected: r.collected,
      }));
    } else {
      const raw = await this.prisma.$queryRaw<any[]>`
        SELECT COALESCE(it.service_id::text, 'item:' || LOWER(it.item_name)) AS key,
               COALESCE(MAX(s.name), MAX(it.item_name)) AS label,
               (it.service_id IS NOT NULL) AS from_catalog,
               SUM(it.quantity)::int AS quantity,
               COUNT(DISTINCT i.id)::int AS count,
               SUM(it.amount)::numeric(14,2)::text AS billed
        FROM invoice_items it
        JOIN invoices i ON i.id = it.invoice_id
        LEFT JOIN clinic_services s ON s.id = it.service_id
        WHERE i.organization_id = ${org}::uuid ${branchSql(scope, 'i')} AND i.deleted_at IS NULL
          AND i.status::text NOT IN ('DRAFT','VOID')
          AND i.created_at >= ${start} AND i.created_at < ${end}
        GROUP BY 1, 3
        ORDER BY SUM(it.amount) DESC
        LIMIT 500`;
      rows = raw.map((r) => ({ key: r.key, label: r.label, fromCatalog: r.from_catalog, quantity: r.quantity, count: r.count, billed: r.billed }));
    }
    return {
      groupBy,
      from: range.from,
      to: range.to,
      timezone: range.tz,
      rows,
      scope: scope.branchId ? 'branch' : 'org',
    };
  }

  // ------------------------------------------------------------ CSV

  async csvRows(name: string, scope: Scope, q: ReportQueryDto): Promise<{ filename: string; rows: Record<string, unknown>[] }> {
    const stamp = localYmd(new Date(), scope.tz);
    switch (name) {
      case 'outstanding': {
        const r = await this.outstanding(scope, { ...q, page: 1, limit: 200 } as ReportQueryDto);
        // walk all pages so the export is complete
        const all = [...r.rows];
        for (let page = 2; (page - 1) * 200 < r.total; page++) {
          all.push(...(await this.outstanding(scope, { ...q, page, limit: 200 } as ReportQueryDto)).rows);
        }
        return {
          filename: `outstanding-${stamp}.csv`,
          rows: all.map((x) => ({
            Patient: x.patientName,
            'Patient code': x.patientCode ?? '',
            Phone: x.phone ?? '',
            Invoices: x.invoiceCount,
            Billed: x.billed,
            Paid: x.paid,
            Outstanding: x.outstanding,
            'Oldest due': x.oldestDue ? new Date(x.oldestDue).toISOString().slice(0, 10) : '',
          })),
        };
      }
      case 'ageing': {
        const r = await this.ageing(scope);
        return {
          filename: `ar-ageing-${stamp}.csv`,
          rows: r.rows.map((x) => ({
            Patient: x.patientName,
            Phone: x.phone ?? '',
            Invoices: x.invoices,
            '0-30': x.d0_30,
            '31-60': x.d31_60,
            '61-90': x.d61_90,
            '90+': x.d90_plus,
            Total: x.total,
          })),
        };
      }
      case 'daily-close': {
        const r = await this.dailyClose(scope, q);
        const rows: Record<string, unknown>[] = [
          ...r.collections.map((c) => ({ Section: 'Collection', Method: c.method, Count: c.count, Amount: c.amount })),
          { Section: 'Total collected', Method: '', Count: '', Amount: r.totalCollected },
          ...r.refunds.map((c) => ({ Section: 'Refund', Method: c.method, Count: c.count, Amount: c.amount })),
          { Section: 'Total refunded', Method: '', Count: '', Amount: r.totalRefunded },
          { Section: 'Net', Method: '', Count: '', Amount: r.net },
          { Section: 'Invoices raised', Method: '', Count: r.invoices.raisedCount, Amount: r.invoices.raisedTotal },
          { Section: 'Invoices voided', Method: '', Count: r.invoices.voidedCount, Amount: r.invoices.voidedTotal },
        ];
        return { filename: `daily-close-${r.date}.csv`, rows };
      }
      default: {
        const r = await this.revenue(scope, q);
        return {
          filename: `revenue-by-${r.groupBy}-${r.from}-to-${r.to}.csv`,
          rows: r.rows.map((x: any) => {
            const { key: _key, label, fromCatalog: _fc, ...rest } = x;
            return { [r.groupBy === 'method' ? 'Method' : r.groupBy === 'doctor' ? 'Doctor' : 'Service']: label, ...rest };
          }),
        };
      }
    }
  }
}

