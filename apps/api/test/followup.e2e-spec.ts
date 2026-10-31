import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { FollowUpComplianceService } from '../src/follow-ups/follow-up-compliance.service';
import { auth, createPatient, createTenant, createTestApp, Tenant } from './helpers/app';

const DAY = 24 * 3600_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

describe('Follow-ups (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    http = () => request(app.getHttpServer());
    A = await createTenant(app, prisma, 'FU Clinic A');
    B = await createTenant(app, prisma, 'FU Clinic B');
    patient = await createPatient(app, A.receptionist);
  });

  afterAll(async () => {
    await app.close();
  });

  const createFollowUp = (body: Record<string, unknown>, user = A.doctor) =>
    http().post('/api/v1/follow-ups').set(auth(user)).send(body);

  describe('CRUD, filters and status transitions', () => {
    let followUpId: string;

    it('doctor creates a follow-up (PENDING, doctor defaults to self)', async () => {
      const res = await createFollowUp({ patientId: patient.id, scheduledDate: iso(7), reason: 'BP review' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.doctorId).toBe(A.doctor.id);
      followUpId = res.body.data.id;
    });

    it('rejects invalid bodies and unknown fields are stripped', async () => {
      const res = await createFollowUp({ patientId: patient.id });
      expect(res.status).toBe(400);
      const res2 = await createFollowUp({
        patientId: patient.id,
        scheduledDate: iso(3),
        organizationId: B.org.id,
      });
      expect(res2.status).toBe(201);
      expect(res2.body.data.organizationId).toBe(A.org.id);
    });

    it('rejects a patient from another tenant', async () => {
      const other = await createPatient(app, B.receptionist);
      const res = await createFollowUp({ patientId: other.id, scheduledDate: iso(3) });
      expect(res.status).toBe(404);
    });

    it('nurse cannot create follow-ups; accountant cannot view them', async () => {
      const res = await createFollowUp({ patientId: patient.id, scheduledDate: iso(3) }, A.nurse);
      expect(res.status).toBe(403);
      const list = await http().get('/api/v1/follow-ups').set(auth(A.accountant));
      expect(list.status).toBe(403);
    });

    it('gets by id; tenant B gets 404', async () => {
      const res = await http().get(`/api/v1/follow-ups/${followUpId}`).set(auth(A.receptionist));
      expect(res.status).toBe(200);
      expect(res.body.data.patient.id).toBe(patient.id);
      expect(res.body.data.isOverdue).toBe(false);
      const cross = await http().get(`/api/v1/follow-ups/${followUpId}`).set(auth(B.owner));
      expect(cross.status).toBe(404);
      const crossPatch = await http()
        .patch(`/api/v1/follow-ups/${followUpId}/status`)
        .set(auth(B.owner))
        .send({ status: 'CANCELLED' });
      expect(crossPatch.status).toBe(404);
    });

    it('lists with filters and pagination meta', async () => {
      const overdue = await createFollowUp({ patientId: patient.id, scheduledDate: iso(-1), reason: 'Overdue one' });
      expect(overdue.status).toBe(201);
      const all = await http().get('/api/v1/follow-ups?limit=2').set(auth(A.receptionist));
      expect(all.status).toBe(200);
      expect(all.body.data.length).toBeLessThanOrEqual(2);
      expect(all.body.meta.total).toBeGreaterThanOrEqual(3);

      const od = await http().get('/api/v1/follow-ups?overdue=true').set(auth(A.receptionist));
      expect(od.body.data.map((f: any) => f.id)).toEqual([overdue.body.data.id]);
      expect(od.body.data[0].isOverdue).toBe(true);

      const byDoctor = await http().get(`/api/v1/follow-ups?doctorId=${A.doctor.id}&status=PENDING`).set(auth(A.receptionist));
      expect(byDoctor.body.meta.total).toBeGreaterThanOrEqual(3);

      const range = await http()
        .get(`/api/v1/follow-ups?from=${encodeURIComponent(iso(6))}&to=${encodeURIComponent(iso(8))}`)
        .set(auth(A.receptionist));
      expect(range.body.data.map((f: any) => f.id)).toEqual([followUpId]);

      const bad = await http().get('/api/v1/follow-ups?status=BOGUS').set(auth(A.receptionist));
      expect(bad.status).toBe(400);

      const crossList = await http().get('/api/v1/follow-ups').set(auth(B.owner));
      expect(crossList.body.meta.total).toBe(0);
    });

    it('reschedules via PATCH (receptionist) and audits', async () => {
      const res = await http()
        .patch(`/api/v1/follow-ups/${followUpId}`)
        .set(auth(A.receptionist))
        .send({ scheduledDate: iso(10), notes: 'Patient asked for later date' });
      expect(res.status).toBe(200);
      expect(new Date(res.body.data.scheduledDate).getTime()).toBeGreaterThan(Date.now() + 9 * DAY);
      expect(res.body.data.notes).toBe('Patient asked for later date');
    });

    it('records an outcome and completes; completed is terminal', async () => {
      const res = await http()
        .post(`/api/v1/follow-ups/${followUpId}/outcomes`)
        .set(auth(A.nurse))
        .send({ outcomeType: 'IMPROVING', remarks: 'BP normal', complete: true });
      expect(res.status).toBe(201);
      expect(res.body.data.outcomeType).toBe('IMPROVING');
      const after = await http().get(`/api/v1/follow-ups/${followUpId}`).set(auth(A.nurse));
      expect(after.body.data.status).toBe('COMPLETED');
      expect(after.body.data.outcomes).toHaveLength(1);

      const reopen = await http()
        .patch(`/api/v1/follow-ups/${followUpId}/status`)
        .set(auth(A.nurse))
        .send({ status: 'PENDING' });
      expect(reopen.status).toBe(400);
      const badOutcome = await http()
        .post(`/api/v1/follow-ups/${followUpId}/outcomes`)
        .set(auth(A.nurse))
        .send({ outcomeType: 'NOT_A_TYPE' });
      expect(badOutcome.status).toBe(400);
    });

    it('manual MISSED creates a front-desk call task (once)', async () => {
      const fu = await createFollowUp({ patientId: patient.id, scheduledDate: iso(2) });
      const res = await http()
        .patch(`/api/v1/follow-ups/${fu.body.data.id}/status`)
        .set(auth(A.receptionist))
        .send({ status: 'MISSED' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MISSED');
      const tasks = await prisma.task.findMany({
        where: { sourceType: 'FOLLOW_UP_MISSED', sourceId: fu.body.data.id },
      });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].assignedTo).toBe(A.receptionist.id);
      expect(tasks[0].organizationId).toBe(A.org.id);
    });
  });

  describe('compliance job and metrics', () => {
    let missedPatient: any;
    let missedId: string;
    let linkedId: string;
    let appointmentId: string;

    beforeAll(async () => {
      missedPatient = await createPatient(app, A.receptionist);
      const p2 = await createPatient(app, A.receptionist);
      const missed = await createFollowUp({ patientId: missedPatient.id, scheduledDate: iso(-5), reason: 'Wound check' });
      missedId = missed.body.data.id;
      const linked = await createFollowUp({ patientId: p2.id, scheduledDate: iso(3) });
      linkedId = linked.body.data.id;
      const start = new Date(Date.now() + 3 * DAY);
      const appt = await prisma.appointment.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: p2.id,
          doctorId: A.doctor.id,
          scheduledStart: start,
          scheduledEnd: new Date(start.getTime() + 30 * 60_000),
          status: 'SCHEDULED',
        },
      });
      appointmentId = appt.id;
    });

    it('marks past-due follow-ups MISSED with a task, links booked appointments', async () => {
      const svc = app.get(FollowUpComplianceService);
      const result: any = await svc.runOnce(new Date(), A.org.id);
      expect(result.skipped).toBeUndefined();

      const missed = await http().get(`/api/v1/follow-ups/${missedId}`).set(auth(A.receptionist));
      expect(missed.body.data.status).toBe('MISSED');
      const task = await prisma.task.findFirst({ where: { sourceType: 'FOLLOW_UP_MISSED', sourceId: missedId } });
      expect(task).toBeTruthy();
      expect(task!.patientId).toBe(missedPatient.id);
      expect(task!.assignedTo).toBe(A.receptionist.id);

      const linked = await http().get(`/api/v1/follow-ups/${linkedId}`).set(auth(A.receptionist));
      expect(linked.body.data.status).toBe('SCHEDULED');
      expect(linked.body.data.appointmentId).toBe(appointmentId);

      // Idempotent: a second pass creates nothing new.
      await svc.runOnce(new Date(), A.org.id);
      expect(await prisma.task.count({ where: { sourceType: 'FOLLOW_UP_MISSED', sourceId: missedId } })).toBe(1);

      // The receptionist sees the call task in "my tasks".
      const mine = await http().get('/api/v1/tasks').set(auth(A.receptionist));
      expect(mine.body.data.some((t: any) => t.id === task!.id)).toBe(true);
    });

    it('completes the follow-up when its appointment is completed', async () => {
      await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } });
      await app.get(FollowUpComplianceService).runOnce(new Date(), A.org.id);
      const res = await http().get(`/api/v1/follow-ups/${linkedId}`).set(auth(A.receptionist));
      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('rejects linking an appointment of another patient', async () => {
      const fu = await createFollowUp({ patientId: missedPatient.id, scheduledDate: iso(4) });
      const res = await http()
        .patch(`/api/v1/follow-ups/${fu.body.data.id}`)
        .set(auth(A.receptionist))
        .send({ appointmentId });
      expect(res.status).toBe(400);
    });

    it('reports compliance metrics with at-risk patients', async () => {
      const res = await http()
        .get(`/api/v1/follow-ups/metrics?from=${encodeURIComponent(iso(-30))}&to=${encodeURIComponent(iso(30))}`)
        .set(auth(A.manager));
      expect(res.status).toBe(200);
      const m = res.body.data;
      expect(m.byStatus.MISSED).toBeGreaterThanOrEqual(2);
      expect(m.byStatus.COMPLETED).toBeGreaterThanOrEqual(2);
      expect(m.completionRate).toBeGreaterThan(0);
      expect(m.missedRate).toBeGreaterThan(0);
      expect(m.atRiskPatients.some((p: any) => p.patient.id === missedPatient.id)).toBe(true);

      // A later appointment takes the patient off the at-risk list.
      const start = new Date(Date.now() + 2 * DAY);
      await prisma.appointment.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: missedPatient.id,
          doctorId: A.doctor.id,
          scheduledStart: start,
          scheduledEnd: new Date(start.getTime() + 30 * 60_000),
        },
      });
      const again = await http().get('/api/v1/follow-ups/metrics').set(auth(A.manager));
      expect(again.body.data.atRiskPatients.some((p: any) => p.patient.id === missedPatient.id)).toBe(false);

      const cross = await http().get('/api/v1/follow-ups/metrics').set(auth(B.owner));
      expect(cross.body.data.total).toBe(0);
    });

    it('rescheduling a missed follow-up re-opens it', async () => {
      const res = await http()
        .patch(`/api/v1/follow-ups/${missedId}`)
        .set(auth(A.receptionist))
        .send({ scheduledDate: iso(5) });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING');
    });

    it('lists branch doctors for filters', async () => {
      const res = await http().get('/api/v1/follow-ups/doctors').set(auth(A.receptionist));
      expect(res.status).toBe(200);
      expect(res.body.data.map((d: any) => d.id)).toEqual([A.doctor.id]);
    });
  });
});
