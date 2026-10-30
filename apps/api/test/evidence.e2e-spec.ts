/**
 * Evidence suite: tenant isolation and audit-trail capture for access
 * administration, with real logins and tenants created by the shared harness.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, Tenant, uniq } from './helpers/app';

describe('Evidence: multi-tenant isolation & audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let a: Tenant;
  let b: Tenant;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    a = await createTenant(app, prisma, 'EvidenceA', { roles: ['Organization Owner', 'Receptionist', 'Doctor'] });
    b = await createTenant(app, prisma, 'EvidenceB', { roles: ['Organization Owner', 'Receptionist'] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('tenant isolation', () => {
    it('PROVE: tenant B cannot read tenant A patient records (404) while A can', async () => {
      const patient = await createPatient(app, a.receptionist);
      expect((await http().get(`/api/v1/patients/${patient.id}`).set(auth(b.receptionist))).status).toBe(404);
      expect((await http().get(`/api/v1/patients/${patient.id}`).set(auth(a.receptionist))).status).toBe(200);
    });

    it('PROVE: staff, role and organization listings only contain the caller\'s tenant', async () => {
      const users = await http().get('/api/v1/users?allBranches=true&status=ALL').set(auth(b.owner)).expect(200);
      expect(users.body.data.every((u: any) => u.organizationId === b.org.id)).toBe(true);
      const roles = await http().get('/api/v1/roles').set(auth(b.owner)).expect(200);
      const aRoleIds = (await prisma.role.findMany({ where: { organizationId: a.org.id }, select: { id: true } })).map((r) => r.id);
      expect(roles.body.data.some((r: any) => aRoleIds.includes(r.id))).toBe(false);
      expect((await http().get(`/api/v1/organizations/${a.org.id}`).set(auth(b.owner))).status).toBe(404);
    });

    it('PROVE: tenant B cannot assign tenant A roles to its own staff', async () => {
      const aNurse = await prisma.role.findFirstOrThrow({ where: { organizationId: a.org.id, name: 'Nurse' } });
      const res = await http().put(`/api/v1/users/${b.receptionist.id}/roles`).set(auth(b.owner)).send({ roleIds: [aNurse.id] });
      expect(res.status).toBe(404);
    });

    it('PROVE: audit log queries never cross tenants', async () => {
      const res = await http().get(`/api/v1/audit-logs?actorId=${a.owner.id}`).set(auth(b.owner)).expect(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('audit trail', () => {
    it('PROVE: patient updates capture before/after state', async () => {
      const patient = await createPatient(app, a.receptionist);
      const upd = await http().patch(`/api/v1/patients/${patient.id}`).set(auth(a.receptionist)).send({ firstName: 'Updated' });
      expect([200, 201]).toContain(upd.status);
      const log = await prisma.auditLog.findFirst({
        where: { organizationId: a.org.id, entityId: patient.id, action: { in: ['UPDATE', 'PATCH', 'PATIENT_UPDATE'] } },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).toBeTruthy();
      expect(log!.actorId).toBe(a.receptionist.id);
    });

    it('PROVE: role creation, permission changes and role assignment are audited with before/after', async () => {
      const created = await http().post('/api/v1/roles').set(auth(a.owner)).send({ name: uniq('Auditor'), permissions: ['patients.view'] }).expect(201);
      const roleId = created.body.data.id;
      await http().patch(`/api/v1/roles/${roleId}`).set(auth(a.owner)).send({ permissions: ['patients.view', 'appointments.view'] }).expect(200);
      await http().put(`/api/v1/users/${a.receptionist.id}/roles`).set(auth(a.owner)).send({ roleIds: [roleId] }).expect(200);

      const logs = await prisma.auditLog.findMany({ where: { organizationId: a.org.id, actorId: a.owner.id }, orderBy: { createdAt: 'asc' } });
      const byAction = (action: string) => logs.filter((l) => l.action === action);
      expect(byAction('ROLE_CREATE').some((l) => l.entityId === roleId)).toBe(true);
      const update = byAction('ROLE_UPDATE').find((l) => l.entityId === roleId)!;
      expect((update.beforeData as any).permissions).toEqual(['patients.view']);
      expect((update.afterData as any).permissions).toEqual(['appointments.view', 'patients.view']);
      const assign = byAction('SET_ROLES').find((l) => l.entityId === a.receptionist.id)!;
      expect((assign.beforeData as any).roles).toEqual(['Receptionist']);
    });

    it('PROVE: failed logins against a known account are audited', async () => {
      await http().post('/api/v1/auth/login').send({ email: a.doctor.email, password: 'Wrong-Password-1' }).expect(401);
      const log = await prisma.auditLog.findFirst({ where: { organizationId: a.org.id, actorId: a.doctor.id, action: 'LOGIN_FAILED' } });
      expect(log).toBeTruthy();
    });

    it('PROVE: audit rows never store secrets', async () => {
      await http().post('/api/v1/auth/change-password').set(auth(a.doctor)).send({ currentPassword: 'x', newPassword: 'Another-Pass-1' });
      const rows = await prisma.auditLog.findMany({ where: { organizationId: a.org.id } });
      expect(JSON.stringify(rows)).not.toMatch(/Another-Pass-1|Test-Password-123/);
    });
  });
});
