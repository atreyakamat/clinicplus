/**
 * Latency smoke benchmarks for hot read paths. Budgets are generous (shared CI
 * databases) but catch N+1 regressions and missing indexes.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, Tenant } from './helpers/app';

const BUDGET_MS = 1000;

async function timed<T>(fn: () => Promise<T>) {
  const start = process.hrtime.bigint();
  const result = await fn();
  return { result, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

describe('Benchmarks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let t: Tenant;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    t = await createTenant(app, prisma, 'Bench', { roles: ['Organization Owner', 'Receptionist', 'Doctor'] });
    for (let i = 0; i < 15; i++) await createPatient(app, t.receptionist);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['patient list', '/api/v1/patients'],
    ['patient search', '/api/v1/patients/search?q=Asha'],
    ['staff list', '/api/v1/users?allBranches=true'],
    ['roles with permissions', '/api/v1/roles'],
    ['audit log page', '/api/v1/audit-logs?limit=50'],
    ['auth profile (per-request RBAC lookup)', '/api/v1/auth/profile'],
  ])(`%s responds within ${BUDGET_MS}ms`, async (_name, url) => {
    // Warm-up then measure.
    await http().get(url).set(auth(t.owner));
    const { result, ms } = await timed(() => http().get(url).set(auth(t.owner)));
    expect(result.status).toBe(200);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('login (bcrypt + session) completes within 2s', async () => {
    const { result, ms } = await timed(() => http().post('/api/v1/auth/login').send({ email: t.doctor.email, password: 'Test-Password-123' }));
    expect(result.status).toBe(200);
    expect(ms).toBeLessThan(2000);
  });

  it('RBAC is enforced on benchmarked paths (doctor cannot list staff)', async () => {
    expect((await http().get('/api/v1/users').set(auth(t.doctor))).status).toBe(403);
    expect((await http().get('/api/v1/patients').set(auth(t.doctor))).status).toBe(200);
  });

  it('health probes respond within 200ms', async () => {
    await http().get('/health/live');
    const { ms } = await timed(() => http().get('/health/live'));
    expect(ms).toBeLessThan(200);
  });
});
