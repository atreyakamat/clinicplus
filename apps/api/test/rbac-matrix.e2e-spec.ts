/**
 * Role x endpoint matrix for every built-in role.
 *
 * Expectations are derived from DEFAULT_ROLE_PERMISSIONS (the source of truth that
 * is synced into every tenant), so the test follows the matrix automatically; a
 * handful of critical denials from docs/roleandpermissionrbac.md are additionally
 * hard-coded so a careless matrix change cannot silently open them up.
 *
 * "Allowed" means the request got past authentication and authorization (neither
 * 401 nor 403). Bodies for create endpoints are intentionally invalid so allowed
 * requests stop at validation (400) and never create data.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/auth/default-access';
import { normalizePermission } from '../src/auth/access.utils';
import { PERMISSIONS_KEY } from '../src/auth/decorators/permissions.decorator';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { AnalyticsController } from '../src/analytics/analytics.controller';
import { auth, createTenant, createTestApp, login, Tenant, TEST_PASSWORD, uniq } from './helpers/app';

type Method = 'get' | 'post';
interface Row {
  name: string;
  method: Method;
  path: () => string;
  body?: Record<string, unknown>;
  /** Every permission the endpoint requires (guard semantics: all of them). */
  permissions: string[];
  /** Optional @Roles restriction on the handler (any of them). */
  roles?: string[];
}

const BUILT_IN_ROLES = [
  'Organization Owner',
  'Clinic Admin',
  'Branch Manager',
  'Doctor',
  'Receptionist',
  'Nurse',
  'Accountant',
  'Patient',
] as const;
type BuiltIn = (typeof BUILT_IN_ROLES)[number];

const ROWS: Row[] = [
  { name: 'patients list', method: 'get', path: () => '/api/v1/patients', permissions: ['patients.view'] },
  { name: 'patients create', method: 'post', path: () => '/api/v1/patients', body: {}, permissions: ['patients.create'] },
  { name: 'consultations list', method: 'get', path: () => '/api/v1/consultations', permissions: ['consultations.view'] },
  { name: 'consultations create', method: 'post', path: () => '/api/v1/consultations', body: {}, permissions: ['consultations.create'] },
  { name: 'prescriptions create', method: 'post', path: () => '/api/v1/prescriptions', body: {}, permissions: ['prescriptions.create'] },
  { name: 'invoices list', method: 'get', path: () => '/api/v1/invoices', permissions: ['invoices.view'] },
  { name: 'payments refund', method: 'post', path: () => `/api/v1/payments/${randomUUID()}/refund`, body: {}, permissions: ['payments.refund'] },
  { name: 'reports view', method: 'get', path: () => '/api/v1/reports/outstanding', permissions: ['reports.view'] },
  { name: 'users invite', method: 'post', path: () => '/api/v1/staff-invitations/invite', body: {}, permissions: ['users.invite'] },
  { name: 'users list', method: 'get', path: () => '/api/v1/users', permissions: ['users.view'] },
  { name: 'roles create', method: 'post', path: () => '/api/v1/roles', body: {}, permissions: ['roles.create'] },
  { name: 'audit view', method: 'get', path: () => '/api/v1/audit-logs', permissions: ['audit.view'] },
  // Backups dump every tenant: platform permission required on top of backup.create.
  { name: 'backup create', method: 'post', path: () => '/api/v1/backup/create', permissions: ['backup.create', 'admin.view'] },
  { name: 'platform metrics', method: 'get', path: () => '/api/v1/platform/metrics', permissions: ['admin.view'] },
];

/**
 * Analytics routes are owned by the analytics module; read the guard metadata of
 * its first parameterless GET handler so the row tracks that controller.
 */
function analyticsRow(): Row | null {
  const proto = AnalyticsController.prototype as any;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const handler = proto[key];
    if (typeof handler !== 'function') continue;
    const path: string | undefined = Reflect.getMetadata('path', handler);
    const method: number | undefined = Reflect.getMetadata('method', handler);
    const perms: string[] | undefined = Reflect.getMetadata(PERMISSIONS_KEY, handler);
    if (path === undefined || method !== 0 /* GET */ || !perms?.length || path.includes(':')) continue;
    const roles: string[] | undefined = Reflect.getMetadata(ROLES_KEY, handler);
    const clean = path.replace(/^\/+/, '');
    return { name: `analytics (${clean})`, method: 'get', path: () => `/api/v1/analytics/${clean}`, permissions: perms, roles };
  }
  return null;
}

const normRole = (r: string) => r.trim().toLowerCase().replace(/[_\s]+/g, '-');

function expectedAllowed(role: BuiltIn, row: Row) {
  const held = new Set((DEFAULT_ROLE_PERMISSIONS[role] ?? []).map(normalizePermission));
  const permsOk = row.permissions.every((p) => held.has(normalizePermission(p)));
  const rolesOk = !row.roles?.length || row.roles.map(normRole).includes(normRole(role));
  return permsOk && rolesOk;
}

/** Hard-coded critical denials from docs/roleandpermissionrbac.md. */
const CRITICAL_DENIALS: [BuiltIn, string][] = [
  ['Receptionist', 'consultations list'],
  ['Accountant', 'consultations list'],
  ['Doctor', 'invoices list'],
  ['Doctor', 'users invite'],
  ['Doctor', 'users list'],
  ['Doctor', 'roles create'],
  ['Nurse', 'invoices list'],
  ['Nurse', 'consultations create'],
  ['Receptionist', 'prescriptions create'],
  ['Organization Owner', 'consultations create'],
  ['Organization Owner', 'backup create'],
  ['Clinic Admin', 'prescriptions create'],
];

describe('RBAC matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: Tenant;
  let other: Tenant;
  const tokens = {} as Record<BuiltIn, string>;
  const http = () => request(app.getHttpServer());
  const rows: Row[] = [...ROWS];
  const analytics = analyticsRow();
  if (analytics) rows.push(analytics);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    tenant = await createTenant(app, prisma, 'Rbac');
    other = await createTenant(app, prisma, 'RbacOther', { roles: ['Organization Owner'] });
    for (const role of BUILT_IN_ROLES) {
      if (role === 'Patient') continue;
      tokens[role] = tenant.users[role].token;
    }
    // Patient accounts are not provisioned by the harness; create one like any other user.
    const patientRole = await prisma.role.findFirst({ where: { organizationId: tenant.org.id, name: 'Patient' } });
    const email = `${uniq('patient')}@example.test`;
    const user = await prisma.user.create({
      data: {
        organizationId: tenant.org.id,
        branchId: tenant.branch.id,
        email,
        passwordHash: await hash(TEST_PASSWORD, 4),
        firstName: 'Pat',
        lastName: 'Ient',
      },
    });
    await prisma.userRole.create({
      data: { organizationId: tenant.org.id, branchId: tenant.branch.id, userId: user.id, roleId: patientRole!.id },
    });
    tokens.Patient = (await login(app, email)).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('the matrix contains the critical denials required by the RBAC spec', () => {
    for (const [role, rowName] of CRITICAL_DENIALS) {
      const row = rows.find((r) => r.name === rowName)!;
      expect({ role, rowName, allowed: expectedAllowed(role, row) }).toEqual({ role, rowName, allowed: false });
    }
    expect(DEFAULT_ROLE_PERMISSIONS.Patient).toEqual([]);
  });

  for (const role of BUILT_IN_ROLES) {
    describe(role, () => {
      for (const row of rows) {
        const allowed = expectedAllowed(role, row);
        it(`${allowed ? 'ALLOWS' : 'DENIES'} ${row.name}`, async () => {
          let req = http()[row.method](row.path()).set('Authorization', `Bearer ${tokens[role]}`);
          if (row.body) req = req.send(row.body);
          const res = await req;
          if (allowed) {
            expect({ status: res.status, denied: [401, 403].includes(res.status), body: [401, 403].includes(res.status) ? res.body : undefined })
              .toMatchObject({ denied: false });
          } else {
            expect(res.status).toBe(403);
          }
        });
      }
    });
  }

  describe('Patient role', () => {
    it('gets no access at all (every matrix endpoint is 403)', async () => {
      for (const row of rows) {
        let req = http()[row.method](row.path()).set('Authorization', `Bearer ${tokens.Patient}`);
        if (row.body) req = req.send(row.body);
        const res = await req;
        expect({ row: row.name, status: res.status }).toEqual({ row: row.name, status: 403 });
      }
    });
  });

  describe('X-Branch-Id branch switching', () => {
    let secondBranchId: string;

    beforeAll(async () => {
      const b = await prisma.branch.create({
        data: { organizationId: tenant.org.id, name: `Second ${uniq('b')}`, timezone: 'Asia/Kolkata' },
      });
      secondBranchId = b.id;
    });

    it('branch-level staff cannot switch branch (403)', async () => {
      for (const user of [tenant.receptionist, tenant.doctor, tenant.manager]) {
        const res = await http().get('/api/v1/patients').set(auth(user)).set('X-Branch-Id', secondBranchId);
        expect(res.status).toBe(403);
      }
    });

    it('branch-level staff may send their own branch id', async () => {
      const res = await http().get('/api/v1/patients').set(auth(tenant.receptionist)).set('X-Branch-Id', tenant.branch.id);
      expect(res.status).toBe(200);
    });

    it('owner and clinic admin may switch to another branch of their own organization', async () => {
      for (const user of [tenant.owner, tenant.admin]) {
        const res = await http().get('/api/v1/patients').set(auth(user)).set('X-Branch-Id', secondBranchId);
        expect(res.status).toBe(200);
      }
    });

    it("owner cannot target another organization's branch (403)", async () => {
      const res = await http().get('/api/v1/patients').set(auth(tenant.owner)).set('X-Branch-Id', other.branch.id);
      expect(res.status).toBe(403);
    });

    it('a malformed branch id is rejected (403)', async () => {
      const res = await http().get('/api/v1/patients').set(auth(tenant.owner)).set('X-Branch-Id', 'not-a-uuid');
      expect(res.status).toBe(403);
    });
  });
});
