/**
 * Shared e2e harness.
 *
 * - Boots the real AppModule with the SAME global pipes/filters/interceptors as main.ts.
 * - Creates fully provisioned tenants (org + branch + default roles/permissions + one
 *   user per role) so tests authenticate through POST /api/v1/auth/login like a browser.
 * - Never truncates tables: every tenant gets a unique slug, so suites cannot
 *   interfere with each other and the harness is safe against any database.
 *
 * Required env: DATABASE_URL pointing at an isolated *_test database, JWT_SECRET, NODE_ENV=test.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { configureApp } from '../../src/app.setup';
import { ensureOrganizationAccess } from '../../src/auth/access.bootstrap';

export const TEST_PASSWORD = 'Test-Password-123';

export type RoleName =
  | 'Organization Owner'
  | 'Clinic Admin'
  | 'Branch Manager'
  | 'Doctor'
  | 'Receptionist'
  | 'Nurse'
  | 'Accountant';

export interface TenantUser {
  id: string;
  email: string;
  role: RoleName;
  token: string;
  sessionId: string;
  refreshToken: string;
}

export interface Tenant {
  org: { id: string; name: string; slug: string };
  branch: { id: string; name: string };
  users: Record<RoleName, TenantUser>;
  owner: TenantUser;
  admin: TenantUser;
  doctor: TenantUser;
  receptionist: TenantUser;
  nurse: TenantUser;
  accountant: TenantUser;
  manager: TenantUser;
}

const ROLES: RoleName[] = [
  'Organization Owner',
  'Clinic Admin',
  'Branch Manager',
  'Doctor',
  'Receptionist',
  'Nurse',
  'Accountant',
];

export function assertTestDatabase() {
  const url = process.env.DATABASE_URL || '';
  const dbName = url.split('/').pop()?.split('?')[0] ?? '';
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run e2e tests: DATABASE_URL database "${dbName}" does not look like a test database`,
    );
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing to run e2e tests: NODE_ENV must be "test"');
  }
}

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  assertTestDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'], rawBody: true });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export const uniq = (prefix = 't') => `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

export async function login(app: INestApplication, email: string, password = TEST_PASSWORD) {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data as { accessToken: string; refreshToken: string; sessionId: string; user: any };
}

/** Creates an isolated tenant with one active user per default role, all logged in. */
export async function createTenant(
  app: INestApplication,
  prisma: PrismaService,
  name = 'Clinic',
  opts: {
    roles?: RoleName[];
    branchTimezone?: string;
    // Subscription controls. Default ENTERPRISE/ACTIVE so plan limits (branches/
    // staff) never accidentally fire for unrelated suites — a fresh tenant
    // already has one user per role (7) plus a branch. Subscription tests pass
    // `plan: 'STARTER'` etc. explicitly, or mutate the org via prisma afterwards.
    plan?: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
    subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
    trialEndsAt?: Date | null;
    currentPeriodEnd?: Date | null;
  } = {},
): Promise<Tenant> {
  const slug = uniq(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const org = await prisma.organization.create({
    data: {
      name: `${name} ${slug}`,
      slug,
      subscriptionPlan: opts.plan ?? 'ENTERPRISE',
      subscriptionStatus: opts.subscriptionStatus ?? 'ACTIVE',
      ...(opts.trialEndsAt !== undefined ? { trialEndsAt: opts.trialEndsAt } : {}),
      ...(opts.currentPeriodEnd !== undefined ? { currentPeriodEnd: opts.currentPeriodEnd } : {}),
    },
  });
  const branch = await prisma.branch.create({
    data: { name: 'Main Branch', organizationId: org.id, timezone: opts.branchTimezone ?? 'Asia/Kolkata', city: 'Pune', country: 'India' },
  });
  const access = await ensureOrganizationAccess(prisma, org.id, null);
  const passwordHash = await hash(TEST_PASSWORD, 4);
  const users = {} as Record<RoleName, TenantUser>;
  for (const role of opts.roles ?? ROLES) {
    const email = `${role.toLowerCase().replace(/[^a-z]+/g, '.')}.${slug}@example.test`;
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        email,
        passwordHash,
        firstName: role.split(' ')[0],
        lastName: 'User',
        ...(role === 'Doctor' ? { qualification: 'MBBS', specialization: 'General Medicine', consultationFee: 500 } : {}),
      },
    });
    const roleRow = access.rolesByName.get(role);
    if (!roleRow) throw new Error(`role ${role} not bootstrapped`);
    await prisma.userRole.create({ data: { organizationId: org.id, branchId: branch.id, userId: user.id, roleId: roleRow.id } });
    const session = await login(app, email);
    users[role] = { id: user.id, email, role, token: session.accessToken, sessionId: session.sessionId, refreshToken: session.refreshToken };
  }
  return {
    org: { id: org.id, name: org.name, slug: org.slug },
    branch: { id: branch.id, name: branch.name },
    users,
    owner: users['Organization Owner'],
    admin: users['Clinic Admin'],
    manager: users['Branch Manager'],
    doctor: users['Doctor'],
    receptionist: users['Receptionist'],
    nurse: users['Nurse'],
    accountant: users['Accountant'],
  };
}

export const auth = (user: TenantUser | string) => ({
  Authorization: `Bearer ${typeof user === 'string' ? user : user.token}`,
});

export async function createPatient(
  app: INestApplication,
  user: TenantUser,
  overrides: Record<string, unknown> = {},
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/patients')
    .set(auth(user))
    .send({ firstName: 'Asha', lastName: uniq('P'), gender: 'FEMALE', phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`, ...overrides });
  if (res.status !== 201) throw new Error(`createPatient failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/** ISO timestamps for a slot `daysAhead` days from now at a fixed local hour, `minutes` long. */
export function futureSlot(daysAhead = 1, hour = 10, minutes = 30, minuteOffset = 0) {
  const start = new Date();
  start.setDate(start.getDate() + daysAhead);
  start.setHours(hour, minuteOffset, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  return { scheduledStart: start.toISOString(), scheduledEnd: end.toISOString() };
}
