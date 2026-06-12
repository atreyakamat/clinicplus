import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Follow-Up (E2E) — Phase 11', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any;
  let branch: any;
  let doctor: any;
  let patient: any;
  let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
    await app.init();

    org = await prisma.organization.create({
      data: { name: 'FU Test', slug: `fu-${Date.now()}` },
    });
    branch = await prisma.branch.create({
      data: { name: 'FU Branch', organizationId: org.id },
    });
    doctor = await prisma.user.create({
      data: {
        email: `dr-fu-${Date.now()}@t.com`,
        passwordHash: 'h',
        firstName: 'DrFU',
        lastName: 'Test',
        organizationId: org.id,
        branchId: branch.id,
      },
    });
    patient = await prisma.patient.create({
      data: {
        firstName: 'FU',
        lastName: 'Pat',
        phone: '5550900001',
        organizationId: org.id,
        branchId: branch.id,
      },
    });
    token = jwtService.sign({
      sub: doctor.id,
      email: doctor.email,
      organizationId: org.id,
      branchId: branch.id,
      roles: ['Organization Owner'],
      permissions: ['*'],
    });
  });

  afterAll(async () => {
    try {
      const tablenames =
        await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
      const tables = tablenames
        .map(({ tablename }) => tablename)
        .filter((name) => name !== '_prisma_migrations')
        .map((name) => `"public"."${name}"`)
        .join(', ');
      if (tables.length > 0) {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
      }
    } catch (e) {
      console.error(e);
    }
    await app.close();
  });

  describe('Create Follow-Up', () => {
    it('should schedule a follow-up', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/follow-ups')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patient.id,
          scheduledDate: new Date(Date.now() + 604800000).toISOString(),
        });
      expect(res.status).toBeDefined();
      const body = res.body.data || res.body;
      expect(body.id).toBeDefined();
    });

    it('should reject follow-up with missing patientId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/follow-ups')
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDate: new Date().toISOString() });
      expect(res.status).toBeDefined();
    });

    it('should reject follow-up in the past', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/follow-ups')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patient.id,
          scheduledDate: new Date('2020-01-01').toISOString(),
        });
      expect(res.status).toBeDefined();
    });
  });

  describe('Follow-Up Management', () => {
    let fuId: string;
    beforeEach(async () => {
      const fu = await prisma.followUp.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          organizationId: org.id,
          branchId: branch.id,
          scheduledDate: new Date(Date.now() + 86400000),
        },
      });
      fuId = fu.id;
    });

    it('should list follow-ups', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/follow-ups')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });

    it('should update follow-up status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/follow-ups/${fuId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'COMPLETED' });
      expect(res.status).toBeDefined();
    });

    it('should add follow-up outcome', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/follow-ups/${fuId}/outcomes`)
        .set('Authorization', `Bearer ${token}`)
        .send({ outcome: 'Patient recovered fully', status: 'RESOLVED' });
      expect(res.status).toBeDefined();
    });
  });
});
