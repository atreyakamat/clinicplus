/**
 * Security regression suite: injection, token tampering, broken access control,
 * mass assignment, input limits and path traversal. Uses real logins only.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, Tenant, uniq } from './helpers/app';

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let t: Tenant;
  let other: Tenant;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    t = await createTenant(app, prisma, 'Sec', { roles: ['Organization Owner', 'Receptionist', 'Doctor'] });
    other = await createTenant(app, prisma, 'SecOther', { roles: ['Organization Owner'] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('SQL injection', () => {
    it('treats injection payloads in search/filter params as data', async () => {
      const payload = encodeURIComponent("' OR 1=1; DROP TABLE users; --");
      const users = await http().get(`/api/v1/users?search=${payload}`).set(auth(t.owner));
      expect(users.status).toBe(200);
      expect(users.body.data).toEqual([]);
      const audit = await http().get(`/api/v1/audit-logs?action=${payload}`).set(auth(t.owner));
      expect(audit.status).toBe(200);
      expect(await prisma.user.count()).toBeGreaterThan(0);
    });

    it('rejects injection in login e-mail with 400', async () => {
      const res = await http().post('/api/v1/auth/login').send({ email: "admin'--", password: 'x' });
      expect(res.status).toBe(400);
    });

    it('rejects injection in path ids with 400', async () => {
      const res = await http().get(`/api/v1/roles/${encodeURIComponent("1' OR '1'='1")}`).set(auth(t.owner));
      expect(res.status).toBe(400);
    });
  });

  describe('stored XSS', () => {
    it('stores markup as inert text (rendering is escaped by the client)', async () => {
      const name = `<script>alert(1)</script>${uniq('r')}`;
      const res = await http().post('/api/v1/roles').set(auth(t.owner)).send({ name, permissions: [] });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(name);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('JWT tampering', () => {
    it('rejects a token whose payload was modified', async () => {
      const [h, , s] = t.receptionist.token.split('.');
      const forged = `${h}.${b64url({ sub: t.owner.id, roles: ['Organization Owner'], permissions: ['*'] })}.${s}`;
      expect((await http().get('/api/v1/auth/profile').set(auth(forged))).status).toBe(401);
    });

    it('rejects alg:none tokens', async () => {
      const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: t.owner.id })}.`;
      expect((await http().get('/api/v1/auth/profile').set(auth(none))).status).toBe(401);
    });

    it('rejects a token signed with another secret', async () => {
      const foreign = new JwtService({ secret: 'not-the-real-secret-0123456789abcdef' }).sign({ sub: t.owner.id });
      expect((await http().get('/api/v1/auth/profile').set(auth(foreign))).status).toBe(401);
    });

    it('ignores privilege claims in a validly signed token (permissions come from the DB)', async () => {
      const jwt = app.get(JwtService);
      const elevated = jwt.sign({ sub: t.receptionist.id, roles: ['Super Admin'], permissions: ['admin.view', 'roles.create'] });
      expect((await http().post('/api/v1/roles').set(auth(elevated)).send({ name: 'Escalate', permissions: [] })).status).toBe(403);
      expect((await http().get('/api/v1/platform/metrics').set(auth(elevated))).status).toBe(403);
    });
  });

  describe('broken access control', () => {
    it('denies unauthenticated access', async () => {
      for (const url of ['/api/v1/patients', '/api/v1/appointments', '/api/v1/invoices', '/api/v1/users']) {
        expect((await http().get(url)).status).toBe(401);
      }
    });

    it('denies cross-tenant reads with 404', async () => {
      const patient = await createPatient(app, t.receptionist);
      expect((await http().get(`/api/v1/patients/${patient.id}`).set(auth(other.owner))).status).toBe(404);
      expect((await http().get(`/api/v1/users/${t.doctor.id}`).set(auth(other.owner))).status).toBe(404);
    });

    it('a clinic owner cannot download or create whole-database backups (platform only)', async () => {
      expect((await http().post('/api/v1/backup/create').set(auth(t.owner))).status).toBe(403);
      expect((await http().get('/api/v1/backup/list').set(auth(t.owner))).status).toBe(403);
      expect((await http().get('/api/v1/backup/download/clinicos-backup-2026-01-01T00-00-00-000Z.sql').set(auth(t.owner))).status).toBe(403);
    });
  });

  describe('mass assignment', () => {
    it('ignores organizationId/branchId supplied by the client', async () => {
      const patient = await createPatient(app, t.receptionist, { organizationId: other.org.id, branchId: other.branch.id });
      const row = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      expect(row.organizationId).toBe(t.org.id);
    });

    it('cannot change status or e-mail through the profile endpoint', async () => {
      const res = await http().patch(`/api/v1/users/${t.receptionist.id}`).set(auth(t.receptionist)).send({ status: 'INACTIVE', email: 'x@evil.test', organizationId: other.org.id });
      expect(res.status).toBe(200);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: t.receptionist.id } });
      expect(row).toMatchObject({ status: 'ACTIVE', email: t.receptionist.email, organizationId: t.org.id });
    });
  });

  describe('input validation', () => {
    it('rejects invalid e-mail and weak passwords at registration', async () => {
      const base = { firstName: 'A', lastName: 'B', clinicName: 'Sec Clinic', clinicSlug: uniq('sec') };
      expect((await http().post('/api/v1/auth/register').send({ ...base, email: 'nope', password: 'Strong-Pass-1' })).status).toBe(400);
      expect((await http().post('/api/v1/auth/register').send({ ...base, email: `${uniq('a')}@example.test`, password: 'password' })).status).toBe(400);
    });

    it('rejects oversized strings', async () => {
      const res = await http().post('/api/v1/roles').set(auth(t.owner)).send({ name: 'x'.repeat(5000), permissions: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('path traversal', () => {
    it('rejects traversal in backup file names before touching the filesystem', async () => {
      // Owner is denied before validation; the guard order means traversal never reaches the service.
      const res = await http().get('/api/v1/backup/download/..%2F..%2F.env').set(auth(t.owner));
      expect([400, 403, 404]).toContain(res.status);
    });

    it('rejects traversal-looking invitation tokens', async () => {
      expect((await http().get('/api/v1/staff-invitations/token/..%2F..%2Fetc')).status).toBe(404);
    });
  });

  describe('robustness', () => {
    it('handles a burst of concurrent requests', async () => {
      const results = await Promise.all(Array.from({ length: 25 }, () => http().get('/api/v1/roles').set(auth(t.owner))));
      expect(results.every((r) => r.status === 200)).toBe(true);
    });
  });
});
