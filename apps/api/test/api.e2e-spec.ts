/**
 * API contract: response envelope, error envelope, validation, pagination meta
 * and authentication requirements, exercised with real logins (no forged JWTs).
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createTenant, createTestApp, Tenant } from './helpers/app';

describe('API contract (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let t: Tenant;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    t = await createTenant(app, prisma, 'ApiContract', { roles: ['Organization Owner', 'Receptionist'] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it.each([
      ['get', '/api/v1/patients'],
      ['get', '/api/v1/users'],
      ['get', '/api/v1/roles'],
      ['get', '/api/v1/audit-logs'],
      ['get', '/api/v1/organizations/current'],
      ['get', '/api/v1/auth/profile'],
      ['post', '/api/v1/roles'],
      ['post', '/api/v1/staff-invitations/invite'],
    ])('%s %s requires a token (401)', async (method, url) => {
      const res = await (http() as any)[method](url);
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/auth/profile returns the DB-derived principal', async () => {
      const res = await http().get('/api/v1/auth/profile').set(auth(t.owner)).expect(200);
      expect(res.body.data).toMatchObject({
        id: t.owner.id,
        organizationId: t.org.id,
        branchId: t.branch.id,
        homeBranchId: t.branch.id,
        orgWide: true,
      });
      expect(res.body.data.permissions).toContain('users.invite');
    });
  });

  describe('envelopes', () => {
    it('wraps successful responses as { data, meta }', async () => {
      const res = await http().get('/api/v1/roles').set(auth(t.owner)).expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('timestamp');
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('returns a uniform error envelope for 404 and never leaks internals', async () => {
      const res = await http().get('/api/v1/roles/00000000-0000-4000-8000-000000000000').set(auth(t.owner)).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, message: 'Role not found' });
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|at \w+ \(/i);
    });

    it('rejects malformed ids with 400 instead of a database error', async () => {
      const res = await http().get('/api/v1/users/not-a-uuid').set(auth(t.owner));
      expect(res.status).toBe(400);
    });

    it('never returns password hashes', async () => {
      const res = await http().get('/api/v1/users?status=ALL').set(auth(t.owner)).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshTokenHash/);
    });
  });

  describe('validation', () => {
    it('returns 400 with an errors list for invalid bodies', async () => {
      const res = await http().post('/api/v1/roles').set(auth(t.owner)).send({ name: '', permissions: 'all' });
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it('strips unknown fields (whitelist)', async () => {
      const res = await http().patch('/api/v1/organizations/current').set(auth(t.owner)).send({ footerText: 'ok', subscriptionPlan: 'ENTERPRISE' });
      expect(res.status).toBe(200);
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: t.org.id } });
      expect(org.subscriptionPlan).toBe('STARTER');
    });
  });

  describe('pagination', () => {
    it('returns total/page/limit meta for paginated lists', async () => {
      const res = await http().get('/api/v1/audit-logs?page=1&limit=2').set(auth(t.owner)).expect(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 2 });
      expect(typeof res.body.meta.total).toBe('number');
    });

    it('rejects invalid page parameters', async () => {
      expect((await http().get('/api/v1/audit-logs?page=-1').set(auth(t.owner))).status).toBe(400);
      expect((await http().get('/api/v1/audit-logs?limit=10000').set(auth(t.owner))).status).toBe(400);
    });
  });

  describe('routing', () => {
    it('returns 404 for unknown routes and unsupported methods', async () => {
      expect((await http().get('/api/v1/does-not-exist').set(auth(t.owner))).status).toBe(404);
      expect((await http().put('/api/v1/audit-logs').set(auth(t.owner))).status).toBe(404);
    });
  });
});
