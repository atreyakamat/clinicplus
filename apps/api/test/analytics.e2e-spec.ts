/**
 * Analytics & dashboards: SQL aggregates, doctor isolation, permission gating, tenant isolation.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, Tenant, TenantUser } from './helpers/app';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let doctor2: { id: string };
  let p1: any;
  let p2: any;
  let docInvoice: any;
  const http = () => request(app.getHttpServer());
  const get = (u: TenantUser, url: string) => http().get(url).set(auth(u));

  async function appt(doctorId: string, patientId: string, at: Date, status: any) {
    return prisma.appointment.create({
      data: {
        organizationId: A.org.id,
        branchId: A.branch.id,
        doctorId,
        patientId,
        scheduledStart: at,
        scheduledEnd: new Date(at.getTime() + 15 * 60_000),
        status,
      },
    });
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    // UTC branch keeps the "today" boundaries simple for assertions
    A = await createTenant(app, prisma, 'AnaA', { branchTimezone: 'UTC' });
    B = await createTenant(app, prisma, 'AnaB', { roles: ['Organization Owner', 'Doctor'] });
    const doctorRole = await prisma.role.findFirstOrThrow({ where: { organizationId: A.org.id, name: 'Doctor' } });
    doctor2 = await prisma.user.create({
      data: { organizationId: A.org.id, branchId: A.branch.id, email: `doc2.${A.org.slug}@example.test`, firstName: 'Second', lastName: 'Doc' },
    });
    await prisma.userRole.create({ data: { organizationId: A.org.id, branchId: A.branch.id, userId: doctor2.id, roleId: doctorRole.id } });
    p1 = await createPatient(app, A.receptionist);
    p2 = await createPatient(app, A.receptionist);

    const now = Date.now();
    const todayNoon = new Date();
    todayNoon.setUTCHours(12, 0, 0, 0);
    const a1 = await appt(A.doctor.id, p1.id, new Date(now - 2 * DAY), 'COMPLETED');
    await appt(A.doctor.id, p2.id, new Date(now - 3 * DAY), 'NO_SHOW');
    await appt(A.doctor.id, p2.id, todayNoon, 'SCHEDULED');
    const d2a = await appt(doctor2.id, p1.id, new Date(now - 5 * DAY), 'COMPLETED');
    await appt(doctor2.id, p2.id, new Date(now - 6 * DAY), 'COMPLETED');

    // revenue attributed to each doctor through invoice.appointmentId
    docInvoice = (
      await http().post('/api/v1/invoices').set(auth(A.receptionist)).send({
        patientId: p1.id, appointmentId: a1.id, issue: true, items: [{ itemName: 'Consult', quantity: 1, unitPrice: 700 }],
      })
    ).body.data;
    await http().post(`/api/v1/invoices/${docInvoice.id}/payments`).set(auth(A.receptionist)).send({ amount: 700, paymentMethod: 'CASH' });
    const inv2 = (
      await http().post('/api/v1/invoices').set(auth(A.receptionist)).send({
        patientId: p1.id, appointmentId: d2a.id, issue: true, items: [{ itemName: 'Consult', quantity: 1, unitPrice: 900 }],
      })
    ).body.data;
    await http().post(`/api/v1/invoices/${inv2.id}/payments`).set(auth(A.receptionist)).send({ amount: 400, paymentMethod: 'UPI' });

    // queue: 12 minute wait
    const queue = await prisma.queue.create({ data: { organizationId: A.org.id, branchId: A.branch.id, name: 'OPD' } });
    await prisma.queueEntry.create({
      data: {
        organizationId: A.org.id, branchId: A.branch.id, queueId: queue.id, appointmentId: a1.id, tokenNumber: 1,
        checkInTime: new Date(now - 2 * DAY), calledTime: new Date(now - 2 * DAY + 12 * 60_000), status: 'COMPLETED',
      },
    });
    // follow-ups: one done, one not
    for (const status of ['COMPLETED', 'OPEN']) {
      await prisma.followUp.create({
        data: { organizationId: A.org.id, branchId: A.branch.id, patientId: p1.id, doctorId: A.doctor.id, scheduledDate: new Date(now - DAY), status },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('doctor/me returns ONLY the caller\'s data (fixes branch-wide totals)', async () => {
    const res = await get(A.doctor, '/api/v1/analytics/doctor/me');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.doctorId).toBe(A.doctor.id);
    expect(d.appointments.total).toBe(3);
    expect(d.appointments.completed).toBe(1);
    expect(d.appointments.noShow).toBe(1);
    expect(d.appointments.noShowRate).toBe(50);
    expect(d.appointments.uniquePatients).toBe(2);
    expect(d.today.total).toBe(1);
    expect(d.today.appointments).toHaveLength(1);
    expect(d.revenue).toEqual({ billed: '700.00', collected: '700.00', invoices: 1 });
    expect(d.queue.avgWaitMinutes).toBe(12);
    expect(d.followUps.complianceRate).toBe(50);
    expect(d.daily.length).toBe(d.range.days);
  });

  it('a doctor cannot read another doctor\'s analytics or clinic KPIs', async () => {
    expect((await get(A.doctor, `/api/v1/analytics/doctors/${doctor2.id}`)).status).toBe(403);
    expect((await get(A.doctor, '/api/v1/analytics/overview')).status).toBe(403);
    expect((await get(A.doctor, '/api/v1/analytics/revenue')).status).toBe(403);
    // client-supplied doctorId is ignored on /me (whitelisted DTO)
    const res = await get(A.doctor, `/api/v1/analytics/doctor/me?doctorId=${doctor2.id}`);
    expect(res.body.data.doctorId).toBe(A.doctor.id);
  });

  it('managers (analytics.view) can read any doctor of their org; other tenants 404', async () => {
    const res = await get(A.owner, `/api/v1/analytics/doctors/${doctor2.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.appointments.total).toBe(2);
    expect(res.body.data.revenue.billed).toBe('900.00');
    expect((await get(A.owner, `/api/v1/analytics/doctors/${B.doctor.id}`)).status).toBe(404);
    expect((await get(B.owner, `/api/v1/analytics/doctors/${A.doctor.id}`)).status).toBe(404);
  });

  it('overview KPIs (with revenue for analytics.financial)', async () => {
    const res = await get(A.owner, '/api/v1/analytics/overview');
    expect(res.status).toBe(200);
    const o = res.body.data;
    expect(o.appointments.total).toBe(5);
    expect(o.appointments.noShowRate).toBe(25);
    expect(o.today.total).toBe(1);
    expect(o.patients.patientsSeen).toBe(2);
    expect(o.patients.registered).toBe(2);
    expect(o.queue.avgWaitMinutes).toBe(12);
    expect(o.followUps).toMatchObject({ due: 2, completed: 1, complianceRate: 50 });
    expect(o.revenue.collected).toBe('1100.00');
    expect(o.revenue.invoiced).toBe('1600.00');
    expect(o.revenue.outstanding).toBe('500.00');
    // accountant: financial but no analytics.view
    expect((await get(A.accountant, '/api/v1/analytics/overview')).status).toBe(403);
    const other = await get(B.owner, '/api/v1/analytics/overview');
    expect(other.body.data.appointments.total).toBe(0);
  });

  it('revenue trends (analytics.financial) with zero-filled series', async () => {
    const res = await get(A.accountant, '/api/v1/analytics/revenue?interval=day');
    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(30);
    const total = res.body.data.series.reduce((s: number, r: any) => s + Number(r.collected), 0);
    expect(total).toBe(1100);
    const monthly = await get(A.owner, '/api/v1/analytics/revenue?from=2026-01-01&to=2026-12-31&interval=month');
    expect(monthly.body.data.series).toHaveLength(12);
    expect((await get(A.receptionist, '/api/v1/analytics/revenue')).status).toBe(403);
  });

  it('retention: repeat patients and monthly returning share', async () => {
    const res = await get(A.owner, '/api/v1/analytics/retention');
    expect(res.status).toBe(200);
    expect(res.body.data.patientsWithVisits).toBe(2);
    expect(res.body.data.repeatPatients).toBe(1); // p1: one visit with each doctor
    expect(res.body.data.repeatRate).toBe(50);
    expect(Array.isArray(res.body.data.monthly)).toBe(true);
  });

  it('branch comparison is for org-wide roles only', async () => {
    const res = await get(A.owner, '/api/v1/analytics/branches');
    expect(res.status).toBe(200);
    expect(res.body.data.branches).toHaveLength(1);
    expect(res.body.data.branches[0].collected).toBe('1100.00');
    expect((await get(A.manager, '/api/v1/analytics/branches')).status).toBe(403);
    expect((await get(A.manager, '/api/v1/analytics/overview?scope=org')).status).toBe(403);
    expect((await get(A.owner, '/api/v1/analytics/overview?scope=org')).status).toBe(200);
  });

  it('today snapshot is gated per block', async () => {
    const rec = (await get(A.receptionist, '/api/v1/analytics/today')).body.data;
    expect(rec.appointments.total).toBe(1);
    expect(rec.collections).toBeDefined();
    expect(rec.invoices).toBeDefined();
    const nurse = (await get(A.nurse, '/api/v1/analytics/today')).body.data;
    expect(nurse.collections).toBeUndefined();
    expect(nurse.invoices).toBeUndefined();
    expect(nurse.queue).toBeDefined();
    const doc = (await get(A.doctor, '/api/v1/analytics/today?mine=true')).body.data;
    expect(doc.appointments.list.every((a: any) => a.doctor.id === A.doctor.id)).toBe(true);
    expect(doc.collections).toBeUndefined();
  });
});
