import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Production Hardening: Multi-Tenancy (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let orgA: any;
  let branchA: any;
  let userA: any;
  let tokenA: string;
  let patientA: any;
  let appointmentA: any;
  let invoiceA: any;

  let orgB: any;
  let branchB: any;
  let userB: any;
  let tokenB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    jwtService = app.get<JwtService>(JwtService);
    prisma = app.get<PrismaService>(PrismaService);
    await app.init();

    orgA = await prisma.organization.create({
      data: { name: 'Hardening Org A', slug: `hard-a-${Date.now()}` },
    });
    branchA = await prisma.branch.create({
      data: { name: 'Branch A1', organizationId: orgA.id },
    });
    userA = await prisma.user.create({
      data: {
        email: `hard-a-${Date.now()}@test.com`,
        passwordHash: 'hash',
        firstName: 'HardA',
        lastName: 'User',
        organizationId: orgA.id,
        branchId: branchA.id,
      },
    });
    tokenA = jwtService.sign({
      sub: userA.id,
      email: userA.email,
      organizationId: orgA.id,
      branchId: branchA.id,
      roles: ['Organization Owner'],
      permissions: [],
    });

    patientA = await prisma.patient.create({
      data: {
        firstName: 'TenantA',
        lastName: 'Patient',
        organizationId: orgA.id,
        branchId: branchA.id,
      },
    });

    appointmentA = await prisma.appointment.create({
      data: {
        patientId: patientA.id,
        doctorId: userA.id,
        organizationId: orgA.id,
        branchId: branchA.id,
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
      },
    });

    invoiceA = await prisma.invoice.create({
      data: {
        patientId: patientA.id,
        organizationId: orgA.id,
        branchId: branchA.id,
        invoiceNumber: `HARD-A-${Date.now()}`,
        total: 100,
      },
    });

    orgB = await prisma.organization.create({
      data: { name: 'Hardening Org B', slug: `hard-b-${Date.now()}` },
    });
    branchB = await prisma.branch.create({
      data: { name: 'Branch B1', organizationId: orgB.id },
    });
    userB = await prisma.user.create({
      data: {
        email: `hard-b-${Date.now()}@test.com`,
        passwordHash: 'hash',
        firstName: 'HardB',
        lastName: 'User',
        organizationId: orgB.id,
        branchId: branchB.id,
      },
    });
    tokenB = jwtService.sign({
      sub: userB.id,
      email: userB.email,
      organizationId: orgB.id,
      branchId: branchB.id,
      roles: ['Organization Owner'],
      permissions: [],
    });
  });

  afterAll(async () => {
    if (orgA?.id) {
      await prisma.invoiceItem.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.invoice.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.appointment.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.patient.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.user.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.branch.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.organization.delete({ where: { id: orgA.id } });
    }
    if (orgB?.id) {
      await prisma.user.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.branch.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.organization.delete({ where: { id: orgB.id } });
    }
    await app.close();
  });

  it('should deny Org B access to Org A patient record (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('should deny Org B access to Org A appointment (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/appointments/${appointmentA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('should deny Org B access to Org A invoice (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('should deny Org B from listing Org A patients', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${tokenB}`);
    if (res.status === 200) {
      const body = res.body.data || res.body;
      const ids = Array.isArray(body) ? body.map((p: any) => p.id) : [];
      expect(ids).not.toContain(patientA.id);
    }
  });

  it('should allow Org A access to its own patient (200)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
  });

  it('should deny Org B from updating Org A patient', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${patientA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ firstName: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it('should deny Org B from deleting Org A patient', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/patients/${patientA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('should accept requests without auth token as 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/patients');
    expect(res.status).toBe(401);
  });

  it('should reject tampered JWT tokens', async () => {
    const tamperedToken = tokenA.slice(0, -5) + 'XXXXX';
    const res = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
  });
});
