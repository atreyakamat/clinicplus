import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Patient CRM (E2E) — Phase 5', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any; let branch: any; let user: any; let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
    await app.init();

    org = await prisma.organization.create({ data: { name: 'CRM Test', slug: `crm-${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: 'CRM Branch', organizationId: org.id } });
    user = await prisma.user.create({
      data: { email: `crm-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'CRM', lastName: 'User', organizationId: org.id, branchId: branch.id },
    });
    token = jwtService.sign({
      sub: user.id, email: user.email, organizationId: org.id, branchId: branch.id,
      roles: ['Organization Owner'], permissions: [],
    });
  });

  afterAll(async () => {
    if (org?.id) {
      await prisma.patientNote.deleteMany({ where: { organizationId: org.id } });
      await prisma.patientTag.deleteMany({ where: { organizationId: org.id } });
      await prisma.patientEmergencyContact.deleteMany({ where: { organizationId: org.id } });
      await prisma.patientAddress.deleteMany({ where: { organizationId: org.id } });
      await prisma.patient.deleteMany({ where: { organizationId: org.id } });
      await prisma.user.deleteMany({ where: { organizationId: org.id } });
      await prisma.branch.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
    await app.close();
  });

  describe('Create Patient', () => {
    it('should create a patient with required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'John', lastName: 'Doe', phone: '5550101000', gender: 'Male' });
      expect(res.status).toBe(201);
      const body = res.body.data || res.body;
      expect(body.id).toBeDefined();
      expect(body.patientCode).toMatch(/^PAT-/);
    });

    it('should reject patient with missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Incomplete' });
      expect(res.status).toBe(400);
    });

    it('should reject duplicate email within same org', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'First', lastName: 'Dup', email: 'dup@test.com', phone: '5550101001' });
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Second', lastName: 'Dup', email: 'dup@test.com', phone: '5550101002' });
      expect(res.status).toBe(409);
    });

    it('should reject duplicate phone within same org', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Phone', lastName: 'Dup', phone: '5550101999' });
      expect(res.status).toBe(201);
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Phone2', lastName: 'Dup', phone: '5550101999' });
      expect(res2.status).toBe(409);
    });

    it('should validate email format', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Bad', lastName: 'Email', phone: '5550101111', email: 'not-an-email' });
      expect(res.status).toBe(400);
    });
  });

  describe('Edit Patient', () => {
    let pid: string;
    beforeEach(async () => {
      const p = await prisma.patient.create({
        data: { firstName: 'Edit', lastName: 'Me', phone: '5550101222', organizationId: org.id, branchId: branch.id },
      });
      pid = p.id;
    });
    afterEach(async () => {
      await prisma.patient.delete({ where: { id: pid } }).catch(() => {});
    });

    it('should update patient fields', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/patients/${pid}`).set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Edited', lastName: 'Name' });
      expect(res.status).toBe(200);
    });

    it('should reject update with invalid ID', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/patients/invalid-id').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Bad' });
      expect(res.status).toBe(400);
    });
  });

  describe('Search Patient', () => {
    beforeAll(async () => {
      await prisma.patient.createMany({
        data: [
          { firstName: 'Search', lastName: 'Me', phone: '5550200001', organizationId: org.id, branchId: branch.id },
          { firstName: 'Findable', lastName: 'Patient', phone: '5550200002', organizationId: org.id, branchId: branch.id },
          { firstName: 'Hidden', lastName: 'Patient', phone: '5550200003', organizationId: org.id, branchId: branch.id },
        ],
      });
    });

    it('should search by first name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients/search?q=Search').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = res.body.data || res.body;
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((p: any) => p.firstName === 'Search')).toBe(true);
    });

    it('should search by phone', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients/search?q=5550200002').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = res.body.data || res.body;
      expect(body.some((p: any) => p.phone === '5550200002')).toBe(true);
    });

    it('should return empty for short query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients/search?q=a').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = res.body.data || res.body;
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('Archive Patient (Soft Delete)', () => {
    let pid: string;
    beforeEach(async () => {
      const p = await prisma.patient.create({
        data: { firstName: 'Archive', lastName: 'Patient', phone: '5550300001', organizationId: org.id, branchId: branch.id },
      });
      pid = p.id;
    });

    it('should soft delete patient', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/patients/${pid}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const deleted = await prisma.patient.findUnique({ where: { id: pid } });
      expect(deleted?.status).toBe('INACTIVE');
      expect(deleted?.deletedAt).toBeDefined();
    });
  });

  describe('Pagination & Filtering', () => {
    it('should return paginated patient list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients?page=1&limit=5').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = res.body.data || res.body;
      expect(Array.isArray(body)).toBe(true);
    });

    it('should handle no patients gracefully', async () => {
      const newOrg = await prisma.organization.create({ data: { name: 'Empty Org', slug: `empty-${Date.now()}` } });
      const newBranch = await prisma.branch.create({ data: { name: 'Empty', organizationId: newOrg.id } });
      const newUser = await prisma.user.create({
        data: { email: `empty-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'Empty', lastName: 'U', organizationId: newOrg.id, branchId: newBranch.id },
      });
      const t = jwtService.sign({ sub: newUser.id, email: newUser.email, organizationId: newOrg.id, branchId: newBranch.id, roles: ['Organization Owner'], permissions: [] });

      const res = await request(app.getHttpServer())
        .get('/api/v1/patients').set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(200);

      await prisma.user.deleteMany({ where: { organizationId: newOrg.id } });
      await prisma.branch.deleteMany({ where: { organizationId: newOrg.id } });
      await prisma.organization.delete({ where: { id: newOrg.id } });
    });
  });

  describe('Export', () => {
    it('should export patients as CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients/export/csv').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/csv|text/);
    });
  });
});
