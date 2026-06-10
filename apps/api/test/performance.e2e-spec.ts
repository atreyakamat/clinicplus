import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { performance } from 'perf_hooks';

describe('Performance Testing (E2E) — Phase 16', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any; let branch: any; let doctor: any; let token: string;

  const LATENCY_THRESHOLD_MS = 500;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
    await app.init();

    org = await prisma.organization.create({ data: { name: 'Perf Test', slug: `perf-${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: 'Perf Branch', organizationId: org.id } });
    doctor = await prisma.user.create({
      data: { email: `perf-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'Perf', lastName: 'Doc', organizationId: org.id, branchId: branch.id },
    });
    token = jwtService.sign({
      sub: doctor.id, email: doctor.email, organizationId: org.id, branchId: branch.id,
      roles: ['Organization Owner'], permissions: [],
    });

    // Seed data
    const startTime = Date.now();
    console.log(`[PERF] Seeding data...`);

    const patients = Array.from({ length: 1000 }, (_, i) => ({
      firstName: `PerfPat${i}`,
      lastName: `Last${i}`,
      phone: `5552${String(i).padStart(6, '0')}`,
      organizationId: org.id,
      branchId: branch.id,
      createdAt: new Date(startTime + i),
    }));
    await prisma.patient.createMany({ data: patients, skipDuplicates: true });
    const createdPatients = await prisma.patient.findMany({ where: { organizationId: org.id }, take: 1000 });

    const appointments = createdPatients.slice(0, 500).map((p, i) => ({
      patientId: p.id,
      doctorId: doctor.id,
      organizationId: org.id,
      branchId: branch.id,
      scheduledStart: new Date(startTime + i * 3600000),
      scheduledEnd: new Date(startTime + i * 3600000 + 1800000),
    }));
    await prisma.appointment.createMany({ data: appointments, skipDuplicates: true });

    const consultations = createdPatients.slice(0, 300).map((p, i) => ({
      patientId: p.id,
      doctorId: doctor.id,
      organizationId: org.id,
      branchId: branch.id,
      chiefComplaint: `Checkup ${i}`,
    }));
    await prisma.consultation.createMany({ data: consultations, skipDuplicates: true });

    const invoices = createdPatients.slice(0, 400).map((p, i) => ({
      patientId: p.id,
      organizationId: org.id,
      branchId: branch.id,
      invoiceNumber: `PERF-${i}-${Date.now()}`,
      total: Math.floor(Math.random() * 500) + 50,
    }));
    await prisma.invoice.createMany({ data: invoices, skipDuplicates: true });

    console.log(`[PERF] Seeded: ${createdPatients.length} patients, ${appointments.length} appointments, ${consultations.length} consultations, ${invoices.length} invoices`);
  });

  afterAll(async () => {
    if (org?.id) {
      const ids = [org.id];
      await prisma.prescriptionItem.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.prescription.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.consultation.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.invoiceItem.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.invoice.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.queueEntry.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.queue.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.appointment.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.patient.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.user.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.branch.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
    await app.close();
  });

  const benchmark = async (name: string, fn: () => Promise<any>, threshold = LATENCY_THRESHOLD_MS) => {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`);
    return { result, duration };
  };

  describe('Patient Search Performance', () => {
    it('P50: Patient search under threshold', async () => {
      const { duration } = await benchmark('Patient Search (P50)', () =>
        request(app.getHttpServer())
          .get('/api/v1/patients/search?q=PerfPat')
          .set('Authorization', `Bearer ${token}`)
      );
      expect(duration).toBeLessThan(LATENCY_THRESHOLD_MS);
    });

    it('P95: Multiple patient searches', async () => {
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await request(app.getHttpServer())
          .get(`/api/v1/patients/search?q=PerfPat${i}`)
          .set('Authorization', `Bearer ${token}`);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const p95 = times[Math.floor(times.length * 0.95)];
      console.log(`[PERF] Patient Search P95: ${p95.toFixed(2)}ms`);
      expect(p95).toBeLessThan(LATENCY_THRESHOLD_MS * 2);
    });

    it('P99: Individual patient fetch', async () => {
      const patient = await prisma.patient.findFirst({ where: { organizationId: org.id } });
      const times: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await request(app.getHttpServer())
          .get(`/api/v1/patients/${patient?.id}`)
          .set('Authorization', `Bearer ${token}`);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const p99 = times[Math.floor(times.length * 0.99)];
      console.log(`[PERF] Patient Fetch P99: ${p99.toFixed(2)}ms`);
      expect(p99).toBeLessThan(LATENCY_THRESHOLD_MS);
    });
  });

  describe('Appointment Performance', () => {
    it('P50: Appointment list under threshold', async () => {
      const { duration } = await benchmark('Appointment List', () =>
        request(app.getHttpServer())
          .get('/api/v1/appointments')
          .set('Authorization', `Bearer ${token}`)
      );
      expect(duration).toBeLessThan(LATENCY_THRESHOLD_MS);
    });
  });

  describe('Dashboard Performance', () => {
    it('Doctor dashboard loads within threshold', async () => {
      const { duration } = await benchmark('Doctor Dashboard', () =>
        request(app.getHttpServer())
          .get('/api/v1/analytics/dashboard/doctor')
          .set('Authorization', `Bearer ${token}`)
      );
      expect(duration).toBeLessThan(LATENCY_THRESHOLD_MS * 2);
    });
  });

  describe('Invoice Performance', () => {
    it('Invoice list under threshold', async () => {
      const { duration } = await benchmark('Invoice List', () =>
        request(app.getHttpServer())
          .get('/api/v1/invoices')
          .set('Authorization', `Bearer ${token}`)
      );
      expect(duration).toBeLessThan(LATENCY_THRESHOLD_MS);
    });
  });

  describe('Queue Performance', () => {
    it('Live queue under threshold', async () => {
      const { duration } = await benchmark('Live Queue', () =>
        request(app.getHttpServer())
          .get('/api/v1/queues/live')
          .set('Authorization', `Bearer ${token}`)
      );
      expect(duration).toBeLessThan(LATENCY_THRESHOLD_MS);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('handles 50 concurrent requests', async () => {
      const start = performance.now();
      const results = await Promise.all(
        Array.from({ length: 50 }, () =>
          request(app.getHttpServer())
            .get('/api/v1/patients')
            .set('Authorization', `Bearer ${token}`)
        )
      );
      const duration = performance.now() - start;
      console.log(`[PERF] 50 concurrent requests: ${duration.toFixed(2)}ms total`);

      const successCount = results.filter(r => r.status < 500).length;
      expect(successCount).toBeGreaterThan(40);
      expect(duration).toBeLessThan(LATENCY_THRESHOLD_MS * 5);
    });
  });

  describe('Database Query Performance', () => {
    it('patient count query under 100ms', async () => {
      const start = performance.now();
      await prisma.patient.count({ where: { organizationId: org.id } });
      const duration = performance.now() - start;
      console.log(`[PERF] DB Patient Count: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(100);
    });

    it('complex patient include query under 200ms', async () => {
      const patient = await prisma.patient.findFirst({ where: { organizationId: org.id } });
      if (!patient) return;
      const start = performance.now();
      await prisma.patient.findUnique({
        where: { id: patient.id },
        include: {
          appointments: true,
          consultations: true,
          invoices: { include: { payments: true } },
          prescriptions: { include: { items: true } },
        },
      });
      const duration = performance.now() - start;
      console.log(`[PERF] Complex Patient Query: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(200);
    });
  });
});
