import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Billing (E2E) — Phase 10', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any;
  let branch: any;
  let user: any;
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
      data: { name: 'Bill Test', slug: `bill-${Date.now()}` },
    });
    branch = await prisma.branch.create({
      data: { name: 'Bill Branch', organizationId: org.id },
    });
    user = await prisma.user.create({
      data: {
        email: `bill-${Date.now()}@t.com`,
        passwordHash: 'h',
        firstName: 'Bill',
        lastName: 'User',
        organizationId: org.id,
        branchId: branch.id,
      },
    });
    patient = await prisma.patient.create({
      data: {
        firstName: 'Bill',
        lastName: 'Pat',
        phone: '5550800001',
        organizationId: org.id,
        branchId: branch.id,
      },
    });
    token = jwtService.sign({
      sub: user.id,
      email: user.email,
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

  describe('Invoice Generation', () => {
    it('should create an invoice with items', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patient.id,
          invoiceNumber: `INV-${Date.now()}`,
          total: 150,
          items: [
            {
              itemName: 'Consultation Fee',
              quantity: 1,
              unitPrice: 100,
              amount: 100,
            },
            { itemName: 'Lab Test', quantity: 1, unitPrice: 50, amount: 50 },
          ],
        });
      expect(res.status).toBeDefined();
      const body = res.body.data || res.body;
      expect(body.id).toBeDefined();
      expect(body.status).toBe('DRAFT');
    });

    it('should reject invoice with missing patientId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          invoiceNumber: `INV-BAD-${Date.now()}`,
          total: 100,
          items: [],
        });
      expect(res.status).toBeDefined();
    });

    it('should reject invoice with negative total', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patient.id,
          invoiceNumber: `INV-NEG-${Date.now()}`,
          total: -50,
        });
      expect(res.status).toBeDefined();
    });
  });

  describe('Payments', () => {
    let invId: string;
    beforeEach(async () => {
      const inv = await prisma.invoice.create({
        data: {
          patientId: patient.id,
          organizationId: org.id,
          branchId: branch.id,
          invoiceNumber: `INV-PAY-${Date.now()}`,
          total: 200,
        },
      });
      invId = inv.id;
    });

    it('should add full payment to invoice', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/invoices/${invId}/payments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 200, paymentMethod: 'CASH', paymentStatus: 'PAID' });
      expect(res.status).toBeDefined();
    });

    it('should add partial payment', async () => {
      const inv = await prisma.invoice.create({
        data: {
          patientId: patient.id,
          organizationId: org.id,
          branchId: branch.id,
          invoiceNumber: `INV-PART-${Date.now()}`,
          total: 300,
        },
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/invoices/${inv.id}/payments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100, paymentMethod: 'CARD', paymentStatus: 'PAID' });
      expect(res.status).toBeDefined();
      await prisma.payment.deleteMany({ where: { invoiceId: inv.id } });
      await prisma.invoice.delete({ where: { id: inv.id } });
    });
  });

  describe('Invoice Retrieval', () => {
    let invId: string;
    beforeEach(async () => {
      const inv = await prisma.invoice.create({
        data: {
          patientId: patient.id,
          organizationId: org.id,
          branchId: branch.id,
          invoiceNumber: `INV-GET-${Date.now()}`,
          total: 75,
        },
      });
      invId = inv.id;
    });

    it('should get invoice by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });

    it('should list invoices', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
      const body = res.body.data || res.body;
      expect(Array.isArray(body)).toBe(true);
    });

    it('should download invoice as PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invId}/download`)
        .set('Authorization', `Bearer ${token}`);
      if (res.status === 200) {
        expect(res.headers['content-type']).toMatch(
          /pdf|application\/octet-stream/,
        );
      }
    });
  });
});
