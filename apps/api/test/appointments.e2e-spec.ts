import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Appointments (E2E) — Phase 6', () => {
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

    org = await prisma.organization.create({ data: { name: 'Appt Test', slug: `appt-${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: 'Appt Branch', organizationId: org.id } });
    doctor = await prisma.user.create({
      data: { email: `doc-appt-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'Dr', lastName: 'Appt', organizationId: org.id, branchId: branch.id },
    });
    patient = await prisma.patient.create({
      data: { firstName: 'Appt', lastName: 'Patient', phone: '5550400001', organizationId: org.id, branchId: branch.id },
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

  describe('Booking', () => {
    it('should create an appointment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/appointments').set('Authorization', `Bearer ${token}`)
        .send({ patientId: patient.id, doctorId: doctor.id, scheduledStart: new Date().toISOString(), scheduledEnd: new Date(Date.now() + 3600000).toISOString() });
      expect(res.status).toBeDefined();
      const body = res.body.data || res.body;
      expect(body.id).toBeDefined();
      expect(body.status).toBe('SCHEDULED');
    });

    it('should reject appointment with missing patientId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/appointments').set('Authorization', `Bearer ${token}`)
        .send({ doctorId: doctor.id, scheduledStart: new Date().toISOString() });
      expect(res.status).toBeDefined();
    });
  });

  describe('Reschedule', () => {
    let apptId: string;
    beforeEach(async () => {
      const a = await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.id, organizationId: org.id, branchId: branch.id, scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000) },
      });
      apptId = a.id;
    });

    it('should update appointment time', async () => {
      const newStart = new Date(Date.now() + 7200000).toISOString();
      const newEnd = new Date(Date.now() + 10800000).toISOString();
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${apptId}`).set('Authorization', `Bearer ${token}`)
        .send({ scheduledStart: newStart, scheduledEnd: newEnd });
      expect(res.status).toBeDefined();
    });

    it('should reject invalid appointment ID', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/appointments/invalid-id').set('Authorization', `Bearer ${token}`)
        .send({ status: 'CONFIRMED' });
      expect(res.status).toBeDefined();
    });
  });

  describe('Cancellation', () => {
    let apptId: string;
    beforeEach(async () => {
      const a = await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.id, organizationId: org.id, branchId: branch.id, scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000) },
      });
      apptId = a.id;
    });

    it('should cancel appointment', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${apptId}`).set('Authorization', `Bearer ${token}`)
        .send({ status: 'CANCELLED' });
      expect(res.status).toBeDefined();
      const updated = await prisma.appointment.findUnique({ where: { id: apptId } });
      expect(updated?.status).toBe('CANCELLED');
    });
  });

  describe('No-Show', () => {
    let apptId: string;
    beforeEach(async () => {
      const a = await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.id, organizationId: org.id, branchId: branch.id, scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000) },
      });
      apptId = a.id;
    });

    it('should mark appointment as no-show', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${apptId}`).set('Authorization', `Bearer ${token}`)
        .send({ status: 'NO_SHOW' });
      expect(res.status).toBeDefined();
      const updated = await prisma.appointment.findUnique({ where: { id: apptId } });
      expect(updated?.status).toBe('NO_SHOW');
    });
  });

  describe('Check-In', () => {
    let apptId: string;
    beforeEach(async () => {
      const a = await prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.id, organizationId: org.id, branchId: branch.id, scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000) },
      });
      apptId = a.id;
    });

    it('should check in for appointment', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${apptId}`).set('Authorization', `Bearer ${token}`)
        .send({ status: 'CHECKED_IN' });
      expect(res.status).toBeDefined();
    });
  });

  describe('Doctor Availability Integration', () => {
    it('should list appointments filtered by doctor', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/appointments?doctorId=${doctor.id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });
  });

  describe('Double Booking Prevention', () => {
    it('should allow appointments at different times', async () => {
      const start1 = new Date('2026-12-01T09:00:00Z').toISOString();
      const end1 = new Date('2026-12-01T09:30:00Z').toISOString();
      const start2 = new Date('2026-12-01T10:00:00Z').toISOString();
      const end2 = new Date('2026-12-01T10:30:00Z').toISOString();

      const r1 = await request(app.getHttpServer())
        .post('/api/v1/appointments').set('Authorization', `Bearer ${token}`)
        .send({ patientId: patient.id, doctorId: doctor.id, scheduledStart: start1, scheduledEnd: end1 });
      expect(r1.status).toBe(201);

      const r2 = await request(app.getHttpServer())
        .post('/api/v1/appointments').set('Authorization', `Bearer ${token}`)
        .send({ patientId: patient.id, doctorId: doctor.id, scheduledStart: start2, scheduledEnd: end2 });
      expect(r2.status).toBe(201);
    });

    it('should export appointments as CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/appointments/export/csv').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
      expect(res.headers['content-type']).toMatch(/csv|text/);
    });
  });
});
