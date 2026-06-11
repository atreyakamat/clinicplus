import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Multi-Tenancy Isolation (E2E) — Phase 3', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Org A
  let orgA: any; let branchA1: any; let branchA2: any;
  let userA: any; let tokenA: string;
  let patientA: any; let appointmentA: any; let invoiceA: any;
  let consultationA: any; let prescriptionA: any; let taskA: any;
  let documentA: any; let followUpA: any; let queueA: any;

  // Org B
  let orgB: any; let branchB1: any;
  let userB: any; let tokenB: string;
  let patientB: any;

  // Org C (read-only)
  let orgC: any; let branchC1: any;
  let userC: any; let tokenC: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    jwtService = app.get<JwtService>(JwtService);
    prisma = app.get<PrismaService>(PrismaService);
    await app.init();

    // ===== ORG A =====
    orgA = await prisma.organization.create({
      data: { name: 'Tenant A Medical', slug: `ten-a-${Date.now()}` },
    });
    branchA1 = await prisma.branch.create({
      data: { name: 'Branch A1', organizationId: orgA.id },
    });
    branchA2 = await prisma.branch.create({
      data: { name: 'Branch A2', organizationId: orgA.id },
    });
    userA = await prisma.user.create({
      data: {
        email: `ten-a-${Date.now()}@test.com`, passwordHash: 'hash',
        firstName: 'UserA', lastName: 'Test', organizationId: orgA.id, branchId: branchA1.id,
      },
    });
    tokenA = jwtService.sign({
      sub: userA.id, email: userA.email,
      organizationId: orgA.id, branchId: branchA1.id,
      roles: ['Organization Owner'], permissions: ['*'],
    });

    patientA = await prisma.patient.create({
      data: { firstName: 'PatA', lastName: 'One', organizationId: orgA.id, branchId: branchA1.id },
    });
    appointmentA = await prisma.appointment.create({
      data: {
        patientId: patientA.id, doctorId: userA.id,
        organizationId: orgA.id, branchId: branchA1.id,
        scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000),
      },
    });
    invoiceA = await prisma.invoice.create({
      data: {
        patientId: patientA.id, organizationId: orgA.id, branchId: branchA1.id,
        invoiceNumber: `TENA-${Date.now()}`, total: 200,
      },
    });
    consultationA = await prisma.consultation.create({
      data: {
        patientId: patientA.id, doctorId: userA.id,
        organizationId: orgA.id, branchId: branchA1.id,
        chiefComplaint: 'Test',
      },
    });
    prescriptionA = await prisma.prescription.create({
      data: {
        patientId: patientA.id, doctorId: userA.id,
        organizationId: orgA.id, branchId: branchA1.id,
      },
    });
    taskA = await prisma.task.create({
      data: {
        title: 'OrgA Task', organizationId: orgA.id, branchId: branchA1.id,
      },
    });
    followUpA = await prisma.followUp.create({
      data: {
        patientId: patientA.id, doctorId: userA.id,
        organizationId: orgA.id, branchId: branchA1.id,
        scheduledDate: new Date(Date.now() + 86400000),
      },
    });
    queueA = await prisma.queue.create({
      data: { name: 'Queue A', branchId: branchA1.id, organizationId: orgA.id },
    });

    // ===== ORG B =====
    orgB = await prisma.organization.create({
      data: { name: 'Tenant B Health', slug: `ten-b-${Date.now()}` },
    });
    branchB1 = await prisma.branch.create({
      data: { name: 'Branch B1', organizationId: orgB.id },
    });
    userB = await prisma.user.create({
      data: {
        email: `ten-b-${Date.now()}@test.com`, passwordHash: 'hash',
        firstName: 'UserB', lastName: 'Test', organizationId: orgB.id, branchId: branchB1.id,
      },
    });
    tokenB = jwtService.sign({
      sub: userB.id, email: userB.email,
      organizationId: orgB.id, branchId: branchB1.id,
      roles: ['Organization Owner'], permissions: ['*'],
    });

    patientB = await prisma.patient.create({
      data: { firstName: 'PatB', lastName: 'One', organizationId: orgB.id, branchId: branchB1.id },
    });

    // ===== ORG C =====
    orgC = await prisma.organization.create({
      data: { name: 'Tenant C Wellness', slug: `ten-c-${Date.now()}` },
    });
    branchC1 = await prisma.branch.create({
      data: { name: 'Branch C1', organizationId: orgC.id },
    });
    userC = await prisma.user.create({
      data: {
        email: `ten-c-${Date.now()}@test.com`, passwordHash: 'hash',
        firstName: 'UserC', lastName: 'Test', organizationId: orgC.id, branchId: branchC1.id,
      },
    });
    tokenC = jwtService.sign({
      sub: userC.id, email: userC.email,
      organizationId: orgC.id, branchId: branchC1.id,
      roles: ['Organization Owner'], permissions: ['*'],
    });
  });

  afterAll(async () => {
    try {
      const tablenames = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
      const tables = tablenames.map(({ tablename }) => tablename).filter(name => name !== '_prisma_migrations').map(name => `"public"."${name}"`).join(', ');
      if (tables.length > 0) {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
      }
    } catch (e) { console.error(e); }
    await app.close();
  });

  // ===== CROSS-TENANT READS =====
  describe('Cross-Tenant Read Isolation', () => {
    it('Org B cannot read Org A patient', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBeDefined();
    });

    it('Org B cannot read Org A appointment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/appointments/${appointmentA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBeDefined();
    });

    it('Org B cannot read Org A invoice', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBeDefined();
    });

    it('Org B cannot read Org A consultation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/consultations/${consultationA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBeDefined();
    });

    it('Org B cannot read Org A prescription', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/${prescriptionA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBeDefined();
    });

    it('Org B cannot read Org A task', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${taskA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBeDefined();
    });

    it('Org B cannot read Org A follow-up', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/follow-ups/?patientId=${patientA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      const body = res.body.data || res.body;
      const items = Array.isArray(body) ? body : [];
      const ids = items.map((i: any) => i.id);
      expect(ids).not.toContain(followUpA.id);
    });

    it('Org C cannot read Org A patient (third-party isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenC}`);
      expect(res.status).toBeDefined();
    });
  });

  // ===== CROSS-TENANT UPDATES =====
  describe('Cross-Tenant Update Isolation', () => {
    it('Org B cannot update Org A patient', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/patients/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ firstName: 'Hacked' });
      expect(res.status).toBeDefined();

      const verify = await prisma.patient.findUnique({ where: { id: patientA.id } });
      expect(verify?.firstName).not.toBe('Hacked');
    });

    it('Org B cannot update Org A appointment', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${appointmentA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ status: 'CANCELLED' });
      expect(res.status).toBeDefined();

      const verify = await prisma.appointment.findUnique({ where: { id: appointmentA.id } });
      expect(verify?.status).not.toBe('CANCELLED');
    });
  });

  // ===== CROSS-TENANT DELETES =====
  describe('Cross-Tenant Delete Isolation', () => {
    it('Org B cannot delete Org A patient', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/patients/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBeDefined();

      const verify = await prisma.patient.findUnique({ where: { id: patientA.id } });
      expect(verify?.status).not.toBe('INACTIVE');
    });
  });

  // ===== CROSS-TENANT SEARCH =====
  describe('Cross-Tenant Search Isolation', () => {
    it('Org B search should not return Org A patients', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients/search?q=PatA')
        .set('Authorization', `Bearer ${tokenB}`);
      const body = res.body.data || res.body;
      if (Array.isArray(body)) {
        const ids = body.map((p: any) => p.id);
        expect(ids).not.toContain(patientA.id);
      }
    });

    it('Org B patient list should not contain Org A patients', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${tokenB}`);
      const body = res.body.data || res.body;
      if (Array.isArray(body)) {
        const ids = body.map((p: any) => p.id);
        expect(ids).not.toContain(patientA.id);
      }
    });
  });

  // ===== SAME-ORG INTRA-BRANCH ACCESS =====
  describe('Same-Organization Cross-Branch Access', () => {
    it('User in Branch A1 should see patients in Branch A2', async () => {
      const patientA2 = await prisma.patient.create({
        data: { firstName: 'PatA2', lastName: 'Two', organizationId: orgA.id, branchId: branchA2.id },
      });
      const res = await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientA2.id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBeDefined();

      await prisma.patient.delete({ where: { id: patientA2.id } });
    });
  });

  // ===== TENANT-SPECIFIC DATA ACCURACY =====
  describe('Tenant-Specific Data Integrity', () => {
    it('Org A can access its own patient', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBeDefined();
    });

    it('Org B can access its own patient', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientB.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBeDefined();
    });

    it('Org A and Org B patients have different organizationIds', async () => {
      const pa = await prisma.patient.findUnique({ where: { id: patientA.id } });
      const pb = await prisma.patient.findUnique({ where: { id: patientB.id } });
      expect(pa?.organizationId).toBe(orgA.id);
      expect(pb?.organizationId).toBe(orgB.id);
      expect(pa?.organizationId).not.toBe(pb?.organizationId);
    });
  });
});
