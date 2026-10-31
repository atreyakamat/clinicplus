/**
 * Production hardening through the real HTTP pipeline (same pipes/filters/interceptors as main.ts):
 * authentication, input validation, whitelist stripping / mass-assignment, response scrubbing,
 * pagination caps, body-size limit and security headers.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, futureSlot, Tenant, uniq } from './helpers/app';
import { addRoleUser } from './helpers/clinical';

const phone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('Production hardening (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'HardA');
    B = await createTenant(app, prisma, 'HardB', { roles: ['Organization Owner', 'Receptionist'] });
    patient = await createPatient(app, A.receptionist);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it('rejects missing, malformed and tampered tokens with 401', async () => {
      expect((await http().get('/api/v1/patients')).status).toBe(401);
      expect((await http().get('/api/v1/patients').set('Authorization', 'Bearer not.a.jwt')).status).toBe(401);
      expect((await http().get('/api/v1/patients').set('Authorization', A.receptionist.token)).status).toBe(401);

      // Re-encode the payload with elevated claims while keeping the original signature.
      const [h, p, sig] = A.receptionist.token.split('.');
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
      const forged = Buffer.from(JSON.stringify({ ...claims, organizationId: B.org.id, permissions: ['*'], roles: ['Super Admin'] })).toString('base64url');
      expect((await http().get('/api/v1/patients').set('Authorization', `Bearer ${h}.${forged}.${sig}`)).status).toBe(401);
      // Corrupted signature.
      expect((await http().get('/api/v1/patients').set(auth(`${h}.${p}.${sig.slice(0, -4)}AAAA`))).status).toBe(401);
    });

    it('wrong password is 401 and does not reveal whether the account exists', async () => {
      const wrong = await http().post('/api/v1/auth/login').send({ email: A.receptionist.email, password: 'nope-nope-nope' });
      const unknown = await http().post('/api/v1/auth/login').send({ email: `${uniq('ghost')}@example.test`, password: 'nope-nope-nope' });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.message).toBe(unknown.body.message);
      expect((await http().post('/api/v1/auth/login').send({ email: 'not-an-email' })).status).toBe(400);
    });

    it('permissions come from the database: a deactivated user is locked out immediately', async () => {
      const temp = await addRoleUser(app, prisma, A, 'Receptionist');
      const s = { accessToken: temp.token };
      expect((await http().get('/api/v1/patients').set(auth(s.accessToken))).status).toBe(200);
      await prisma.user.update({ where: { id: temp.id }, data: { status: 'INACTIVE' } });
      expect((await http().get('/api/v1/patients').set(auth(s.accessToken))).status).toBe(401);
    });

    it('role permissions are enforced (403) for valid tokens', async () => {
      expect((await http().get('/api/v1/invoices').set(auth(A.nurse))).status).toBe(403);
      expect((await http().post('/api/v1/consultations').set(auth(A.owner)).send({ patientId: patient.id })).status).toBe(403);
      expect((await http().post('/api/v1/patients').set(auth(A.accountant)).send({ firstName: 'X', lastName: 'Y' })).status).toBe(403);
    });
  });

  describe('input validation (400)', () => {
    it('rejects malformed patient payloads', async () => {
      const post = (body: any) => http().post('/api/v1/patients').set(auth(A.receptionist)).send(body);
      expect((await post({})).status).toBe(400);
      expect((await post({ firstName: '', lastName: 'X' })).status).toBe(400);
      expect((await post({ firstName: 'A'.repeat(101), lastName: 'X' })).status).toBe(400);
      expect((await post({ firstName: 'A', lastName: 'X', email: 'not-an-email' })).status).toBe(400);
      expect((await post({ firstName: 'A', lastName: 'X', patientCode: 'bad code!' })).status).toBe(400);
      expect((await post({ firstName: { $ne: null }, lastName: 'X' })).status).toBe(400);
      const res = await post({});
      expect(res.body).not.toHaveProperty('stack');
    });

    it('rejects invalid UUID path params and bodies', async () => {
      expect((await http().get('/api/v1/patients/not-a-uuid').set(auth(A.receptionist))).status).toBe(400);
      expect((await http().get("/api/v1/patients/1' OR '1'='1").set(auth(A.receptionist))).status).toBe(400);
      expect((await http().post('/api/v1/queues/check-in').set(auth(A.receptionist)).send({ appointmentId: 'x' })).status).toBe(400);
      expect((await http().get('/api/v1/patients/00000000-0000-4000-8000-000000000000').set(auth(A.receptionist))).status).toBe(404);
    });

    it('rejects invalid appointments and invoices', async () => {
      const slot = futureSlot(4, 10);
      const reversed = await http()
        .post('/api/v1/appointments')
        .set(auth(A.receptionist))
        .send({ patientId: patient.id, doctorId: A.doctor.id, scheduledStart: slot.scheduledEnd, scheduledEnd: slot.scheduledStart });
      expect(reversed.status).toBe(400);
      expect((await http().post('/api/v1/appointments').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, scheduledStart: 'tomorrow' })).status).toBe(400);

      const inv = (items: any) => http().post('/api/v1/invoices').set(auth(A.receptionist)).send({ patientId: patient.id, items });
      expect((await inv([])).status).toBe(400);
      expect((await inv([{ itemName: 'X', quantity: -1, unitPrice: 10 }])).status).toBe(400);
      expect((await inv([{ itemName: 'X', quantity: 1, unitPrice: -10 }])).status).toBe(400);
      expect((await inv('not-an-array')).status).toBe(400);
    });

    it('rejects malformed JSON with 400 and oversized bodies with 413', async () => {
      const bad = await http().post('/api/v1/patients').set(auth(A.receptionist)).set('Content-Type', 'application/json').send('{"firstName": ');
      expect(bad.status).toBe(400);
      const huge = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({ firstName: 'Big', lastName: 'Body', notes: 'x'.repeat(3 * 1024 * 1024) });
      expect(huge.status).toBe(413);
    });
  });

  describe('mass assignment and response scrubbing', () => {
    it('ignores organizationId / branchId / server-owned fields on create', async () => {
      const res = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({
          firstName: 'Mass',
          lastName: uniq('Assign'),
          phone: phone(),
          organizationId: B.org.id,
          branchId: B.branch.id,
          id: '00000000-0000-4000-8000-000000000001',
          createdBy: B.owner.id,
          deletedAt: new Date().toISOString(),
          isAdmin: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.organizationId).toBe(A.org.id);
      expect(res.body.data.branchId).toBe(A.branch.id);
      expect(res.body.data.id).not.toBe('00000000-0000-4000-8000-000000000001');
      expect(res.body.data.deletedAt).toBeNull();
      expect(res.body.data).not.toHaveProperty('isAdmin');
      const row = await prisma.patient.findUnique({ where: { id: res.body.data.id } });
      expect(row!.organizationId).toBe(A.org.id);
      // Invisible from the other tenant.
      expect((await http().get(`/api/v1/patients/${res.body.data.id}`).set(auth(B.owner))).status).toBe(404);
    });

    it('ignores organizationId on update', async () => {
      const res = await http().patch(`/api/v1/patients/${patient.id}`).set(auth(A.receptionist)).send({ organizationId: B.org.id, city: 'Nashik' });
      expect(res.status).toBe(200);
      expect((await prisma.patient.findUnique({ where: { id: patient.id } }))!.organizationId).toBe(A.org.id);
    });

    it('never returns password hashes', async () => {
      const profile = await http().get('/api/v1/auth/profile').set(auth(A.owner));
      expect(profile.status).toBe(200);
      const users = await http().get('/api/v1/users').set(auth(A.owner));
      expect(users.status).toBe(200);
      for (const body of [profile.body, users.body]) {
        const s = JSON.stringify(body);
        expect(s).not.toContain('passwordHash');
        expect(s).not.toContain('refreshTokenHash');
      }
    });
  });

  describe('pagination and headers', () => {
    it('caps page size: limit > 200 is rejected, limit is echoed in meta', async () => {
      expect((await http().get('/api/v1/patients?limit=10000').set(auth(A.receptionist))).status).toBe(400);
      expect((await http().get('/api/v1/patients?limit=0').set(auth(A.receptionist))).status).toBe(400);
      expect((await http().get('/api/v1/patients?page=-1').set(auth(A.receptionist))).status).toBe(400);
      const ok = await http().get('/api/v1/patients?limit=1').set(auth(A.receptionist));
      expect(ok.status).toBe(200);
      expect(ok.body.data.length).toBeLessThanOrEqual(1);
      expect(ok.body.meta.limit).toBe(1);
      expect(ok.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('sets security headers and hides the framework', async () => {
      const res = await http().get('/api/v1/patients').set(auth(A.receptionist));
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('CORS only allows configured origins', async () => {
      const allowed = await http().options('/api/v1/patients').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      const evil = await http().options('/api/v1/patients').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
