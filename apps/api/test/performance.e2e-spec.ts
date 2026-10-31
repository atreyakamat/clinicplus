/**
 * Smoke-level latency budgets on a seeded tenant (1000 patients, 300 appointments,
 * 150 invoices). Budgets are deliberately generous so the suite does not flake on a
 * loaded CI box or when other suites run concurrently; they catch pathological
 * regressions (N+1, missing pagination, full-table scans), not micro-performance.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createTenant, createTestApp, Tenant, TenantUser } from './helpers/app';

const BUDGET_MS = 2000;
const PATIENTS = 1000;

describe('Performance budgets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let patientIds: string[];
  const http = () => request(app.getHttpServer());

  const timed = async (user: TenantUser, url: string) => {
    const t0 = Date.now();
    const res = await http().get(url).set(auth(user));
    const ms = Date.now() - t0;
    expect({ url, status: res.status }).toEqual({ url, status: 200 });
    return { res, ms };
  };
  const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'Perf');
    const base = Date.now();
    await prisma.patient.createMany({
      data: Array.from({ length: PATIENTS }, (_, i) => ({
        organizationId: A.org.id,
        branchId: A.branch.id,
        firstName: `PerfPat${i}`,
        lastName: `Last${i}`,
        phone: `8${String(base % 1e5).padStart(5, '0')}${String(i).padStart(4, '0')}`,
        patientCode: `PRF-${String(i).padStart(5, '0')}`,
        createdBy: A.receptionist.id,
      })),
    });
    patientIds = (await prisma.patient.findMany({ where: { organizationId: A.org.id }, select: { id: true } })).map((p) => p.id);

    const day = new Date();
    day.setHours(0, 0, 0, 0);
    await prisma.appointment.createMany({
      data: patientIds.slice(0, 300).map((patientId, i) => {
        const start = new Date(day.getTime() + Math.floor(i / 20) * 86_400_000 + (8 * 60 + (i % 20) * 30) * 60_000);
        return {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId,
          doctorId: A.doctor.id,
          scheduledStart: start,
          scheduledEnd: new Date(start.getTime() + 30 * 60_000),
          status: 'SCHEDULED' as const,
        };
      }),
    });
    await prisma.invoice.createMany({
      data: patientIds.slice(0, 150).map((patientId, i) => ({
        organizationId: A.org.id,
        branchId: A.branch.id,
        patientId,
        invoiceNumber: `PERF-${String(i).padStart(5, '0')}`,
        subtotal: 500,
        total: 500,
        status: 'SENT' as const,
      })),
    });
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('seeded data is visible through the API (sanity)', async () => {
    const { res } = await timed(A.receptionist, '/api/v1/patients?limit=1');
    expect(res.body.meta.total).toBe(PATIENTS);
  });

  describe('patients', () => {
    it('quick search stays within budget (p95 over 10 queries)', async () => {
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const { res, ms } = await timed(A.receptionist, `/api/v1/patients/search?q=PerfPat${i * 37}`);
        expect(JSON.stringify(res.body.data)).toContain(`PerfPat${i * 37}`);
        times.push(ms);
      }
      expect(p95(times)).toBeLessThan(BUDGET_MS);
    });

    it('paginated list (max page size) stays within budget and returns one page', async () => {
      const { res, ms } = await timed(A.receptionist, '/api/v1/patients?limit=200&page=3');
      expect(res.body.data).toHaveLength(200);
      expect(res.body.meta.page).toBe(3);
      expect(ms).toBeLessThan(BUDGET_MS);
    });

    it('profile and summary fetches stay within budget', async () => {
      const times: number[] = [];
      for (const id of patientIds.slice(0, 10)) {
        times.push((await timed(A.receptionist, `/api/v1/patients/${id}`)).ms);
        times.push((await timed(A.doctor, `/api/v1/patients/${id}/summary`)).ms);
      }
      expect(p95(times)).toBeLessThan(BUDGET_MS);
    });
  });

  it('appointment list stays within budget', async () => {
    const { res, ms } = await timed(A.receptionist, '/api/v1/appointments?limit=100');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('invoice list stays within budget', async () => {
    const { res, ms } = await timed(A.accountant, '/api/v1/invoices?limit=100');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('live queue stays within budget', async () => {
    expect((await timed(A.receptionist, '/api/v1/queues/live')).ms).toBeLessThan(BUDGET_MS);
  });

  it('dashboards stay within budget', async () => {
    expect((await timed(A.doctor, '/api/v1/analytics/doctor/me')).ms).toBeLessThan(BUDGET_MS * 2);
    expect((await timed(A.owner, '/api/v1/analytics/overview')).ms).toBeLessThan(BUDGET_MS * 2);
    expect((await timed(A.receptionist, '/api/v1/analytics/today')).ms).toBeLessThan(BUDGET_MS * 2);
  });

  it('handles 30 concurrent list requests without errors', async () => {
    const t0 = Date.now();
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => http().get(`/api/v1/patients?limit=20&page=${(i % 10) + 1}`).set(auth(A.receptionist))),
    );
    const ms = Date.now() - t0;
    expect(results.filter((r) => r.status === 200)).toHaveLength(30);
    expect(ms).toBeLessThan(BUDGET_MS * 5);
  });

  it('tenant-scoped count and include queries stay within budget', async () => {
    let t0 = Date.now();
    expect(await prisma.patient.count({ where: { organizationId: A.org.id } })).toBe(PATIENTS);
    expect(Date.now() - t0).toBeLessThan(500);

    t0 = Date.now();
    const rows = await prisma.patient.findMany({
      where: { organizationId: A.org.id },
      include: { appointments: true, invoices: true },
      take: 100,
    });
    expect(rows).toHaveLength(100);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
