import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { Tenant, auth, createPatient, createTenant, createTestApp, login, TEST_PASSWORD, TenantUser } from './helpers/app';
import { addDays, localInfo, zonedTimeToUtc } from '../src/clinic-settings/timezone';
import { hash } from 'bcryptjs';

const TZ = 'Asia/Kolkata';

describe('Doctors, slots and appointments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let doctor2: TenantUser;
  let patient: any;
  let patientB: any;
  const http = () => request(app.getHttpServer());

  // D = a working day 3+ days ahead in the branch timezone
  const D = addDays(localInfo(new Date(), TZ).date, 3);
  const at = (date: string, time: string, minutes = 30) => {
    const start = zonedTimeToUtc(date, time, TZ);
    return { scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + minutes * 60000).toISOString() };
  };
  const allWeek = (start: string, end: string, slotDuration = 30) =>
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: start, endTime: end, slotDuration }));

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'Appt A', { branchTimezone: TZ });
    B = await createTenant(app, prisma, 'Appt B', { roles: ['Organization Owner', 'Receptionist', 'Doctor'] });

    // a second doctor in tenant A
    const role = await prisma.role.findFirst({ where: { organizationId: A.org.id, name: 'Doctor' } });
    const email = `doctor2.${A.org.slug}@example.test`;
    const u = await prisma.user.create({
      data: { organizationId: A.org.id, branchId: A.branch.id, email, passwordHash: await hash(TEST_PASSWORD, 4), firstName: 'Second', lastName: 'Doctor' },
    });
    await prisma.userRole.create({ data: { organizationId: A.org.id, branchId: A.branch.id, userId: u.id, roleId: role!.id } });
    const s = await login(app, email);
    doctor2 = { id: u.id, email, role: 'Doctor', token: s.accessToken, sessionId: s.sessionId, refreshToken: s.refreshToken };

    patient = await createPatient(app, A.receptionist);
    patientB = await createPatient(app, B.receptionist);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('doctor profiles', () => {
    it('lists doctors of the branch for staff with doctors.view', async () => {
      const res = await http().get('/api/v1/doctors').set(auth(A.receptionist));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((d: any) => d.id);
      expect(ids).toEqual(expect.arrayContaining([A.doctor.id, doctor2.id]));
      expect(ids).not.toContain(A.receptionist.id);
      expect(res.body.data[0].passwordHash).toBeUndefined();
    });

    it('doctor updates own profile; cannot edit another doctor (403)', async () => {
      const own = await http().patch(`/api/v1/doctors/${A.doctor.id}`).set(auth(A.doctor)).send({ bio: 'GP', experienceYears: 7, consultationFee: 650.5, organizationId: B.org.id });
      expect(own.status).toBe(200);
      expect(own.body.data.experienceYears).toBe(7);
      expect(String(own.body.data.consultationFee)).toBe('650.5');
      expect(own.body.data.organizationId).toBe(A.org.id);
      const other = await http().patch(`/api/v1/doctors/${doctor2.id}`).set(auth(A.doctor)).send({ bio: 'hijack' });
      expect(other.status).toBe(403);
    });

    it('manager (doctors.manage) edits any doctor; nurse cannot', async () => {
      expect((await http().patch(`/api/v1/doctors/${doctor2.id}`).set(auth(A.manager)).send({ specialization: 'Pediatrics' })).status).toBe(200);
      expect((await http().patch(`/api/v1/doctors/${doctor2.id}`).set(auth(A.nurse)).send({ bio: 'x' })).status).toBe(403);
    });

    it('cross-tenant doctor ids are 404; non-doctors are 404', async () => {
      expect((await http().get(`/api/v1/doctors/${A.doctor.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().patch(`/api/v1/doctors/${A.doctor.id}`).set(auth(B.owner)).send({ bio: 'x' })).status).toBe(404);
      expect((await http().get(`/api/v1/doctors/${A.receptionist.id}`).set(auth(A.owner))).status).toBe(404);
    });
  });

  describe('availability, leave and slots', () => {
    it('doctor sets own weekly availability (overlaps rejected)', async () => {
      const bad = await http().put(`/api/v1/doctors/${A.doctor.id}/availability`).set(auth(A.doctor)).send({
        blocks: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotDuration: 15 }, { dayOfWeek: 1, startTime: '11:00', endTime: '13:00', slotDuration: 15 }],
      });
      expect(bad.status).toBe(400);
      const res = await http().put(`/api/v1/doctors/${A.doctor.id}/availability`).set(auth(A.doctor)).send({ blocks: allWeek('09:00', '17:00') });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(7);
    });

    it('RBAC: doctor cannot edit another doctor\'s availability; receptionist cannot edit any', async () => {
      expect((await http().put(`/api/v1/doctors/${doctor2.id}/availability`).set(auth(A.doctor)).send({ blocks: allWeek('09:00', '10:00') })).status).toBe(403);
      expect((await http().post(`/api/v1/doctors/${A.doctor.id}/availability`).set(auth(A.receptionist)).send({ dayOfWeek: 1, startTime: '18:00', endTime: '19:00', slotDuration: 15 })).status).toBe(403);
      expect((await http().post(`/api/v1/doctors/${A.doctor.id}/leaves`).set(auth(A.receptionist)).send({ startDate: D, endDate: D })).status).toBe(403);
      expect((await http().put(`/api/v1/doctors/${A.doctor.id}/availability`).set(auth(B.owner)).send({ blocks: [] })).status).toBe(404);
    });

    it('manager manages another doctor\'s availability via single-block CRUD', async () => {
      const add = await http().post(`/api/v1/doctors/${doctor2.id}/availability`).set(auth(A.manager)).send({ dayOfWeek: 2, startTime: '10:00', endTime: '12:00', slotDuration: 20 });
      expect(add.status).toBe(201);
      const clash = await http().post(`/api/v1/doctors/${doctor2.id}/availability`).set(auth(A.manager)).send({ dayOfWeek: 2, startTime: '11:00', endTime: '13:00', slotDuration: 20 });
      expect(clash.status).toBe(400);
      const upd = await http().patch(`/api/v1/doctors/${doctor2.id}/availability/${add.body.data.id}`).set(auth(A.manager)).send({ endTime: '13:00' });
      expect(upd.body.data.endTime).toBe('13:00');
      expect((await http().delete(`/api/v1/doctors/${doctor2.id}/availability/${add.body.data.id}`).set(auth(A.manager))).status).toBe(200);
    });

    it('computes slots in the branch timezone', async () => {
      const res = await http().get(`/api/v1/doctors/${A.doctor.id}/slots?date=${D}`).set(auth(A.receptionist));
      expect(res.status).toBe(200);
      const day = res.body.data;
      expect(day.timezone).toBe(TZ);
      expect(day.slots).toHaveLength(16);
      expect(day.slots[0].time).toBe('09:00');
      expect(day.slots[0].start).toBe(zonedTimeToUtc(D, '09:00', TZ).toISOString());
      expect(day.slots.every((s: any) => s.available)).toBe(true);
      expect((await http().get(`/api/v1/doctors/${A.doctor.id}/slots?date=2030-02-31`).set(auth(A.receptionist))).status).toBe(400);
      expect((await http().get(`/api/v1/doctors/${A.doctor.id}/slots?date=${D}`).set(auth(B.owner))).status).toBe(404);
    });

    it('leave blocks slots and booking (force override needs appointments.update)', async () => {
      const L = addDays(D, 1);
      const leave = await http().post(`/api/v1/doctors/${A.doctor.id}/leaves`).set(auth(A.doctor)).send({ startDate: L, endDate: L, reason: 'Conference' });
      expect(leave.status).toBe(201);
      expect((await http().post(`/api/v1/doctors/${A.doctor.id}/leaves`).set(auth(A.doctor)).send({ startDate: L, endDate: L })).status).toBe(409);
      const slots = await http().get(`/api/v1/doctors/${A.doctor.id}/slots?date=${L}`).set(auth(A.receptionist));
      expect(slots.body.data.slots.every((s: any) => s.reason === 'leave')).toBe(true);

      const blocked = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(L, '10:00') });
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toMatch(/leave/i);
      const forced = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(L, '10:00'), force: true });
      expect(forced.status).toBe(201);
      expect(forced.body.data.scheduleOverride.join(' ')).toMatch(/leave/i);

      const list = await http().get(`/api/v1/doctors/${A.doctor.id}/leaves`).set(auth(A.nurse));
      expect(list.body.data.map((l: any) => l.id)).toContain(leave.body.data.id);
      expect((await http().delete(`/api/v1/doctors/${A.doctor.id}/leaves/${leave.body.data.id}`).set(auth(doctor2))).status).toBe(403);
      expect((await http().delete(`/api/v1/doctors/${A.doctor.id}/leaves/${leave.body.data.id}`).set(auth(A.doctor))).status).toBe(200);
    });

    it('holidays close the day for slots and bookings', async () => {
      const H = addDays(D, 2);
      const h = await http().post('/api/v1/clinic-settings/holidays').set(auth(A.admin)).send({ name: 'Festival', date: H });
      expect(h.status).toBe(201);
      const slots = await http().get(`/api/v1/doctors/${A.doctor.id}/slots?date=${H}`).set(auth(A.receptionist));
      expect(slots.body.data.closed).toBe(true);
      expect(slots.body.data.reason).toMatch(/Festival/);
      const res = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(H, '10:00') });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/holiday/i);
    });
  });

  describe('booking and lifecycle', () => {
    let appt: any;

    it('books inside availability; rejects outside availability, overlaps and the past', async () => {
      const res = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '10:00'), appointmentType: 'Consultation' });
      expect(res.status).toBe(201);
      appt = res.body.data;
      expect(appt.status).toBe('SCHEDULED');
      expect(appt.organizationId).toBe(A.org.id);

      const outside = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '20:00') });
      expect(outside.status).toBe(409);
      expect(outside.body.message).toMatch(/availability/i);

      const overlap = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '10:15') });
      expect(overlap.status).toBe(409);
      const overlapForced = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '10:15'), force: true });
      expect(overlapForced.status).toBe(409);

      const past = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, scheduledStart: new Date(Date.now() - 3600000).toISOString(), scheduledEnd: new Date(Date.now() - 1800000).toISOString() });
      expect(past.status).toBe(400);
      const invalid = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: 'nope', doctorId: A.doctor.id });
      expect(invalid.status).toBe(400);

      const slots = await http().get(`/api/v1/doctors/${A.doctor.id}/slots?date=${D}`).set(auth(A.receptionist));
      const ten = slots.body.data.slots.find((s: any) => s.time === '10:00');
      expect(ten).toMatchObject({ available: false, reason: 'booked' });
    });

    it('RBAC: nurse and doctor cannot create appointments', async () => {
      expect((await http().post('/api/v1/appointments').set(auth(A.nurse)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '11:00') })).status).toBe(403);
      expect((await http().post('/api/v1/appointments').set(auth(A.doctor)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '11:00') })).status).toBe(403);
    });

    it('cross-tenant: other org cannot read/modify or book with foreign ids', async () => {
      expect((await http().get(`/api/v1/appointments/${appt.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().post(`/api/v1/appointments/${appt.id}/reschedule`).set(auth(B.receptionist)).send(at(D, '12:00'))).status).toBe(404);
      expect((await http().post(`/api/v1/appointments/${appt.id}/cancel`).set(auth(B.receptionist)).send({ reason: 'x' })).status).toBe(404);
      expect((await http().post('/api/v1/appointments').set(auth(B.receptionist)).send({ patientId: patient.id, doctorId: B.doctor.id, ...at(D, '10:00') })).status).toBe(404);
      expect((await http().post('/api/v1/appointments').set(auth(B.receptionist)).send({ patientId: patientB.id, doctorId: A.doctor.id, ...at(D, '10:00') })).status).toBe(404);
      const list = await http().get('/api/v1/appointments').set(auth(B.owner));
      expect(list.body.data.some((a: any) => a.id === appt.id)).toBe(false);
    });

    it('filters by date, doctor and status with pagination', async () => {
      await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '11:00') });
      const res = await http().get(`/api/v1/appointments?date=${D}&doctorId=${A.doctor.id}&status=SCHEDULED&limit=1&page=1`).set(auth(A.receptionist));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.data[0].id).toBe(appt.id);
      const page2 = await http().get(`/api/v1/appointments?date=${D}&doctorId=${A.doctor.id}&status=SCHEDULED&limit=1&page=2`).set(auth(A.receptionist));
      expect(page2.body.data[0].id).not.toBe(appt.id);
      const range = await http().get(`/api/v1/appointments?from=${D}&to=${addDays(D, 7)}&doctorId=${doctor2.id}`).set(auth(A.receptionist));
      expect(range.body.meta.total).toBe(0);
      expect((await http().get('/api/v1/appointments?status=BOGUS').set(auth(A.receptionist))).status).toBe(400);
    });

    it('reschedules to a free slot and rejects a taken one', async () => {
      const taken = await http().post(`/api/v1/appointments/${appt.id}/reschedule`).set(auth(A.receptionist)).send(at(D, '11:00'));
      expect(taken.status).toBe(409);
      const res = await http().post(`/api/v1/appointments/${appt.id}/reschedule`).set(auth(A.receptionist)).send({ ...at(D, '14:00'), reason: 'Patient request' });
      expect(res.status).toBe(200);
      expect(res.body.data.scheduledStart).toBe(at(D, '14:00').scheduledStart);
    });

    it('doctor may update own appointments only; doctor cannot cancel', async () => {
      expect((await http().post(`/api/v1/appointments/${appt.id}/confirm`).set(auth(doctor2))).status).toBe(403);
      expect((await http().patch(`/api/v1/appointments/${appt.id}`).set(auth(doctor2)).send({ notes: 'x' })).status).toBe(403);
      const ok = await http().post(`/api/v1/appointments/${appt.id}/confirm`).set(auth(A.doctor));
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('CONFIRMED');
      expect((await http().post(`/api/v1/appointments/${appt.id}/cancel`).set(auth(A.doctor)).send({ reason: 'x' })).status).toBe(403);
    });

    it('enforces the state machine: check-in -> complete; invalid transitions are 409', async () => {
      expect((await http().post(`/api/v1/appointments/${appt.id}/no-show`).set(auth(A.receptionist))).status).toBe(409);
      const checkIn = await http().post(`/api/v1/appointments/${appt.id}/check-in`).set(auth(A.receptionist));
      expect(checkIn.status).toBe(200);
      expect(checkIn.body.data.status).toBe('CHECKED_IN');
      const entry = await prisma.queueEntry.findFirst({ where: { appointmentId: appt.id } });
      expect(entry?.status).toBe('WAITING');
      expect((await http().post(`/api/v1/appointments/${appt.id}/reschedule`).set(auth(A.receptionist)).send(at(D, '15:00'))).status).toBe(409);
      const done = await http().post(`/api/v1/appointments/${appt.id}/complete`).set(auth(A.doctor));
      expect(done.status).toBe(200);
      expect(done.body.data.status).toBe('COMPLETED');
      expect((await prisma.queueEntry.findFirst({ where: { appointmentId: appt.id } }))?.status).toBe('COMPLETED');
      expect((await http().post(`/api/v1/appointments/${appt.id}/cancel`).set(auth(A.receptionist)).send({ reason: 'late' })).status).toBe(409);
    });

    it('cancels with a reason (required) and frees the slot', async () => {
      const b = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '15:00') });
      expect(b.status).toBe(201);
      expect((await http().post(`/api/v1/appointments/${b.body.data.id}/cancel`).set(auth(A.receptionist)).send({})).status).toBe(400);
      const c = await http().post(`/api/v1/appointments/${b.body.data.id}/cancel`).set(auth(A.receptionist)).send({ reason: 'Patient unwell' });
      expect(c.status).toBe(200);
      expect(c.body.data).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Patient unwell' });
      const again = await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, ...at(D, '15:00') });
      expect(again.status).toBe(201);
    });

    it('marks a past appointment as no-show', async () => {
      const past = await prisma.appointment.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: patient.id,
          doctorId: A.doctor.id,
          scheduledStart: new Date(Date.now() - 2 * 3600000),
          scheduledEnd: new Date(Date.now() - 1.5 * 3600000),
        },
      });
      const res = await http().post(`/api/v1/appointments/${past.id}/no-show`).set(auth(A.receptionist));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('NO_SHOW');
    });

    it('exports CSV', async () => {
      const res = await http().get(`/api/v1/appointments/export/csv?date=${D}`).set(auth(A.manager));
      expect(res.status).toBe(200);
      expect(res.text).toContain('Start Time');
      expect((await http().get('/api/v1/appointments/export/csv').set(auth(A.receptionist))).status).toBe(403);
    });
  });

  describe('waitlist', () => {
    it('adds, lists, updates and removes waitlist entries with RBAC and tenant isolation', async () => {
      const add = await http().post('/api/v1/appointments/waitlist').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, preferredDate: D });
      expect(add.status).toBe(201);
      expect((await http().post('/api/v1/appointments/waitlist').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id })).status).toBe(409);
      expect((await http().post('/api/v1/appointments/waitlist').set(auth(A.nurse)).send({ patientId: patient.id, doctorId: doctor2.id })).status).toBe(403);
      const list = await http().get('/api/v1/appointments/waitlist').set(auth(A.nurse));
      expect(list.body.data.map((w: any) => w.id)).toContain(add.body.data.id);
      expect((await http().get('/api/v1/appointments/waitlist').set(auth(B.owner))).body.data).toHaveLength(0);
      expect((await http().delete(`/api/v1/appointments/waitlist/${add.body.data.id}`).set(auth(B.receptionist))).status).toBe(404);
      const upd = await http().patch(`/api/v1/appointments/waitlist/${add.body.data.id}`).set(auth(A.receptionist)).send({ status: 'CONTACTED' });
      expect(upd.body.data.status).toBe('CONTACTED');
      expect((await http().delete(`/api/v1/appointments/waitlist/${add.body.data.id}`).set(auth(A.receptionist))).status).toBe(200);
    });
  });
});
