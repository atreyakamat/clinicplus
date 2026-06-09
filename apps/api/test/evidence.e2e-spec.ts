import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Evidence-Based Verification: Multi-Tenant & RBAC (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Tenant A data
  let orgA: any;
  let doctorA: any;
  let tokenA: string;
  let patientA: any;

  // Tenant B data
  let orgB: any;
  let doctorB: any;
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

    // 1. Setup Organization A
    orgA = await prisma.organization.create({
      data: {
        name: 'Tenant A Hospital',
        slug: `org-a-${Math.random().toString(36).substring(7)}`,
      },
    });
    const branchA = await prisma.branch.create({
      data: { name: 'Branch A', organizationId: orgA.id },
    });
    doctorA = await prisma.user.create({
      data: {
        email: `doc-a-${Math.random().toString(36).substring(7)}@test.com`,
        firstName: 'Doctor',
        lastName: 'A',
        organizationId: orgA.id,
        branchId: branchA.id,
      },
    });

    tokenA = jwtService.sign({
      sub: doctorA.id,
      email: doctorA.email,
      organizationId: orgA.id,
      branchId: branchA.id,
      roles: ['Organization Owner'],
      permissions: [],
    });

    // 2. Setup Organization B
    orgB = await prisma.organization.create({
      data: {
        name: 'Tenant B Clinic',
        slug: `org-b-${Math.random().toString(36).substring(7)}`,
      },
    });
    const branchB = await prisma.branch.create({
      data: { name: 'Branch B', organizationId: orgB.id },
    });
    doctorB = await prisma.user.create({
      data: {
        email: `doc-b-${Math.random().toString(36).substring(7)}@test.com`,
        firstName: 'Doctor',
        lastName: 'B',
        organizationId: orgB.id,
        branchId: branchB.id,
      },
    });
    tokenB = jwtService.sign({
      sub: doctorB.id,
      email: doctorB.email,
      organizationId: orgB.id,
      branchId: branchB.id,
      roles: ['Organization Owner'],
      permissions: [],
    });

    // 3. Create a patient in Org A
    patientA = await prisma.patient.create({
      data: {
        firstName: 'OrgA',
        lastName: 'Patient',
        organizationId: orgA.id,
        branchId: branchA.id,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    if (orgA?.id && orgB?.id) {
      const orgIds = [orgA.id, orgB.id];
      await prisma.timelineEvent.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.patient.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.userRole.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.user.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.branch.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await app.close();
  });

  describe('Multi-Tenant Isolation Verification', () => {
    it('PROVE: Tenant B cannot access Tenant A patient record', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(404);
    });

    it('PROVE: Tenant A can access its own patient record', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      // Accessing response.body.id if using old format, or response.body.data.id if using TransformInterceptor
      const patientId = response.body.data
        ? response.body.data.id
        : response.body.id;
      expect(patientId).toBe(patientA.id);
    });
  });

  describe('Audit Log Evidence Verification', () => {
    it('PROVE: Patient update generates audit log with state capture', async () => {
      const updateData = { lastName: 'UpdatedName' };

      await request(app.getHttpServer())
        .patch(`/api/v1/patients/${patientA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(updateData)
        .expect(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: { entityId: patientA.id, action: 'PATCH' },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.organizationId).toBe(orgA.id);
      expect(auditLog?.actorId).toBe(doctorA.id);
      expect(JSON.stringify(auditLog?.afterData)).toContain('UpdatedName');
    });
  });
});
