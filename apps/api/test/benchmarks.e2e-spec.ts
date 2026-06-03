import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { performance } from 'perf_hooks';

describe('Evidence-Based Verification: Performance & Security (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let org: any;
  let doctor: any;
  let token: string;
  let patient: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    jwtService = app.get<JwtService>(JwtService);
    prisma = app.get<PrismaService>(PrismaService);
    await app.init();

    org = await prisma.organization.create({
      data: { name: 'Performance Test Clinic', slug: `perf-${Math.random().toString(36).substring(7)}` }
    });
    const branch = await prisma.branch.create({
      data: { name: 'Perf Branch', organizationId: org.id }
    });
    doctor = await prisma.user.create({
      data: {
        email: `perf-doc-${Math.random().toString(36).substring(7)}@test.com`,
        firstName: 'Perf',
        lastName: 'Doctor',
        organizationId: org.id,
        branchId: branch.id,
      }
    });
    token = jwtService.sign({ 
        sub: doctor.id, 
        email: doctor.email, 
        organizationId: org.id, 
        branchId: branch.id,
        roles: ['Organization Owner'],
    });

    // Create one patient for individual tests
    patient = await prisma.patient.create({
        data: {
            firstName: 'Individual',
            lastName: 'Patient',
            organizationId: org.id,
            branchId: branch.id,
        }
    });

    // Seed 100 patients for search benchmark
    const patients = Array.from({ length: 100 }).map((_, i) => ({
        firstName: `BenchPatient${i}`,
        lastName: `Last${i}`,
        organizationId: org.id,
        branchId: branch.id,
    }));
    await prisma.patient.createMany({ data: patients });
  });

  afterAll(async () => {
    if (org?.id) {
        const orgIds = [org.id];
        await prisma.timelineEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.patient.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.userRole.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.branch.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await app.close();
  });

  describe('API Performance Benchmarking', () => {
    it('BENCHMARK: Patient Search < 500ms', async () => {
      const start = performance.now();
      const response = await request(app.getHttpServer())
        .get('/api/v1/patients/search?q=BenchPatient')
        .set('Authorization', `Bearer ${token}`);
      const end = performance.now();
      
      const duration = end - start;
      console.log(`[EVIDENCE] Patient Search Latency: ${duration.toFixed(2)}ms`);
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });

    it('BENCHMARK: Patient List < 500ms', async () => {
      const start = performance.now();
      const response = await request(app.getHttpServer())
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`);
      const end = performance.now();
      
      const duration = end - start;
      console.log(`[EVIDENCE] Patient List Latency: ${duration.toFixed(2)}ms`);
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('RBAC Role Enforcement Proof', () => {
     it('PROVE: Doctor role can view patients', async () => {
        const docToken = jwtService.sign({ 
            sub: doctor.id, 
            email: doctor.email, 
            organizationId: org.id, 
            branchId: doctor.branchId,
            roles: ['Doctor'],
        });

        const response = await request(app.getHttpServer())
            .get(`/api/v1/patients/${patient.id}`)
            .set('Authorization', `Bearer ${docToken}`);
        
        expect(response.status).toBe(200);
     });

     it('PROVE: Invalid token returns 401', async () => {
        const response = await request(app.getHttpServer())
            .get(`/api/v1/patients/${patient.id}`)
            .set('Authorization', `Bearer invalid-token`);
        
        expect(response.status).toBe(401);
     });
  });
});
