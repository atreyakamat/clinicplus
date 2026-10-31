import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generateSync } from 'otplib';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createTestApp, createTenant, Tenant, TEST_PASSWORD } from './helpers/app';

/**
 * Staff TOTP two-factor authentication: enrol → enable → login challenge →
 * verify (TOTP + recovery) → disable, plus the non-2FA control and self-service
 * access rules.
 */
describe('Two-factor authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: Tenant;
  const http = () => request(app.getHttpServer());

  // The user enrolling in 2FA, and a control user who never does.
  let userEmail: string;
  let userToken: string;
  let userId: string;

  const readUser = (id: string) =>
    prisma.user.findUnique({
      where: { id },
      select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorRecoveryCodes: true },
    });

  const totpFor = async (id: string) => {
    const u = await readUser(id);
    return generateSync({ secret: u!.twoFactorSecret as string });
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    tenant = await createTenant(app, prisma, 'TwoFactorClinic', { roles: ['Organization Owner', 'Receptionist', 'Doctor'] });
    userEmail = tenant.receptionist.email;
    userToken = tenant.receptionist.token;
    userId = tenant.receptionist.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('is self-service: 2FA endpoints require authentication', async () => {
    expect((await http().get('/api/v1/auth/2fa/status')).status).toBe(401);
    expect((await http().post('/api/v1/auth/2fa/setup')).status).toBe(401);
  });

  it('setup stores a provisional secret but does NOT enable 2FA yet', async () => {
    const res = await http().post('/api/v1/auth/2fa/setup').set(auth(userToken));
    expect(res.status).toBe(200);
    expect(res.body.data.secret).toEqual(expect.any(String));
    expect(res.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(res.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const u = await readUser(userId);
    expect(u?.twoFactorSecret).toBeTruthy();
    expect(u?.twoFactorEnabled).toBe(false);

    const status = await http().get('/api/v1/auth/2fa/status').set(auth(userToken));
    expect(status.body.data.enabled).toBe(false);
  });

  it('enable rejects a wrong code, then accepts a valid one and returns 10 recovery codes once', async () => {
    const bad = await http().post('/api/v1/auth/2fa/enable').set(auth(userToken)).send({ code: '000000' });
    expect(bad.status).toBe(401);

    const code = await totpFor(userId);
    const ok = await http().post('/api/v1/auth/2fa/enable').set(auth(userToken)).send({ code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.recoveryCodes).toHaveLength(10);
    (globalThis as any).__recoveryCodes = ok.body.data.recoveryCodes;

    const u = await readUser(userId);
    expect(u?.twoFactorEnabled).toBe(true);
    expect(Array.isArray(u?.twoFactorRecoveryCodes)).toBe(true);
    expect((u?.twoFactorRecoveryCodes as unknown[]).length).toBe(10);
    // Only hashes are stored, never the plaintext codes.
    expect(JSON.stringify(u?.twoFactorRecoveryCodes)).not.toContain(ok.body.data.recoveryCodes[0]);
  });

  it('login with the correct password now returns a challenge instead of tokens', async () => {
    const res = await http().post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(res.body.data.challengeToken).toEqual(expect.any(String));
    expect(res.body.data.accessToken).toBeUndefined();
  });

  it('verify rejects a wrong code and issues a working session for a valid TOTP code', async () => {
    const challenge = (await http().post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD })).body.data.challengeToken;

    const bad = await http().post('/api/v1/auth/2fa/verify').send({ challengeToken: challenge, code: '000000' });
    expect(bad.status).toBe(401);

    const code = await totpFor(userId);
    const ok = await http().post('/api/v1/auth/2fa/verify').send({ challengeToken: challenge, code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    expect(ok.body.data.refreshToken).toEqual(expect.any(String));
    expect(ok.body.data.user.email).toBe(userEmail);

    // The issued session is a normal session: the access token works and refresh works.
    const profile = await http().get('/api/v1/auth/profile').set(auth(ok.body.data.accessToken));
    expect(profile.status).toBe(200);
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ok.body.data.refreshToken, sessionId: ok.body.data.sessionId });
    expect(refreshed.status).toBe(200);
  });

  it('rejects a challenge token used as a bearer access token (not a real JWT)', async () => {
    const challenge = (await http().post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD })).body.data.challengeToken;
    const res = await http().get('/api/v1/auth/profile').set(auth(challenge));
    expect(res.status).toBe(401);
  });

  it('a recovery code works exactly once', async () => {
    const codes: string[] = (globalThis as any).__recoveryCodes;
    const recovery = codes[0];

    const c1 = (await http().post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD })).body.data.challengeToken;
    const first = await http().post('/api/v1/auth/2fa/verify').send({ challengeToken: c1, code: recovery });
    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toEqual(expect.any(String));

    const c2 = (await http().post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD })).body.data.challengeToken;
    const reuse = await http().post('/api/v1/auth/2fa/verify').send({ challengeToken: c2, code: recovery });
    expect(reuse.status).toBe(401);

    const u = await readUser(userId);
    expect((u?.twoFactorRecoveryCodes as unknown[]).length).toBe(9);
  });

  it('disable requires proof and then restores normal password-only login', async () => {
    const noProof = await http().post('/api/v1/auth/2fa/disable').set(auth(userToken)).send({});
    expect(noProof.status).toBe(400);

    const wrong = await http().post('/api/v1/auth/2fa/disable').set(auth(userToken)).send({ code: '000000' });
    expect(wrong.status).toBe(401);

    const code = await totpFor(userId);
    const ok = await http().post('/api/v1/auth/2fa/disable').set(auth(userToken)).send({ code });
    expect(ok.status).toBe(200);

    const u = await readUser(userId);
    expect(u?.twoFactorEnabled).toBe(false);
    expect(u?.twoFactorSecret).toBeNull();

    const login = await http().post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toEqual(expect.any(String));
    expect(login.body.data.twoFactorRequired).toBeUndefined();
  });

  it('disable can also be authorised with the account password', async () => {
    await http().post('/api/v1/auth/2fa/setup').set(auth(userToken));
    const code = await totpFor(userId);
    await http().post('/api/v1/auth/2fa/enable').set(auth(userToken)).send({ code });
    expect((await readUser(userId))?.twoFactorEnabled).toBe(true);

    const ok = await http().post('/api/v1/auth/2fa/disable').set(auth(userToken)).send({ password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect((await readUser(userId))?.twoFactorEnabled).toBe(false);
  });

  it('a user without 2FA logs in exactly as before', async () => {
    const res = await http().post('/api/v1/auth/login').send({ email: tenant.doctor.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.twoFactorRequired).toBeUndefined();
  });

  it('the login lockout still counts failed 2FA verifications', async () => {
    // Enrol a fresh user so the lockout window is isolated.
    const victim = await createTenant(app, prisma, 'LockClinic', { roles: ['Receptionist'] });
    const vEmail = victim.receptionist.email;
    const vId = victim.receptionist.id;
    const vToken = victim.receptionist.token;

    await http().post('/api/v1/auth/2fa/setup').set(auth(vToken));
    const enableCode = await totpFor(vId);
    await http().post('/api/v1/auth/2fa/enable').set(auth(vToken)).send({ code: enableCode });

    for (let i = 0; i < 5; i++) {
      const challenge = (await http().post('/api/v1/auth/login').send({ email: vEmail, password: TEST_PASSWORD })).body.data.challengeToken;
      const r = await http().post('/api/v1/auth/2fa/verify').send({ challengeToken: challenge, code: '000000' });
      expect(r.status).toBe(401);
    }
    // The failed 2FA verifications are recorded as failed attempts, so the shared
    // lockout now refuses the next login (429) — even before the second factor.
    const locked = await http().post('/api/v1/auth/login').send({ email: vEmail, password: TEST_PASSWORD });
    expect(locked.status).toBe(429);
  });
});
