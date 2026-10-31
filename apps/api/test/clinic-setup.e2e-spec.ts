import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { Tenant, auth, createTenant, createTestApp } from './helpers/app';

describe('Clinic setup: branches, departments, services, hours, holidays (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'Setup A');
    B = await createTenant(app, prisma, 'Setup B', { roles: ['Organization Owner', 'Receptionist'] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('branches', () => {
    let branch2: any;

    it('owner creates a branch with a validated timezone', async () => {
      const bad = await http().post('/api/v1/branches').set(auth(A.owner)).send({ name: 'Bad TZ', timezone: 'Mars/Base' });
      expect(bad.status).toBe(400);
      const res = await http().post('/api/v1/branches').set(auth(A.owner)).send({ name: 'Second Branch', city: 'Mumbai', timezone: 'Asia/Kolkata' });
      expect(res.status).toBe(201);
      branch2 = res.body.data;
      expect(branch2.organizationId).toBe(A.org.id);
      const dup = await http().post('/api/v1/branches').set(auth(A.owner)).send({ name: 'second branch' });
      expect(dup.status).toBe(409);
    });

    it('org-wide users list all branches; branch staff see only their own', async () => {
      const all = await http().get('/api/v1/branches').set(auth(A.admin));
      expect(all.status).toBe(200);
      expect(all.body.data.map((b: any) => b.id).sort()).toEqual([A.branch.id, branch2.id].sort());
      const mine = await http().get('/api/v1/branches').set(auth(A.manager));
      expect(mine.status).toBe(200);
      expect(mine.body.data.map((b: any) => b.id)).toEqual([A.branch.id]);
      expect((await http().get(`/api/v1/branches/${branch2.id}`).set(auth(A.manager))).status).toBe(404);
    });

    it('RBAC: branch manager and receptionist cannot create branches', async () => {
      expect((await http().post('/api/v1/branches').set(auth(A.manager)).send({ name: 'X' })).status).toBe(403);
      expect((await http().post('/api/v1/branches').set(auth(A.receptionist)).send({ name: 'X' })).status).toBe(403);
      expect((await http().get('/api/v1/branches').set(auth(A.receptionist))).status).toBe(403);
    });

    it('owner updates a branch; cross-tenant ids are 404', async () => {
      const res = await http().patch(`/api/v1/branches/${branch2.id}`).set(auth(A.owner)).send({ phone: '+91 2222', organizationId: B.org.id });
      expect(res.status).toBe(200);
      expect(res.body.data.phone).toBe('+91 2222');
      expect(res.body.data.organizationId).toBe(A.org.id);
      expect((await http().get(`/api/v1/branches/${branch2.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().patch(`/api/v1/branches/${branch2.id}`).set(auth(B.owner)).send({ name: 'pwn' })).status).toBe(404);
      expect((await http().delete(`/api/v1/branches/${branch2.id}`).set(auth(B.owner))).status).toBe(404);
    });

    it('branch-level staff sending X-Branch-Id of another branch get 403; org-wide users can switch', async () => {
      const denied = await http().get('/api/v1/appointments').set(auth(A.receptionist)).set('X-Branch-Id', branch2.id);
      expect(denied.status).toBe(403);
      const ok = await http().get('/api/v1/departments').set(auth(A.owner)).set('X-Branch-Id', branch2.id);
      expect(ok.status).toBe(200);
      const foreign = await http().get('/api/v1/departments').set(auth(A.owner)).set('X-Branch-Id', B.branch.id);
      expect(foreign.status).toBe(403);
    });

    it('cannot archive a branch with active staff; can archive an empty one', async () => {
      expect((await http().delete(`/api/v1/branches/${A.branch.id}`).set(auth(A.owner))).status).toBe(409);
      const res = await http().delete(`/api/v1/branches/${branch2.id}`).set(auth(A.owner));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ARCHIVED');
      const list = await http().get('/api/v1/branches').set(auth(A.owner));
      expect(list.body.data.some((b: any) => b.id === branch2.id)).toBe(false);
      const restored = await http().patch(`/api/v1/branches/${branch2.id}`).set(auth(A.owner)).send({ status: 'ACTIVE' });
      expect(restored.status).toBe(200);
      expect(restored.body.data.status).toBe('ACTIVE');
    });
  });

  describe('departments', () => {
    let dep: any;

    it('admin creates, lists, updates and archives departments in the active branch', async () => {
      const res = await http().post('/api/v1/departments').set(auth(A.admin)).send({ name: 'Cardiology', description: 'Heart' });
      expect(res.status).toBe(201);
      dep = res.body.data;
      expect(dep.branchId).toBe(A.branch.id);
      expect((await http().post('/api/v1/departments').set(auth(A.admin)).send({ name: 'cardiology' })).status).toBe(409);
      const list = await http().get('/api/v1/departments').set(auth(A.manager));
      expect(list.body.data.map((d: any) => d.id)).toContain(dep.id);
      const upd = await http().patch(`/api/v1/departments/${dep.id}`).set(auth(A.admin)).send({ description: 'Cardiac care' });
      expect(upd.body.data.description).toBe('Cardiac care');
    });

    it('RBAC: manager (view only) and receptionist cannot manage departments', async () => {
      expect((await http().post('/api/v1/departments').set(auth(A.manager)).send({ name: 'ENT' })).status).toBe(403);
      expect((await http().get('/api/v1/departments').set(auth(A.receptionist))).status).toBe(403);
    });

    it('cross-tenant department ids are 404', async () => {
      expect((await http().get(`/api/v1/departments/${dep.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().patch(`/api/v1/departments/${dep.id}`).set(auth(B.owner)).send({ name: 'x' })).status).toBe(404);
    });
  });

  describe('services catalog', () => {
    let svc: any;

    it('admin manages services with decimal prices', async () => {
      const dep = await prisma.department.findFirst({ where: { organizationId: A.org.id } });
      const res = await http().post('/api/v1/clinic-settings/services').set(auth(A.admin)).send({ name: 'Consultation', price: 499.5, duration: 20, departmentId: dep!.id });
      expect(res.status).toBe(201);
      svc = res.body.data;
      expect(String(svc.price)).toBe('499.5');
      const badDep = await http().post('/api/v1/clinic-settings/services').set(auth(A.admin)).send({ name: 'X-ray', price: 100, departmentId: B.branch.id });
      expect(badDep.status).toBe(404);
      const badPrice = await http().post('/api/v1/clinic-settings/services').set(auth(A.admin)).send({ name: 'Y', price: 1.234 });
      expect(badPrice.status).toBe(400);
      const upd = await http().patch(`/api/v1/clinic-settings/services/${svc.id}`).set(auth(A.admin)).send({ price: 550 });
      expect(String(upd.body.data.price)).toBe('550');
      const list = await http().get('/api/v1/clinic-settings/services').set(auth(A.receptionist));
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(1);
    });

    it('RBAC: receptionist and doctor can view but not manage services; nurse cannot view', async () => {
      expect((await http().post('/api/v1/clinic-settings/services').set(auth(A.receptionist)).send({ name: 'Z', price: 1 })).status).toBe(403);
      expect((await http().patch(`/api/v1/clinic-settings/services/${svc.id}`).set(auth(A.doctor)).send({ price: 1 })).status).toBe(403);
      expect((await http().get('/api/v1/clinic-settings/services').set(auth(A.nurse))).status).toBe(403);
    });

    it('cross-tenant service ids are 404 and archive hides the service', async () => {
      expect((await http().get(`/api/v1/clinic-settings/services/${svc.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().delete(`/api/v1/clinic-settings/services/${svc.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().delete(`/api/v1/clinic-settings/services/${svc.id}`).set(auth(A.admin))).status).toBe(200);
      const list = await http().get('/api/v1/clinic-settings/services').set(auth(A.admin));
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe('working hours and holidays', () => {
    it('bulk replaces working hours for the active branch with validation', async () => {
      const bad = await http().put('/api/v1/clinic-settings/working-hours').set(auth(A.admin)).send({ days: [{ dayOfWeek: 1, openTime: '18:00', closeTime: '09:00' }] });
      expect(bad.status).toBe(400);
      const badBreak = await http().put('/api/v1/clinic-settings/working-hours').set(auth(A.admin)).send({ days: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', breakStart: '08:00', breakEnd: '10:00' }] });
      expect(badBreak.status).toBe(400);
      const days = [0, 1, 2, 3, 4, 5, 6].map((d) => (d === 0 ? { dayOfWeek: 0, closed: true } : { dayOfWeek: d, openTime: '09:00', closeTime: '18:00', breakStart: '13:00', breakEnd: '14:00' }));
      const res = await http().put('/api/v1/clinic-settings/working-hours').set(auth(A.admin)).send({ days });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(6);
      const again = await http().put('/api/v1/clinic-settings/working-hours').set(auth(A.admin)).send({ days });
      expect(again.body.data).toHaveLength(6);
      const get = await http().get('/api/v1/clinic-settings/working-hours').set(auth(A.receptionist));
      expect(get.body.data.every((h: any) => h.branchId === A.branch.id)).toBe(true);
      // tenant B does not see A's hours
      const other = await http().get('/api/v1/clinic-settings/working-hours').set(auth(B.owner));
      expect(other.body.data).toHaveLength(0);
    });

    it('RBAC: receptionist cannot change working hours', async () => {
      expect((await http().put('/api/v1/clinic-settings/working-hours').set(auth(A.receptionist)).send({ days: [] })).status).toBe(403);
    });

    it('holiday CRUD with duplicate-date conflict and tenant isolation', async () => {
      const res = await http().post('/api/v1/clinic-settings/holidays').set(auth(A.admin)).send({ name: 'Founders Day', date: '2031-01-15' });
      expect(res.status).toBe(201);
      const id = res.body.data.id;
      expect((await http().post('/api/v1/clinic-settings/holidays').set(auth(A.admin)).send({ name: 'Dup', date: '2031-01-15' })).status).toBe(409);
      expect((await http().post('/api/v1/clinic-settings/holidays').set(auth(A.admin)).send({ name: 'Bad', date: '2031-02-30' })).status).toBe(400);
      const list = await http().get('/api/v1/clinic-settings/holidays?from=2031-01-01&to=2031-12-31').set(auth(A.receptionist));
      expect(list.body.data.map((h: any) => h.id)).toEqual([id]);
      expect((await http().patch(`/api/v1/clinic-settings/holidays/${id}`).set(auth(B.owner)).send({ name: 'x' })).status).toBe(404);
      expect((await http().delete(`/api/v1/clinic-settings/holidays/${id}`).set(auth(A.receptionist))).status).toBe(403);
      const upd = await http().patch(`/api/v1/clinic-settings/holidays/${id}`).set(auth(A.admin)).send({ name: 'Foundation Day' });
      expect(upd.body.data.name).toBe('Foundation Day');
      expect((await http().delete(`/api/v1/clinic-settings/holidays/${id}`).set(auth(A.admin))).status).toBe(200);
    });
  });
});
