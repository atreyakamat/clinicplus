import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { Tenant, auth, createTenant, createTestApp, uniq } from './helpers/app';

/**
 * Subscription summary, the enforcement gate (suspended clinics keep only the
 * safelisted routes), plan limits, plan-management RBAC and cross-tenant safety.
 *
 * Cache note: SubscriptionService caches enforcement per-org for ~30s. Each
 * scenario uses its OWN tenant and flips status BEFORE its first non-safelisted
 * request, so a stale ACTIVE decision can never mask an expected block.
 */
describe('Subscription & plan enforcement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const setSub = (orgId: string, data: Record<string, unknown>) =>
    prisma.organization.update({ where: { id: orgId }, data });

  let A: Tenant; // ENTERPRISE/ACTIVE — summary, RBAC, plan management, cross-tenant source
  let B: Tenant; // cross-tenant target

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'Sub A');
    B = await createTenant(app, prisma, 'Sub B', { roles: ['Organization Owner'] });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------

  describe('summary', () => {
    it('returns plan, status, limits and live usage', async () => {
      const res = await http().get('/api/v1/subscription').set(auth(A.owner));
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.plan).toBe('ENTERPRISE');
      expect(d.status).toBe('ACTIVE');
      expect(d.active).toBe(true);
      expect(d.limits).toEqual({ maxBranches: null, maxStaff: null, maxPatients: null });
      // createTenant seeds one user per role (7) and one branch.
      expect(d.usage.staff).toBe(7);
      expect(d.usage.branches).toBe(1);
      expect(Array.isArray(d.catalog)).toBe(true);
      expect(d.catalog).toHaveLength(3);
    });

    it('subscription.view RBAC: Owner/Admin/Accountant yes, clinical roles no', async () => {
      expect((await http().get('/api/v1/subscription').set(auth(A.admin))).status).toBe(200);
      expect((await http().get('/api/v1/subscription').set(auth(A.accountant))).status).toBe(200);
      expect((await http().get('/api/v1/subscription').set(auth(A.doctor))).status).toBe(403);
      expect((await http().get('/api/v1/subscription').set(auth(A.receptionist))).status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------

  describe('enforcement gate', () => {
    it('ACTIVE org works normally', async () => {
      expect((await http().get('/api/v1/patients').set(auth(A.owner))).status).toBe(200);
    });

    it('PAST_DUE blocks normal routes but keeps auth / subscription / org-profile', async () => {
      const t = await createTenant(app, prisma, 'Sub PastDue', { roles: ['Organization Owner'] });
      await setSub(t.org.id, { subscriptionStatus: 'PAST_DUE' });

      const blocked = await http().get('/api/v1/patients').set(auth(t.owner));
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe('SUBSCRIPTION_INACTIVE');

      // Safelisted routes still work so staff can sign in and reactivate.
      const sub = await http().get('/api/v1/subscription').set(auth(t.owner));
      expect(sub.status).toBe(200);
      expect(sub.body.data.active).toBe(false);
      expect(sub.body.data.status).toBe('PAST_DUE');
      expect((await http().get('/api/v1/organizations/current').set(auth(t.owner))).status).toBe(200);
      expect((await http().get('/api/v1/auth/profile').set(auth(t.owner))).status).toBe(200);
    });

    it('TRIAL past its end date is blocked', async () => {
      const t = await createTenant(app, prisma, 'Sub TrialPast', { roles: ['Organization Owner'] });
      await setSub(t.org.id, { subscriptionStatus: 'TRIAL', trialEndsAt: new Date(Date.now() - 86_400_000) });
      const res = await http().get('/api/v1/patients').set(auth(t.owner));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('SUBSCRIPTION_INACTIVE');
    });

    it('TRIAL with a future (or null) end date works', async () => {
      const t = await createTenant(app, prisma, 'Sub TrialFuture', { roles: ['Organization Owner'] });
      // null trialEndsAt = never expires.
      await setSub(t.org.id, { subscriptionStatus: 'TRIAL', trialEndsAt: null });
      expect((await http().get('/api/v1/patients').set(auth(t.owner))).status).toBe(200);
      // future end date also active (still active → cache stays coherent).
      await setSub(t.org.id, { subscriptionStatus: 'TRIAL', trialEndsAt: new Date(Date.now() + 7 * 86_400_000) });
      expect((await http().get('/api/v1/patients').set(auth(t.owner))).status).toBe(200);
    });

    it('CANCELED is blocked, and POST /start-trial reactivates it', async () => {
      const t = await createTenant(app, prisma, 'Sub Canceled', { roles: ['Organization Owner'] });
      await setSub(t.org.id, { subscriptionStatus: 'CANCELED' });
      expect((await http().get('/api/v1/patients').set(auth(t.owner))).status).toBe(403);

      const trial = await http().post('/api/v1/subscription/start-trial').set(auth(t.owner));
      expect(trial.status).toBe(201);
      expect(trial.body.data.status).toBe('TRIAL');
      // start-trial invalidates the enforcement cache, so the clinic works again.
      expect((await http().get('/api/v1/patients').set(auth(t.owner))).status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------

  describe('plan limits', () => {
    it('STARTER rejects a 2nd branch with PLAN_LIMIT_REACHED, and an upgrade lifts it', async () => {
      const t = await createTenant(app, prisma, 'Sub Starter', { roles: ['Organization Owner'], plan: 'STARTER' });
      // Tenant already has its one seeded branch; STARTER allows 1.
      const blocked = await http().post('/api/v1/branches').set(auth(t.owner)).send({ name: uniq('Branch') });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe('PLAN_LIMIT_REACHED');

      const up = await http().patch('/api/v1/subscription').set(auth(t.owner)).send({ plan: 'GROWTH' });
      expect(up.status).toBe(200);
      expect(up.body.data.plan).toBe('GROWTH');

      const ok = await http().post('/api/v1/branches').set(auth(t.owner)).send({ name: uniq('Branch') });
      expect(ok.status).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------

  describe('plan management', () => {
    it('subscription.manage is Owner-only (Admin & Accountant cannot PATCH)', async () => {
      expect((await http().patch('/api/v1/subscription').set(auth(A.admin)).send({ plan: 'GROWTH' })).status).toBe(403);
      expect((await http().patch('/api/v1/subscription').set(auth(A.accountant)).send({ plan: 'GROWTH' })).status).toBe(403);
    });

    it('Owner changes the plan; the change sets ACTIVE and extends the period', async () => {
      const res = await http().patch('/api/v1/subscription').set(auth(A.owner)).send({ plan: 'GROWTH' });
      expect(res.status).toBe(200);
      expect(res.body.data.plan).toBe('GROWTH');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(new Date(res.body.data.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects a bad plan value (400)', async () => {
      expect((await http().patch('/api/v1/subscription').set(auth(A.owner)).send({ plan: 'PLATINUM' })).status).toBe(400);
    });

    it('rejects a downgrade that would exceed the target plan limits', async () => {
      // A has 7 staff; STARTER allows only 5, so the downgrade is rejected.
      const res = await http().patch('/api/v1/subscription').set(auth(A.owner)).send({ plan: 'STARTER' });
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/staff/i);
    });
  });

  // ---------------------------------------------------------------------------

  describe('super admin override & cross-tenant safety', () => {
    it('a non-super-admin Owner cannot use the admin override route', async () => {
      // admin.view is Super Admin only; Owner A cannot touch any org via it.
      expect(
        (await http().patch(`/api/v1/subscription/admin/${B.org.id}`).set(auth(A.owner)).send({ status: 'CANCELED' })).status,
      ).toBe(403);
      expect(
        (await http().patch(`/api/v1/subscription/admin/${A.org.id}`).set(auth(A.owner)).send({ status: 'CANCELED' })).status,
      ).toBe(403);
      // B is untouched.
      const b = await prisma.organization.findUniqueOrThrow({ where: { id: B.org.id } });
      expect(b.subscriptionStatus).toBe('ACTIVE');
    });

    it('Owner A cannot reach or change org B through PATCH / (always scoped to own org)', async () => {
      const before = await prisma.organization.findUniqueOrThrow({ where: { id: B.org.id } });
      // Owner A's PATCH only ever affects A's own org; there is no path to target B.
      await http().patch('/api/v1/subscription').set(auth(A.owner)).send({ plan: 'ENTERPRISE' }).expect(200);
      const after = await prisma.organization.findUniqueOrThrow({ where: { id: B.org.id } });
      expect(after.subscriptionPlan).toBe(before.subscriptionPlan);
      expect(after.subscriptionStatus).toBe(before.subscriptionStatus);
    });
  });
});
