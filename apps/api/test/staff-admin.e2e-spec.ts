/**
 * Staff, roles, invitations, organization settings, audit viewer and platform
 * metrics: happy paths, anti-escalation rules, RBAC negatives and cross-tenant
 * negatives.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/common/mail/mail.service';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/auth/default-access';
import { auth, createTenant, createTestApp, login, Tenant, TEST_PASSWORD, uniq } from './helpers/app';

describe('Staff & access administration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let t: Tenant;
  let other: Tenant;
  const http = () => request(app.getHttpServer());

  const roleId = async (orgId: string, name: string) =>
    (await prisma.role.findFirstOrThrow({ where: { organizationId: orgId, name } })).id;

  /** Creates an extra active user holding the given built-in role and logs them in. */
  const extraUser = async (tenant: Tenant, role: string, branchId = tenant.branch.id) => {
    const email = `${uniq(role.toLowerCase().replace(/\W+/g, ''))}@example.test`;
    const user = await prisma.user.create({
      data: { organizationId: tenant.org.id, branchId, email, passwordHash: await hash(TEST_PASSWORD, 4), firstName: role, lastName: 'Extra' },
    });
    await prisma.userRole.create({
      data: { organizationId: tenant.org.id, branchId, userId: user.id, roleId: await roleId(tenant.org.id, role) },
    });
    const session = await login(app, email);
    return { id: user.id, email, token: session.accessToken, sessionId: session.sessionId };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    t = await createTenant(app, prisma, 'StaffAdmin');
    other = await createTenant(app, prisma, 'StaffOther', { roles: ['Organization Owner', 'Clinic Admin'] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('registration', () => {
    it('isPractitioner gives the owner the Doctor role as well, and login exposes roles/permissions/orgWide', async () => {
      const email = `${uniq('solo')}@example.test`;
      const reg = await http().post('/api/v1/auth/register').send({
        email, password: 'Strong-Pass-1', firstName: 'Solo', lastName: 'Doc',
        clinicName: 'Solo Clinic', clinicSlug: uniq('solo'), isPractitioner: true,
      });
      expect(reg.status).toBe(201);
      const session = await login(app, email, 'Strong-Pass-1');
      expect(session.user.roles).toEqual(expect.arrayContaining(['Organization Owner', 'Doctor']));
      expect(session.user.permissions).toEqual(expect.arrayContaining(['consultations.create', 'users.invite']));
      expect(session.user.orgWide).toBe(true);
      const builtIns = await prisma.role.findMany({ where: { organizationId: reg.body.data.organizationId } });
      expect(builtIns.every((r) => r.isSystem)).toBe(true);
    });

    it('without isPractitioner the owner has no clinical write access', async () => {
      const email = `${uniq('owner')}@example.test`;
      await http().post('/api/v1/auth/register').send({
        email, password: 'Strong-Pass-1', firstName: 'O', lastName: 'W', clinicName: 'Owner Clinic', clinicSlug: uniq('own'),
      }).expect(201);
      const session = await login(app, email, 'Strong-Pass-1');
      expect(session.user.roles).toEqual(['Organization Owner']);
      expect(session.user.permissions).not.toContain('consultations.create');
    });
  });

  describe('sessions', () => {
    it('lists sessions with the current one flagged and revokes a single session', async () => {
      const second = await login(app, t.receptionist.email);
      const list = await http().get('/api/v1/auth/sessions').set(auth(t.receptionist)).expect(200);
      const current = list.body.data.find((s: any) => s.current);
      expect(current.id).toBe(t.receptionist.sessionId);
      await http().delete(`/api/v1/auth/sessions/${second.sessionId}`).set(auth(t.receptionist)).expect(200);
      const refresh = await http().post('/api/v1/auth/refresh').send({ refreshToken: second.refreshToken, sessionId: second.sessionId });
      expect(refresh.status).toBe(401);
      // Another user's session cannot be revoked.
      const foreign = await http().delete(`/api/v1/auth/sessions/${t.doctor.sessionId}`).set(auth(t.receptionist));
      expect(foreign.status).toBe(401);
    });

    it('login and logout are audited', async () => {
      const s = await login(app, t.nurse.email);
      await http().post('/api/v1/auth/logout').set(auth(s.accessToken)).send({ sessionId: s.sessionId }).expect(200);
      const actions = await prisma.auditLog.findMany({ where: { organizationId: t.org.id, actorId: t.nurse.id }, select: { action: true } });
      expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['LOGIN', 'LOGOUT']));
    });
  });

  describe('roles', () => {
    let customId: string;

    it('lists built-in roles read-only with their permissions; Super Admin is hidden from clinics', async () => {
      const res = await http().get('/api/v1/roles').set(auth(t.owner)).expect(200);
      const doctor = res.body.data.find((r: any) => r.name === 'Doctor');
      expect(doctor.isSystem).toBe(true);
      expect(doctor.permissions.sort()).toEqual([...DEFAULT_ROLE_PERMISSIONS.Doctor].sort());
      expect(res.body.data.some((r: any) => r.name === 'Super Admin')).toBe(false);
    });

    it('built-in roles cannot be edited or deleted', async () => {
      const id = await roleId(t.org.id, 'Receptionist');
      expect((await http().patch(`/api/v1/roles/${id}`).set(auth(t.owner)).send({ permissions: ['patients.view'] })).status).toBe(403);
      expect((await http().delete(`/api/v1/roles/${id}`).set(auth(t.owner))).status).toBe(403);
    });

    it('owner creates, updates and reads a custom role', async () => {
      const res = await http().post('/api/v1/roles').set(auth(t.owner)).send({
        name: 'Front Desk Lead', description: 'Senior receptionist', permissions: ['patients.view', 'appointments.view', 'appointments.create'],
      });
      expect(res.status).toBe(201);
      customId = res.body.data.id;
      expect(res.body.data.isSystem).toBe(false);
      const upd = await http().patch(`/api/v1/roles/${customId}`).set(auth(t.owner)).send({ permissions: ['patients.view', 'appointments.view'] });
      expect(upd.status).toBe(200);
      expect(upd.body.data.permissions).toEqual(['appointments.view', 'patients.view']);
      const audit = await prisma.auditLog.findFirst({ where: { organizationId: t.org.id, action: 'ROLE_UPDATE', entityId: customId } });
      expect(audit).toBeTruthy();
    });

    it('rejects unknown permissions, reserved names and duplicates', async () => {
      expect((await http().post('/api/v1/roles').set(auth(t.owner)).send({ name: 'X Role', permissions: ['nope.never'] })).status).toBe(400);
      expect((await http().post('/api/v1/roles').set(auth(t.owner)).send({ name: 'doctor', permissions: [] })).status).toBe(409);
      expect((await http().post('/api/v1/roles').set(auth(t.owner)).send({ name: 'front desk lead', permissions: [] })).status).toBe(409);
    });

    it('anti-escalation: a Clinic Admin cannot grant permissions they lack', async () => {
      const res = await http().post('/api/v1/roles').set(auth(t.admin)).send({ name: 'Sneaky', permissions: ['consultations.create'] });
      expect(res.status).toBe(403);
      const ok = await http().post('/api/v1/roles').set(auth(t.admin)).send({ name: uniq('Billing'), permissions: ['invoices.view'] });
      expect(ok.status).toBe(201);
    });

    it('even the owner cannot grant platform access (admin.view)', async () => {
      const res = await http().post('/api/v1/roles').set(auth(t.owner)).send({ name: 'Platformish', permissions: ['admin.view'] });
      expect(res.status).toBe(403);
    });

    it('RBAC: roles.create / roles.delete are enforced', async () => {
      expect((await http().post('/api/v1/roles').set(auth(t.doctor)).send({ name: 'Doc Role', permissions: [] })).status).toBe(403);
      // Clinic Admin lacks roles.delete.
      expect((await http().delete(`/api/v1/roles/${customId}`).set(auth(t.admin))).status).toBe(403);
    });

    it('cross-tenant: another clinic cannot read, edit or delete the role (404)', async () => {
      expect((await http().get(`/api/v1/roles/${customId}`).set(auth(other.owner))).status).toBe(404);
      expect((await http().patch(`/api/v1/roles/${customId}`).set(auth(other.owner)).send({ name: 'Hijack' })).status).toBe(404);
      expect((await http().delete(`/api/v1/roles/${customId}`).set(auth(other.owner))).status).toBe(404);
    });

    it('a role in use cannot be deleted; an unused one can', async () => {
      const holder = await extraUser(t, 'Receptionist');
      await http().put(`/api/v1/users/${holder.id}/roles`).set(auth(t.owner)).send({ roleIds: [customId] }).expect(200);
      expect((await http().delete(`/api/v1/roles/${customId}`).set(auth(t.owner))).status).toBe(409);
      await http().put(`/api/v1/users/${holder.id}/roles`).set(auth(t.owner)).send({ roleIds: [await roleId(t.org.id, 'Receptionist')] }).expect(200);
      expect((await http().delete(`/api/v1/roles/${customId}`).set(auth(t.owner))).status).toBe(200);
    });
  });

  describe('users', () => {
    it('Branch Manager only sees staff of their home branch', async () => {
      const b2 = await prisma.branch.create({ data: { organizationId: t.org.id, name: `B2 ${uniq('b')}` } });
      const far = await extraUser(t, 'Receptionist', b2.id);
      const mgr = await http().get('/api/v1/users?allBranches=true&status=ALL').set(auth(t.manager)).expect(200);
      expect(mgr.body.data.some((u: any) => u.id === far.id)).toBe(false);
      expect((await http().get(`/api/v1/users/${far.id}`).set(auth(t.manager))).status).toBe(404);
      const owner = await http().get('/api/v1/users?allBranches=true').set(auth(t.owner)).expect(200);
      expect(owner.body.data.some((u: any) => u.id === far.id)).toBe(true);
    });

    it('nobody can change their own roles', async () => {
      const res = await http().put(`/api/v1/users/${t.owner.id}/roles`).set(auth(t.owner)).send({ roleIds: [await roleId(t.org.id, 'Doctor')] });
      expect(res.status).toBe(403);
    });

    it('anti-escalation: a Clinic Admin cannot assign a role with permissions they lack (Doctor)', async () => {
      const target = await extraUser(t, 'Receptionist');
      const res = await http().put(`/api/v1/users/${target.id}/roles`).set(auth(t.admin)).send({ roleIds: [await roleId(t.org.id, 'Doctor')] });
      expect(res.status).toBe(403);
      const ok = await http().put(`/api/v1/users/${target.id}/roles`).set(auth(t.admin)).send({ roleIds: [await roleId(t.org.id, 'Nurse')] });
      expect(ok.status).toBe(200);
      expect(ok.body.data.roles.map((r: any) => r.role.name)).toEqual(['Nurse']);
      // The new role takes effect immediately (permissions are derived per request).
      expect((await http().get('/api/v1/invoices').set(auth(target.token))).status).toBe(403);
    });

    it('a Clinic Admin cannot touch an owner account', async () => {
      const res = await http().patch(`/api/v1/users/${t.owner.id}/deactivate`).set(auth(t.admin));
      expect(res.status).toBe(403);
    });

    it('the last Organization Owner cannot be deactivated or demoted', async () => {
      const coOwner = await extraUser(other, 'Organization Owner');
      // Two owners: one may demote the other...
      const demote = await http().put(`/api/v1/users/${other.owner.id}/roles`).set(auth(coOwner.token)).send({ roleIds: [await roleId(other.org.id, 'Clinic Admin')] });
      expect(demote.status).toBe(200);
      // ...but now coOwner is the last owner and cannot be removed.
      const deact = await http().patch(`/api/v1/users/${coOwner.id}/deactivate`).set(auth(other.admin));
      expect(deact.status).toBe(403);
      await http().put(`/api/v1/users/${other.owner.id}/roles`).set(auth(coOwner.token)).send({ roleIds: [await roleId(other.org.id, 'Organization Owner')] }).expect(200);
    });

    it('deactivation revokes sessions and blocks login; activation restores access', async () => {
      const victim = await extraUser(t, 'Nurse');
      await http().patch(`/api/v1/users/${victim.id}/deactivate`).set(auth(t.admin)).expect(200);
      expect((await http().get('/api/v1/auth/profile').set(auth(victim.token))).status).toBe(401);
      expect((await http().post('/api/v1/auth/login').send({ email: victim.email, password: TEST_PASSWORD })).status).toBe(401);
      const listed = await http().get('/api/v1/users?status=INACTIVE').set(auth(t.admin)).expect(200);
      expect(listed.body.data.some((u: any) => u.id === victim.id)).toBe(true);
      await http().patch(`/api/v1/users/${victim.id}/activate`).set(auth(t.admin)).expect(200);
      expect((await http().post('/api/v1/auth/login').send({ email: victim.email, password: TEST_PASSWORD })).status).toBe(200);
    });

    it('RBAC: Branch Manager lacks users.deactivate; Doctor cannot edit other staff', async () => {
      expect((await http().patch(`/api/v1/users/${t.nurse.id}/deactivate`).set(auth(t.manager))).status).toBe(403);
      expect((await http().patch(`/api/v1/users/${t.nurse.id}`).set(auth(t.doctor)).send({ firstName: 'X' })).status).toBe(403);
      // ...but staff can edit their own profile.
      expect((await http().patch(`/api/v1/users/${t.doctor.id}`).set(auth(t.doctor)).send({ bio: 'Hello' })).status).toBe(200);
    });

    it('moving staff between branches is org-wide only and validates the branch', async () => {
      const b3 = await prisma.branch.create({ data: { organizationId: t.org.id, name: `B3 ${uniq('b')}` } });
      const mover = await extraUser(t, 'Receptionist');
      expect((await http().patch(`/api/v1/users/${mover.id}/branch`).set(auth(t.manager)).send({ branchId: b3.id })).status).toBe(403);
      expect((await http().patch(`/api/v1/users/${mover.id}/branch`).set(auth(t.owner)).send({ branchId: other.branch.id })).status).toBe(404);
      const ok = await http().patch(`/api/v1/users/${mover.id}/branch`).set(auth(t.owner)).send({ branchId: b3.id });
      expect(ok.status).toBe(200);
      expect(ok.body.data.branchId).toBe(b3.id);
    });

    it('cross-tenant: users of another clinic are invisible (404)', async () => {
      expect((await http().get(`/api/v1/users/${t.doctor.id}`).set(auth(other.owner))).status).toBe(404);
      expect((await http().patch(`/api/v1/users/${t.doctor.id}/deactivate`).set(auth(other.owner))).status).toBe(404);
      expect((await http().put(`/api/v1/users/${t.doctor.id}/roles`).set(auth(other.owner)).send({ roleIds: [await roleId(other.org.id, 'Nurse')] })).status).toBe(404);
    });
  });

  describe('staff invitations', () => {
    it('invites with role + branch, e-mails the link, and the invitee accepts and is logged in', async () => {
      const mail = app.get(MailService);
      const spy = jest.spyOn(mail, 'send');
      const email = `${uniq('invitee')}@example.test`;
      const res = await http().post('/api/v1/staff-invitations/invite').set(auth(t.owner)).send({
        email, roleId: await roleId(t.org.id, 'Doctor'), branchId: t.branch.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.branchId).toBe(t.branch.id);
      const mailed = spy.mock.calls.map((c) => c[0]).find((m) => m.to === email);
      spy.mockRestore();
      const token = /\/invite\/([0-9a-f]{64})/.exec(mailed!.text)?.[1];
      expect(token).toBeDefined();
      // E-mail is not configured in tests, so the inviting admin receives the link to hand over.
      expect(res.body.data.inviteUrl).toContain(`/invite/${token}`);
      const stored = await prisma.staffInvitation.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(stored.token).not.toContain(token!);

      const preview = await http().get(`/api/v1/staff-invitations/token/${token}`).expect(200);
      expect(preview.body.data).toMatchObject({ email, roleName: 'Doctor', branchName: 'Main Branch' });

      expect((await http().post(`/api/v1/staff-invitations/accept/${token}`).send({ firstName: 'In', lastName: 'Vitee', password: 'weak' })).status).toBe(400);
      const accepted = await http().post(`/api/v1/staff-invitations/accept/${token}`).send({ firstName: 'In', lastName: 'Vitee', password: 'Strong-Pass-1' });
      expect(accepted.status).toBe(201);
      expect(accepted.body.data.accessToken).toBeTruthy();
      expect(accepted.body.data.user.roles).toEqual(['Doctor']);
      expect(accepted.body.data.user.branchId).toBe(t.branch.id);
      expect((await http().post(`/api/v1/staff-invitations/accept/${token}`).send({ firstName: 'A', lastName: 'B', password: 'Strong-Pass-1' })).status).toBe(404);
    });

    it('anti-escalation: Branch Manager cannot invite into a role exceeding their permissions or another branch', async () => {
      const doctorRole = await roleId(t.org.id, 'Doctor');
      expect((await http().post('/api/v1/staff-invitations/invite').set(auth(t.manager)).send({ email: `${uniq('x')}@example.test`, roleId: doctorRole })).status).toBe(403);
      const b4 = await prisma.branch.create({ data: { organizationId: t.org.id, name: `B4 ${uniq('b')}` } });
      expect((await http().post('/api/v1/staff-invitations/invite').set(auth(t.manager)).send({ email: `${uniq('x')}@example.test`, roleId: await roleId(t.org.id, 'Nurse'), branchId: b4.id })).status).toBe(403);
      // Nurse holds clinical permissions a Branch Manager lacks; Receptionist is a subset.
      expect((await http().post('/api/v1/staff-invitations/invite').set(auth(t.manager)).send({ email: `${uniq('x')}@example.test`, roleId: await roleId(t.org.id, 'Nurse') })).status).toBe(403);
      expect((await http().post('/api/v1/staff-invitations/invite').set(auth(t.manager)).send({ email: `${uniq('x')}@example.test`, roleId: await roleId(t.org.id, 'Receptionist') })).status).toBe(201);
    });

    it('rejects foreign roles/branches (404), Super Admin/Patient roles (400) and RBAC (403)', async () => {
      const email = `${uniq('y')}@example.test`;
      expect((await http().post('/api/v1/staff-invitations/invite').set(auth(t.owner)).send({ email, roleId: await roleId(other.org.id, 'Nurse') })).status).toBe(404);
      expect((await http().post('/api/v1/staff-invitations/invite').set(auth(t.owner)).send({ email, roleId: await roleId(t.org.id, 'Nurse'), branchId: other.branch.id })).status).toBe(404);
      expect((await http().post('/api/v1/staff-invitations/invite').set(auth(t.owner)).send({ email, roleId: await roleId(t.org.id, 'Patient') })).status).toBe(400);
      expect((await http().post('/api/v1/staff-invitations/invite').set(auth(t.receptionist)).send({ email, roleId: await roleId(t.org.id, 'Nurse') })).status).toBe(403);
    });

    it('lists and revokes invitations within the tenant only', async () => {
      const inv = await http().post('/api/v1/staff-invitations/invite').set(auth(t.admin)).send({ email: `${uniq('z')}@example.test`, roleId: await roleId(t.org.id, 'Nurse') });
      expect(inv.status).toBe(201);
      const list = await http().get('/api/v1/staff-invitations').set(auth(t.admin)).expect(200);
      expect(list.body.data.find((i: any) => i.id === inv.body.data.id)).toMatchObject({ roleName: 'Nurse', status: 'PENDING' });
      expect((await http().delete(`/api/v1/staff-invitations/${inv.body.data.id}`).set(auth(other.owner))).status).toBe(404);
      expect((await http().delete(`/api/v1/staff-invitations/${inv.body.data.id}`).set(auth(t.admin))).status).toBe(200);
      const token = /\/invite\/([0-9a-f]{64})/.exec(inv.body.data.inviteUrl)![1];
      expect((await http().get(`/api/v1/staff-invitations/token/${token}`)).status).toBe(404);
    });
  });

  describe('organization settings', () => {
    it('owner reads and updates the organization profile; mass-assignment is ignored', async () => {
      const get = await http().get('/api/v1/organizations/current').set(auth(t.owner)).expect(200);
      expect(get.body.data.id).toBe(t.org.id);
      const res = await http().patch('/api/v1/organizations/current').set(auth(t.owner)).send({
        legalName: 'Staff Admin Clinic Pvt Ltd', phone: '+91 98765 43210', website: 'https://clinic.example.com',
        primaryColor: '#123456', slug: 'hijack', subscriptionStatus: 'ACTIVE', id: other.org.id,
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ legalName: 'Staff Admin Clinic Pvt Ltd', primaryColor: '#123456', slug: t.org.slug });
    });

    it('validates input and enforces RBAC / tenancy', async () => {
      expect((await http().patch('/api/v1/organizations/current').set(auth(t.owner)).send({ primaryColor: 'red' })).status).toBe(400);
      expect((await http().patch('/api/v1/organizations/current').set(auth(t.receptionist)).send({ name: 'X Clinic' })).status).toBe(403);
      expect((await http().get(`/api/v1/organizations/${t.org.id}`).set(auth(other.owner))).status).toBe(404);
      expect((await http().patch(`/api/v1/organizations/${t.org.id}`).set(auth(other.owner)).send({ name: 'Hijacked' })).status).toBe(404);
    });

    it('branding endpoint accepts settings.branding holders', async () => {
      const res = await http().patch('/api/v1/organizations/current/branding').set(auth(t.admin)).send({ footerText: 'Get well soon' });
      expect(res.status).toBe(200);
      expect(res.body.data.footerText).toBe('Get well soon');
      expect((await http().patch('/api/v1/organizations/current/branding').set(auth(t.nurse)).send({ footerText: 'x' })).status).toBe(403);
    });
  });

  describe('audit log viewer', () => {
    it('filters by action, actor and date range with pagination meta and actor names', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await http()
        .get(`/api/v1/audit-logs?action=ROLE_CREATE&actorId=${t.owner.id}&from=${today}&to=${today}&limit=5`)
        .set(auth(t.owner))
        .expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 5 });
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const row of res.body.data) {
        expect(row.action).toBe('ROLE_CREATE');
        expect(row.organizationId).toBe(t.org.id);
        expect(row.actor.id).toBe(t.owner.id);
      }
      const facets = await http().get('/api/v1/audit-logs/facets').set(auth(t.owner)).expect(200);
      expect(facets.body.data.actions).toEqual(expect.arrayContaining(['LOGIN', 'ROLE_CREATE', 'SET_ROLES']));
    });

    it('never returns another tenant\'s entries and is denied without audit.view', async () => {
      const res = await http().get(`/api/v1/audit-logs?actorId=${t.owner.id}`).set(auth(other.owner)).expect(200);
      expect(res.body.data).toEqual([]);
      expect((await http().get('/api/v1/audit-logs').set(auth(t.doctor))).status).toBe(403);
      expect((await http().get('/api/v1/audit-logs?from=not-a-date').set(auth(t.owner))).status).toBe(400);
    });
  });

  describe('platform (founder) metrics', () => {
    it('is Super Admin only and returns real cross-organization counts', async () => {
      expect((await http().get('/api/v1/platform/metrics').set(auth(t.owner))).status).toBe(403);
      const sa = await extraUser(t, 'Super Admin');
      const res = await http().get('/api/v1/platform/metrics').set(auth(sa.token)).expect(200);
      const orgCount = await prisma.organization.count();
      expect(res.body.data.totals.organizations).toBeGreaterThanOrEqual(orgCount - 5);
      expect(res.body.data.totals.organizations).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(res.body.data.organizations)).toBe(true);
      // Super Admin can list backups (no dump is created here).
      const list = await http().get('/api/v1/backup/list').set(auth(sa.token));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveProperty('remoteStorage');
      expect((await http().get('/api/v1/backup/download/..%2F..%2Fetc%2Fpasswd').set(auth(sa.token))).status).toBe(400);
    });
  });
});
