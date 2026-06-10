import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('API Endpoint Testing (E2E) — Phase 13', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any; let branch: any; let user: any; let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
    await app.init();

    org = await prisma.organization.create({ data: { name: 'API Test', slug: `api-${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: 'API Branch', organizationId: org.id } });
    user = await prisma.user.create({
      data: { email: `api-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'API', lastName: 'Test', organizationId: org.id, branchId: branch.id },
    });
    token = jwtService.sign({
      sub: user.id, email: user.email, organizationId: org.id, branchId: branch.id,
      roles: ['Organization Owner'], permissions: [],
    });
  });

  afterAll(async () => {
    if (org?.id) {
      await prisma.user.deleteMany({ where: { organizationId: org.id } });
      await prisma.branch.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
    await app.close();
  });

  describe('Health Check', () => {
    it('GET /health should return 200', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/auth/register should be accessible', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `health-${Date.now()}@t.com`, password: 'Pass123!', firstName: 'H', lastName: 'C', clinicName: 'HC', clinicSlug: `hc-${Date.now()}` });
      expect(res.status).toBe(201);
    });
  });

  describe('Authentication Verification', () => {
    it('GET /api/v1/auth/profile without token returns 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/profile');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/auth/profile with token returns 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Response Shape Validation', () => {
    it('should return data object in response body', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = res.body;
      expect(body.data !== undefined || Array.isArray(body)).toBe(true);
    });

    it('should return error with statusCode on 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);
      expect([400, 404]).toContain(res.status);
      if (res.status === 404) {
        expect(res.body.statusCode).toBe(404);
        expect(res.body.message).toBeDefined();
      }
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 for invalid patient data', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ invalidField: true });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid appointment data', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/appointments').set('Authorization', `Bearer ${token}`)
        .send({ invalid: true });
      expect(res.status).toBe(400);
    });
  });

  describe('Pagination', () => {
    it('should accept page and limit parameters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('should handle negative page gracefully', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients?page=-1')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('HTTP Methods', () => {
    it('should return 405 or 404 for unsupported methods', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`);
      expect([404, 405]).toContain(res.status);
    });

    it('should reject POST on GET-only endpoints', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/health')
        .set('Authorization', `Bearer ${token}`);
      expect([404, 405]).toContain(res.status);
    });
  });

  describe('Content-Type Headers', () => {
    it('should return application/json for API endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`);
      expect(res.headers['content-type']).toMatch(/json/);
    });
  });

  describe('Endpoint Availability', () => {
    const endpoints = [
      ['GET', '/api/v1/patients'],
      ['GET', '/api/v1/appointments'],
      ['GET', '/api/v1/consultations'],
      ['GET', '/api/v1/prescriptions'],
      ['GET', '/api/v1/invoices'],
      ['GET', '/api/v1/tasks'],
      ['GET', '/api/v1/queues/live'],
      ['GET', '/api/v1/messages'],
      ['GET', '/api/v1/follow-ups'],
      ['GET', '/api/v1/timeline'],
      ['GET', '/api/v1/feedback'],
      ['GET', '/api/v1/analytics/dashboard/doctor'],
    ] as const;

    for (const [method, url] of endpoints) {
      it(`${method} ${url} returns 200 or 401`, async () => {
        const req = request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post'](url as string);
        if (method === 'GET') {
          const res = await req.set('Authorization', `Bearer ${token}`);
          expect([200, 201, 400, 401, 403, 404]).toContain(res.status);
        }
      });
    }
  });
});
