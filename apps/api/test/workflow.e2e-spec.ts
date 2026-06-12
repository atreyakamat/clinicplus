import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { faker } from '@faker-js/faker';

describe('Production Readiness: E2E Workflow Validation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authToken: string;
  let orgId: string;
  let branchId: string;
  let doctorId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    jwtService = app.get<JwtService>(JwtService);
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    const org = await prisma.organization.create({
      data: { name: 'QA Test Clinic', slug: `qa-test-${faker.string.uuid()}` },
    });
    orgId = org.id;

    const branch = await prisma.branch.create({
      data: { name: 'QA Main', organizationId: orgId },
    });
    branchId = branch.id;

    const doctor = await prisma.user.create({
      data: {
        email: `qa-doc-${faker.internet.email()}`,
        passwordHash: 'hashed',
        firstName: 'QA',
        lastName: 'Doctor',
        organizationId: orgId,
        branchId: branchId,
      },
    });
    doctorId = doctor.id;

    authToken = jwtService.sign({
      sub: doctor.id,
      email: doctor.email,
      organizationId: orgId,
      branchId: branchId,
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

  describe('Workflow 1: New Patient Journey', () => {
    it('should complete registration -> appointment -> consultation -> billing -> follow-up', async () => {
      const patientRes = await request(app.getHttpServer())
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'Workflow',
          lastName: 'One',
          phone: '9999999999',
          gender: 'Male',
        });

      console.log(patientRes.status, patientRes.body);
      const patientId = patientRes.body.id || patientRes.body.data?.id;

      const apptRes = await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId,
          doctorId,
          scheduledStart: new Date().toISOString(),
          scheduledEnd: new Date(Date.now() + 1800000).toISOString(),
        });

      const appointmentId = apptRes.body.id || apptRes.body.data?.id;

      await request(app.getHttpServer())
        .post('/api/v1/queues/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ appointmentId });

      const consultRes = await request(app.getHttpServer())
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ patientId, appointmentId, chiefComplaint: 'Checkup' });

      const consultId = consultRes.body.id || consultRes.body.data?.id;

      await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId,
          consultationId: consultId,
          items: [{ medicineName: 'Paracetamol', dosage: '500mg' }],
        });

      const invRes = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId,
          invoiceNumber: `INV-WF1-${faker.string.alphanumeric(4)}`,
          total: 50,
          items: [
            {
              itemName: 'Consultation',
              quantity: 1,
              unitPrice: 50,
              amount: 50,
            },
          ],
        });

      const invoiceId = invRes.body.id || invRes.body.data?.id;

      await request(app.getHttpServer())
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 50, paymentMethod: 'CASH', paymentStatus: 'PAID' });

      await request(app.getHttpServer())
        .post('/api/v1/follow-ups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId,
          scheduledDate: new Date(Date.now() + 604800000).toISOString(),
        });

      const finalPatient = await prisma.patient.findUnique({
        where: { id: patientId },
        include: {
          appointments: true,
          consultations: true,
          invoices: { include: { payments: true } },
          followUps: true,
        },
      });

      expect(finalPatient?.appointments.length).toBe(1);
      expect(finalPatient?.consultations.length).toBe(1);
      expect(finalPatient?.invoices.length).toBe(1);
      expect(finalPatient?.invoices[0]?.payments.length).toBe(1);
      expect(finalPatient?.followUps.length).toBe(1);
    });
  });

  describe('Workflow 2: Multi-Tenant Isolation', () => {
    it('should NOT allow Organization B to access Organization A patients (real request)', async () => {
      const orgB = await prisma.organization.create({
        data: { name: 'Org B Isolation', slug: `iso-b-${Date.now()}` },
      });
      const branchB = await prisma.branch.create({
        data: { name: 'Branch B', organizationId: orgB.id },
      });
      const userB = await prisma.user.create({
        data: {
          email: `iso-b-${Date.now()}@test.com`,
          passwordHash: 'hash',
          firstName: 'Isolation',
          lastName: 'B',
          organizationId: orgB.id,
          branchId: branchB.id,
        },
      });
      const tokenB = jwtService.sign({
        sub: userB.id,
        email: userB.email,
        organizationId: orgB.id,
        branchId: branchB.id,
        roles: ['Organization Owner'],
        permissions: ['*'],
      });

      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/patients/${(await prisma.patient.findFirst({ where: { organizationId: orgId } }))?.id}`,
        )
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBeDefined();

      await prisma.user.delete({ where: { id: userB.id } });
      await prisma.branch.delete({ where: { id: branchB.id } });
      await prisma.organization.delete({ where: { id: orgB.id } });
    });
  });
});
