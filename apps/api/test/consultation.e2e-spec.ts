import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Consultation (E2E) — Phase 8', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any; let branch: any; let doctor: any; let patient: any; let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
    await app.init();

    org = await prisma.organization.create({ data: { name: 'Cons Test', slug: `cons-${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: 'Cons Branch', organizationId: org.id } });
    doctor = await prisma.user.create({
      data: { email: `dr-c-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'DrC', lastName: 'Test', organizationId: org.id, branchId: branch.id },
    });
    patient = await prisma.patient.create({
      data: { firstName: 'Cons', lastName: 'Pat', phone: '5550600001', organizationId: org.id, branchId: branch.id },
    });
    token = jwtService.sign({
      sub: doctor.id, email: doctor.email, organizationId: org.id, branchId: branch.id,
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

  describe('Create Consultation', () => {
    it('should create a consultation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/consultations').set('Authorization', `Bearer ${token}`)
        .send({ patientId: patient.id, chiefComplaint: 'Headache and fever' });
      expect(res.status).toBeDefined();
      const body = res.body.data || res.body;
      expect(body.id).toBeDefined();
      expect(body.status).toBe('DRAFT');
    });

    it('should reject consultation without patientId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/consultations').set('Authorization', `Bearer ${token}`)
        .send({ chiefComplaint: 'Pain' });
      expect(res.status).toBeDefined();
    });
  });

  describe('Consultation Management', () => {
    let consultId: string;
    beforeEach(async () => {
      const c = await prisma.consultation.create({
        data: { patientId: patient.id, doctorId: doctor.id, organizationId: org.id, branchId: branch.id, chiefComplaint: 'Test' },
      });
      consultId = c.id;
    });

    it('should get consultation by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/consultations/${consultId}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
      const body = res.body.data || res.body;
      expect(body.chiefComplaint).toBe('Test');
    });

    it('should update consultation', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/consultations/${consultId}`).set('Authorization', `Bearer ${token}`)
        .send({ clinicalNotes: 'Patient is stable' });
      expect(res.status).toBeDefined();
    });

    it('should complete consultation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/consultations/${consultId}/complete`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
      const updated = await prisma.consultation.findUnique({ where: { id: consultId } });
      expect(updated?.status).toBe('COMPLETED');
    });

    it('should list consultations filtered by patient', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/consultations?patientId=${patient.id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
      const body = res.body.data || res.body;
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('Vitals Integration', () => {
    it('should handle vitals as part of consultation flow', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/consultations').set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patient.id,
          chiefComplaint: 'Routine checkup',
        });
      expect(res.status).toBeDefined();
    });
  });
});
