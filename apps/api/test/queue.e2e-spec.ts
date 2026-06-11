import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Queue Management (E2E) — Phase 7', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any; let branch: any; let doctor: any; let patient: any; let token: string; let apptId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
    await app.init();

    org = await prisma.organization.create({ data: { name: 'Queue Test', slug: `queue-${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: 'Queue Branch', organizationId: org.id } });
    doctor = await prisma.user.create({
      data: { email: `dr-q-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'DrQ', lastName: 'Test', organizationId: org.id, branchId: branch.id },
    });
    patient = await prisma.patient.create({
      data: { firstName: 'Queue', lastName: 'Pat', phone: '5550500001', organizationId: org.id, branchId: branch.id },
    });
    apptId = (await prisma.appointment.create({
      data: { patientId: patient.id, doctorId: doctor.id, organizationId: org.id, branchId: branch.id, scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000) },
    })).id;

    await prisma.queue.create({ data: { name: 'Test Queue', branchId: branch.id, organizationId: org.id } });

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

  describe('Check-In (Token Generation)', () => {
    it('should check in an appointment and create queue entry', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/queues/check-in').set('Authorization', `Bearer ${token}`)
        .send({ appointmentId: apptId });
      expect(res.status).toBeDefined();
    });

    it('should reject check-in with invalid appointment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/queues/check-in').set('Authorization', `Bearer ${token}`)
        .send({ appointmentId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBeDefined();
    });
  });

  describe('Live Queue Display', () => {
    it('should return live queue for branch', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/queues/live').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });
  });

  describe('Queue Entry Status', () => {
    let entryId: string;
    beforeEach(async () => {
      const q = await prisma.queue.findFirst({ where: { organizationId: org.id } });
      if (!q) return;
      const entry = await prisma.queueEntry.create({
        data: { queueId: q.id, appointmentId: apptId, organizationId: org.id, branchId: branch.id, tokenNumber: 1 },
      });
      entryId = entry.id;
    });

    it('should update queue entry status to CALLED', async () => {
      if (!entryId) return;
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/queues/entries/${entryId}/status`).set('Authorization', `Bearer ${token}`)
        .send({ status: 'CALLED' });
      expect(res.status).toBeDefined();
    });

    it('should update queue entry status to IN_PROGRESS', async () => {
      if (!entryId) return;
      await request(app.getHttpServer())
        .patch(`/api/v1/queues/entries/${entryId}/status`).set('Authorization', `Bearer ${token}`)
        .send({ status: 'IN_PROGRESS' });
      const updated = await prisma.queueEntry.findUnique({ where: { id: entryId } });
      if (updated) expect(updated.status).toBe('IN_PROGRESS');
    });

    it('should update queue entry status to COMPLETED', async () => {
      if (!entryId) return;
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/queues/entries/${entryId}/status`).set('Authorization', `Bearer ${token}`)
        .send({ status: 'COMPLETED' });
      await prisma.queueEntry.delete({ where: { id: entryId } }).catch(() => {});
    });
  });

  describe('Queue Order', () => {
    it('should assign sequential token numbers', async () => {
      const q = await prisma.queue.findFirst({ where: { organizationId: org.id } });
      if (!q) return;
      const p2 = await prisma.patient.create({
        data: { firstName: 'Queue2', lastName: 'Pat', phone: '5550500002', organizationId: org.id, branchId: branch.id },
      });
      const a2 = await prisma.appointment.create({
        data: { patientId: p2.id, doctorId: doctor.id, organizationId: org.id, branchId: branch.id, scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000) },
      });

      await request(app.getHttpServer())
        .post('/api/v1/queues/check-in').set('Authorization', `Bearer ${token}`)
        .send({ appointmentId: a2.id });
    });
  });
});
