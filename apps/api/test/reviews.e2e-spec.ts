import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomBytes } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReviewRequestSchedulerService } from '../src/reviews/review-request-scheduler.service';
import { auth, createPatient, createTenant, createTestApp, Tenant } from './helpers/app';

const HOUR = 3600_000;

describe('Reviews, NPS & referrals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  let http: () => ReturnType<typeof request>;

  const completedAppointment = async (t: Tenant, patientId: string, completedHoursAgo = 3) => {
    const start = new Date(Date.now() - (completedHoursAgo + 1) * HOUR);
    const appt = await prisma.appointment.create({
      data: {
        organizationId: t.org.id,
        branchId: t.branch.id,
        patientId,
        doctorId: t.doctor.id,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 30 * 60_000),
        status: 'COMPLETED',
      },
    });
    await prisma.$executeRaw`UPDATE appointments SET updated_at = ${new Date(Date.now() - completedHoursAgo * HOUR)} WHERE id = ${appt.id}::uuid`;
    return appt;
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    http = () => request(app.getHttpServer());
    A = await createTenant(app, prisma, 'Rev Clinic A');
    B = await createTenant(app, prisma, 'Rev Clinic B');
    patient = await createPatient(app, A.receptionist, { firstName: 'Meera' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('review requests + public submit', () => {
    let token: string;
    let appointmentId: string;
    let reviewId: string;

    it('nurse cannot send review requests (403)', async () => {
      const res = await http().post('/api/v1/reviews/requests').set(auth(A.nurse)).send({ patientId: patient.id });
      expect(res.status).toBe(403);
    });

    it('receptionist sends a request for a completed visit', async () => {
      const appt = await completedAppointment(A, patient.id, 30);
      appointmentId = appt.id;
      const res = await http()
        .post('/api/v1/reviews/requests')
        .set(auth(A.receptionist))
        .send({ patientId: patient.id, appointmentId });
      expect(res.status).toBe(201);
      const r = res.body.data;
      expect(r.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(r.link).toMatch(new RegExp(`/r/${r.token}$`));
      expect(r.doctorId).toBe(A.doctor.id);
      expect(['SENT', 'FAILED']).toContain(r.status);
      expect(new Date(r.expiresAt).getTime()).toBeGreaterThan(Date.now() + 13 * 24 * HOUR);
      token = r.token;
      // Delivery goes through the messaging pipeline and is recorded as a Message.
      const msg = await prisma.message.findFirst({
        where: { organizationId: A.org.id, patientId: patient.id, messageBody: { contains: `/r/${token}` } },
      });
      expect(msg).toBeTruthy();
    });

    it('refuses a duplicate request for the same visit and patients without phone', async () => {
      const dup = await http()
        .post('/api/v1/reviews/requests')
        .set(auth(A.receptionist))
        .send({ patientId: patient.id, appointmentId });
      expect(dup.status).toBe(409);
      const noPhone = await prisma.patient.create({
        data: { organizationId: A.org.id, branchId: A.branch.id, firstName: 'No', lastName: 'Phone' },
      });
      const res = await http()
        .post('/api/v1/reviews/requests')
        .set(auth(A.receptionist))
        .send({ patientId: noPhone.id, doctorId: A.doctor.id });
      expect(res.status).toBe(400);
    });

    it('tenant B cannot request reviews for tenant A patients', async () => {
      const res = await http().post('/api/v1/reviews/requests').set(auth(B.receptionist)).send({ patientId: patient.id });
      expect(res.status).toBe(404);
    });

    it('public GET returns minimal clinic info without PII', async () => {
      const res = await http().get(`/api/v1/public/reviews/${token}`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.clinicName).toBe(A.org.name);
      expect(d.patientFirstName).toBe('Meera');
      expect(d.doctorName).toContain('Doctor');
      const json = JSON.stringify(d);
      expect(json).not.toContain(patient.lastName);
      expect(json).not.toContain(patient.phone);
      expect(d.patientId).toBeUndefined();
    });

    it('validates the public submission', async () => {
      const res = await http().post(`/api/v1/public/reviews/${token}`).send({ rating: 6 });
      expect(res.status).toBe(400);
      const res2 = await http().post(`/api/v1/public/reviews/${token}`).send({ rating: 4, npsScore: 11 });
      expect(res2.status).toBe(400);
    });

    it('accepts one submission and rejects reuse', async () => {
      const res = await http()
        .post(`/api/v1/public/reviews/${token}`)
        .send({ rating: 5, npsScore: 10, comment: 'Wonderful care' });
      expect(res.status).toBe(201);
      expect(res.body.data.submitted).toBe(true);
      reviewId = res.body.data.reviewId;

      const again = await http().post(`/api/v1/public/reviews/${token}`).send({ rating: 1 });
      expect(again.status).toBe(409);
      const info = await http().get(`/api/v1/public/reviews/${token}`);
      expect(info.status).toBe(409);
      expect(await prisma.review.count({ where: { requestId: { not: null }, organizationId: A.org.id } })).toBe(1);
    });

    it('rejects expired and unknown tokens', async () => {
      const expired = await prisma.reviewRequest.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: patient.id,
          doctorId: A.doctor.id,
          token: `exp${randomBytes(16).toString('hex')}`,
          status: 'SENT',
          expiresAt: new Date(Date.now() - HOUR),
        },
      });
      expect((await http().get(`/api/v1/public/reviews/${expired.token}`)).status).toBe(410);
      expect((await http().post(`/api/v1/public/reviews/${expired.token}`).send({ rating: 5 })).status).toBe(410);
      expect((await http().get('/api/v1/public/reviews/doesNotExistAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
      expect((await http().get('/api/v1/public/reviews/bad%20token')).status).toBe(404);
    });

    it('lists reviews, summarises reputation, never leaks tokens', async () => {
      // A detractor review created directly to exercise NPS maths.
      await prisma.review.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: patient.id,
          doctorId: A.doctor.id,
          rating: 2,
          npsScore: 3,
          reviewText: 'Long wait',
          source: 'MANUAL',
        },
      });
      const list = await http().get('/api/v1/reviews').set(auth(A.doctor));
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(2);
      const low = await http().get('/api/v1/reviews?maxRating=3').set(auth(A.doctor));
      expect(low.body.data.map((r: any) => r.rating)).toEqual([2]);

      const sum = await http().get('/api/v1/reviews/summary').set(auth(A.manager));
      expect(sum.status).toBe(200);
      const s = sum.body.data;
      expect(s.totalReviews).toBe(2);
      expect(s.averageRating).toBe(3.5);
      expect(s.distribution).toEqual({ '1': 0, '2': 1, '3': 0, '4': 0, '5': 1 });
      expect(s.nps).toMatchObject({ score: 0, promoters: 1, detractors: 1, responses: 2 });
      expect(s.byDoctor[0]).toMatchObject({ doctorId: A.doctor.id, reviews: 2 });
      expect(s.requests.completed).toBe(1);

      const reqs = await http().get('/api/v1/reviews/requests').set(auth(A.receptionist));
      expect(reqs.status).toBe(200);
      expect(reqs.body.data.length).toBeGreaterThan(0);
      expect(reqs.body.data.every((r: any) => r.token === undefined)).toBe(true);

      const nurse = await http().get('/api/v1/reviews').set(auth(A.nurse));
      expect(nurse.status).toBe(403);
    });

    it('marks a review public (reviews.manage only) and isolates tenants', async () => {
      const doc = await http().patch(`/api/v1/reviews/${reviewId}/public`).set(auth(A.doctor)).send({ isPublic: true });
      expect(doc.status).toBe(403);
      const res = await http()
        .patch(`/api/v1/reviews/${reviewId}/public`)
        .set(auth(A.receptionist))
        .send({ isPublic: true });
      expect(res.status).toBe(200);
      expect(res.body.data.isPublic).toBe(true);
      const pub = await http().get('/api/v1/reviews?isPublic=true').set(auth(A.receptionist));
      expect(pub.body.data.map((r: any) => r.id)).toEqual([reviewId]);

      expect((await http().get(`/api/v1/reviews/${reviewId}`).set(auth(B.owner))).status).toBe(404);
      expect(
        (await http().patch(`/api/v1/reviews/${reviewId}/public`).set(auth(B.owner)).send({ isPublic: false })).status,
      ).toBe(404);
      const bList = await http().get('/api/v1/reviews').set(auth(B.owner));
      expect(bList.body.meta.total).toBe(0);
    });
  });

  describe('automatic review requests', () => {
    it('requests a review for visits completed 2-24h ago, once', async () => {
      const p = await createPatient(app, A.receptionist);
      const recent = await completedAppointment(A, p.id, 3);
      const p2 = await createPatient(app, A.receptionist);
      const tooFresh = await completedAppointment(A, p2.id, 1);

      const svc = app.get(ReviewRequestSchedulerService);
      const first: any = await svc.runOnce(new Date(), A.org.id);
      expect(first.created).toBe(1);
      const rr = await prisma.reviewRequest.findMany({ where: { appointmentId: { in: [recent.id, tooFresh.id] } } });
      expect(rr).toHaveLength(1);
      expect(rr[0].appointmentId).toBe(recent.id);
      expect(rr[0].doctorId).toBe(A.doctor.id);

      const second: any = await svc.runOnce(new Date(), A.org.id);
      expect(second.created).toBe(0);
    });
  });

  describe('referrals', () => {
    let referralId: string;

    it('reviews.manage creates; doctor (view only) cannot', async () => {
      const denied = await http()
        .post('/api/v1/referrals')
        .set(auth(A.doctor))
        .send({ patientId: patient.id, referredName: 'Ravi Kumar' });
      expect(denied.status).toBe(403);

      const res = await http()
        .post('/api/v1/referrals')
        .set(auth(A.receptionist))
        .send({ patientId: patient.id, referredName: 'Ravi Kumar', referredPhone: '+91 98765 43210', notes: 'Neighbour' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('NEW');
      referralId = res.body.data.id;
      await http()
        .post('/api/v1/referrals')
        .set(auth(A.receptionist))
        .send({ patientId: patient.id, referredName: 'Lost Lead' })
        .expect(201)
        .then((r) =>
          http().patch(`/api/v1/referrals/${r.body.data.id}`).set(auth(A.receptionist)).send({ status: 'LOST' }).expect(200),
        );
    });

    it('moves through the funnel and converts to a patient', async () => {
      const contacted = await http()
        .patch(`/api/v1/referrals/${referralId}`)
        .set(auth(A.receptionist))
        .send({ status: 'CONTACTED' });
      expect(contacted.body.data.status).toBe('CONTACTED');

      const direct = await http()
        .patch(`/api/v1/referrals/${referralId}`)
        .set(auth(A.receptionist))
        .send({ status: 'CONVERTED' });
      expect(direct.status).toBe(400);

      const newPatient = await createPatient(app, A.receptionist, { firstName: 'Ravi' });
      const conv = await http()
        .post(`/api/v1/referrals/${referralId}/convert`)
        .set(auth(A.receptionist))
        .send({ convertedPatientId: newPatient.id });
      expect(conv.status).toBe(201);
      expect(conv.body.data.status).toBe('CONVERTED');
      expect(conv.body.data.convertedPatient.id).toBe(newPatient.id);

      const otherTenantPatient = await createPatient(app, B.receptionist);
      const bad = await http()
        .post(`/api/v1/referrals/${referralId}/convert`)
        .set(auth(A.receptionist))
        .send({ convertedPatientId: otherTenantPatient.id });
      expect(bad.status).toBe(404);
    });

    it('reports stats and top referrers', async () => {
      const res = await http().get('/api/v1/referrals/stats').set(auth(A.doctor));
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.byStatus).toMatchObject({ CONVERTED: 1, LOST: 1 });
      expect(res.body.data.conversionRate).toBe(50);
      expect(res.body.data.topReferrers[0]).toMatchObject({ patientId: patient.id, referrals: 2, converted: 1 });

      const list = await http().get('/api/v1/referrals?status=CONVERTED').set(auth(A.doctor));
      expect(list.body.data.map((r: any) => r.id)).toEqual([referralId]);
    });

    it('isolates tenants', async () => {
      expect((await http().get(`/api/v1/referrals/${referralId}`).set(auth(B.owner))).status).toBe(404);
      expect(
        (await http().patch(`/api/v1/referrals/${referralId}`).set(auth(B.owner)).send({ status: 'LOST' })).status,
      ).toBe(404);
      expect((await http().delete(`/api/v1/referrals/${referralId}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().get('/api/v1/referrals/stats').set(auth(B.owner))).body.data.total).toBe(0);
      expect((await http().get('/api/v1/referrals').set(auth(A.nurse))).status).toBe(403);
    });
  });

  describe('staff feedback inbox', () => {
    it('creates feedback with tenant/branch context and scopes the list', async () => {
      const res = await http()
        .post('/api/v1/feedback')
        .set(auth(A.nurse))
        .send({ category: 'BUG', subject: 'Printer', content: 'Prescription print cuts off', organizationId: B.org.id });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ organizationId: A.org.id, branchId: A.branch.id, userId: A.nurse.id });
      expect((await http().post('/api/v1/feedback').set(auth(A.nurse)).send({ category: 'NOPE', subject: 's', content: 'c' })).status).toBe(400);
      const mine = await http().get('/api/v1/feedback').set(auth(A.doctor));
      expect(mine.body.data).toHaveLength(0);
      const triage = await http().get('/api/v1/feedback').set(auth(A.manager));
      expect(triage.body.data.map((f: any) => f.id)).toContain(res.body.data.id);
      const cross = await http().patch(`/api/v1/feedback/${res.body.data.id}/status`).set(auth(B.owner)).send({ status: 'RESOLVED' });
      expect(cross.status).toBe(404);
    });
  });
});
