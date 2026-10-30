import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/common/mail/mail.service';
import { createTestApp, createTenant, login, Tenant, TEST_PASSWORD, uniq } from './helpers/app';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: Tenant;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    tenant = await createTenant(app, prisma, 'AuthClinic', { roles: ['Organization Owner', 'Receptionist'] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register', () => {
    const base = () => ({
      email: `${uniq('owner')}@example.test`,
      password: 'Strong-Pass-1',
      firstName: 'Riya',
      lastName: 'Shah',
      clinicName: 'Riya Clinic',
      clinicSlug: uniq('riya'),
    });

    it('creates organization, branch and owner, then allows login with owner permissions', async () => {
      const payload = base();
      const res = await http().post('/api/v1/auth/register').send(payload);
      expect(res.status).toBe(201);
      expect(res.body.data.organizationId).toBeDefined();
      expect(res.body.data.branchId).toBeDefined();

      const session = await login(app, payload.email, payload.password);
      expect(session.user.roles).toEqual(['Organization Owner']);
      expect(session.user.permissions).toEqual(expect.arrayContaining(['patients.view', 'invoices.create', 'users.invite']));
      expect(session.user).not.toHaveProperty('passwordHash');

      const roles = await prisma.role.count({ where: { organizationId: res.body.data.organizationId } });
      expect(roles).toBeGreaterThanOrEqual(7);
    });

    it('rejects weak passwords with 400 and a validation list', async () => {
      const res = await http().post('/api/v1/auth/register').send({ ...base(), password: 'weakpass' });
      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/Password must/);
    });

    it('rejects invalid slugs', async () => {
      const res = await http().post('/api/v1/auth/register').send({ ...base(), clinicSlug: 'Bad Slug!' });
      expect(res.status).toBe(400);
    });

    it('returns 409 for a duplicate e-mail (case-insensitive) and for a duplicate slug', async () => {
      const payload = base();
      expect((await http().post('/api/v1/auth/register').send(payload)).status).toBe(201);
      const dupEmail = await http().post('/api/v1/auth/register').send({ ...payload, email: payload.email.toUpperCase(), clinicSlug: uniq('other') });
      expect(dupEmail.status).toBe(409);
      const dupSlug = await http().post('/api/v1/auth/register').send({ ...payload, email: `${uniq('x')}@example.test` });
      expect(dupSlug.status).toBe(409);
    });
  });

  describe('login', () => {
    it('returns tokens and a scrubbed user for valid credentials', async () => {
      const res = await http().post('/api/v1/auth/login').send({ email: tenant.owner.email, password: TEST_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.body.data.sessionId).toEqual(expect.any(String));
      expect(res.body.data.user.email).toBe(tenant.owner.email);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshTokenHash/);
    });

    it('returns 401 for a wrong password and records the failed attempt', async () => {
      const res = await http().post('/api/v1/auth/login').send({ email: tenant.receptionist.email, password: 'Wrong-Pass-1' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
      const attempts = await prisma.loginAttempt.count({ where: { email: tenant.receptionist.email, status: 'FAILED' } });
      expect(attempts).toBeGreaterThanOrEqual(1);
    });

    it('returns 401 for an unknown e-mail without revealing whether it exists', async () => {
      const res = await http().post('/api/v1/auth/login').send({ email: 'nobody@example.test', password: 'Whatever-1' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('returns 400 for a malformed body', async () => {
      const res = await http().post('/api/v1/auth/login').send({ email: 'not-an-email', password: '' });
      expect(res.status).toBe(400);
    });

    it('locks the account after too many failed attempts (429)', async () => {
      const email = `${uniq('lock')}@example.test`;
      const user = await prisma.user.create({
        data: { email, passwordHash: 'x', firstName: 'L', lastName: 'U', organizationId: tenant.org.id, branchId: tenant.branch.id },
      });
      for (let i = 0; i < 5; i++) {
        const r = await http().post('/api/v1/auth/login').send({ email, password: 'Wrong-Pass-1' });
        expect(r.status).toBe(401);
      }
      const locked = await http().post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
      expect(locked.status).toBe(429);
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe('tokens and sessions', () => {
    it('rejects requests without a token, with a malformed token and with an expired token', async () => {
      expect((await http().get('/api/v1/auth/profile')).status).toBe(401);
      expect((await http().get('/api/v1/auth/profile').set('Authorization', 'Bearer not.a.jwt')).status).toBe(401);
      const jwt = app.get(JwtService);
      const expired = jwt.sign({ sub: tenant.owner.id, email: tenant.owner.email }, { expiresIn: -10 });
      expect((await http().get('/api/v1/auth/profile').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const forged = new JwtService({ secret: 'super-secret' }).sign({ sub: tenant.owner.id, email: tenant.owner.email, permissions: ['*'] });
      expect((await http().get('/api/v1/patients').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    });

    it('ignores roles/permissions claims carried in a token and derives them from the database', async () => {
      const jwt = app.get(JwtService);
      const elevated = jwt.sign({ sub: tenant.receptionist.id, email: tenant.receptionist.email, roles: ['Organization Owner'], permissions: ['*', 'users.invite'] });
      const profile = await http().get('/api/v1/auth/profile').set('Authorization', `Bearer ${elevated}`);
      expect(profile.status).toBe(200);
      expect(profile.body.data.roles).toEqual(['Receptionist']);
      expect(profile.body.data.permissions).not.toContain('*');
      const invite = await http().post('/api/v1/staff-invitations/invite').set('Authorization', `Bearer ${elevated}`).send({ email: 'a@b.test', roleId: '00000000-0000-4000-8000-000000000000' });
      expect(invite.status).toBe(403);
    });

    it('refreshes with rotation, rejects the old refresh token and revokes the session on reuse', async () => {
      const s = await login(app, tenant.owner.email);
      const r1 = await http().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken, sessionId: s.sessionId });
      expect(r1.status).toBe(200);
      expect(r1.body.data.refreshToken).not.toBe(s.refreshToken);
      const reuse = await http().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken, sessionId: s.sessionId });
      expect(reuse.status).toBe(401);
      const afterReuse = await http().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.data.refreshToken, sessionId: s.sessionId });
      expect(afterReuse.status).toBe(401);
      const session = await prisma.userSession.findUnique({ where: { id: s.sessionId } });
      expect(session?.status).toBe('INACTIVE');
    });

    it('rejects refresh for an expired session', async () => {
      const s = await login(app, tenant.owner.email);
      await prisma.userSession.update({ where: { id: s.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await http().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken, sessionId: s.sessionId });
      expect(res.status).toBe(401);
    });

    it('logout ends only the caller\'s own session', async () => {
      const a = await login(app, tenant.owner.email);
      const b = await login(app, tenant.receptionist.email);
      const foreign = await http().post('/api/v1/auth/logout').set('Authorization', `Bearer ${b.accessToken}`).send({ sessionId: a.sessionId });
      expect(foreign.status).toBe(401);
      expect((await prisma.userSession.findUnique({ where: { id: a.sessionId } }))?.status).toBe('ACTIVE');
      const own = await http().post('/api/v1/auth/logout').set('Authorization', `Bearer ${a.accessToken}`).send({ sessionId: a.sessionId });
      expect(own.status).toBe(200);
      expect((await prisma.userSession.findUnique({ where: { id: a.sessionId } }))?.status).toBe('INACTIVE');
      const refresh = await http().post('/api/v1/auth/refresh').send({ refreshToken: a.refreshToken, sessionId: a.sessionId });
      expect(refresh.status).toBe(401);
    });

    it('lists active sessions and logout-all ends them', async () => {
      const s = await login(app, tenant.receptionist.email);
      const list = await http().get('/api/v1/auth/sessions').set('Authorization', `Bearer ${s.accessToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThanOrEqual(1);
      const all = await http().post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${s.accessToken}`);
      expect(all.status).toBe(200);
      const active = await prisma.userSession.count({ where: { userId: tenant.receptionist.id, status: 'ACTIVE' } });
      expect(active).toBe(0);
    });
  });

  describe('password management', () => {
    it('changes the password with the correct current password and revokes other sessions', async () => {
      const email = `${uniq('pw')}@example.test`;
      await prisma.user.create({ data: { email, passwordHash: await hash(TEST_PASSWORD, 4), firstName: 'P', lastName: 'W', organizationId: tenant.org.id, branchId: tenant.branch.id } });
      const s1 = await login(app, email);
      const s2 = await login(app, email);
      const wrong = await http().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${s1.accessToken}`).send({ currentPassword: 'Nope-123', newPassword: 'Another-Pass-1' });
      expect(wrong.status).toBe(401);
      const weak = await http().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${s1.accessToken}`).send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });
      expect(weak.status).toBe(400);
      const ok = await http().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${s1.accessToken}`).send({ currentPassword: TEST_PASSWORD, newPassword: 'Another-Pass-1' });
      expect(ok.status).toBe(200);
      expect((await prisma.userSession.findUnique({ where: { id: s2.sessionId } }))?.status).toBe('INACTIVE');
      expect((await prisma.userSession.findUnique({ where: { id: s1.sessionId } }))?.status).toBe('ACTIVE');
      expect((await http().post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(401);
      expect((await http().post('/api/v1/auth/login').send({ email, password: 'Another-Pass-1' })).status).toBe(200);
    });

    it('forgot/reset flow issues a single-use, expiring token and never reveals account existence', async () => {
      const email = `${uniq('reset')}@example.test`;
      const user = await prisma.user.create({ data: { email, passwordHash: await hash(TEST_PASSWORD, 4), firstName: 'R', lastName: 'S', organizationId: tenant.org.id, branchId: tenant.branch.id } });
      const unknown = await http().post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.test' });
      // The raw token only travels in the e-mailed link; capture it from the mail service.
      const mail = app.get(MailService);
      const sendSpy = jest.spyOn(mail, 'send');
      const known = await http().post('/api/v1/auth/forgot-password').send({ email });
      expect(unknown.status).toBe(200);
      expect(known.status).toBe(200);
      expect(unknown.body.data.message).toBe(known.body.data.message);
      const reset = await prisma.passwordReset.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
      expect(reset).toBeTruthy();
      const mailed = sendSpy.mock.calls.map((c) => c[0]).find((m) => m.to === email);
      sendSpy.mockRestore();
      const rawToken = /token=([0-9a-f]{64})/.exec(mailed?.text ?? '')?.[1];
      expect(rawToken).toBeDefined();
      // Only a hash is stored, and nothing token-like is echoed to the caller.
      expect(reset!.token).not.toBe(rawToken);
      expect(JSON.stringify(known.body)).not.toContain(rawToken!);

      const bad = await http().post('/api/v1/auth/reset-password').send({ token: 'deadbeef', newPassword: 'Reset-Pass-1' });
      expect(bad.status).toBe(400);
      const ok = await http().post('/api/v1/auth/reset-password').send({ token: rawToken, newPassword: 'Reset-Pass-1' });
      expect(ok.status).toBe(200);
      const again = await http().post('/api/v1/auth/reset-password').send({ token: rawToken, newPassword: 'Reset-Pass-2' });
      expect(again.status).toBe(400);
      expect((await http().post('/api/v1/auth/login').send({ email, password: 'Reset-Pass-1' })).status).toBe(200);
    });
  });

  describe('security headers and error envelope', () => {
    it('sets helmet security headers', async () => {
      const res = await http().get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('returns a uniform error envelope without stack traces', async () => {
      const res = await http().get('/api/v1/patients/not-a-uuid').set('Authorization', `Bearer ${tenant.owner.token}`);
      expect([400, 404]).toContain(res.status);
      expect(res.body).toEqual(expect.objectContaining({ statusCode: res.status, message: expect.any(String), path: expect.any(String) }));
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+/);
    });
  });
});
