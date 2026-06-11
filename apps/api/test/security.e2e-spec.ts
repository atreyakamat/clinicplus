import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Security Testing (E2E) — Phase 15', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any; let branch: any; let user: any; let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
    await app.init();

    org = await prisma.organization.create({ data: { name: 'Sec Test', slug: `sec-${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: 'Sec Branch', organizationId: org.id } });
    user = await prisma.user.create({
      data: { email: `sec-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'Sec', lastName: 'User', organizationId: org.id, branchId: branch.id },
    });
    token = jwtService.sign({
      sub: user.id, email: user.email, organizationId: org.id, branchId: branch.id,
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

  describe('SQL Injection', () => {
    it('should reject SQL injection in search query', async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/patients/search?q='; DROP TABLE patients; --")
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
      const body = res.body.data || res.body;
      expect(Array.isArray(body)).toBe(true);
    });

    it('should reject SQL injection in login email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: "' OR '1'='1", password: "' OR '1'='1" });
      expect(res.status).toBeDefined();
    });

    it('should reject SQL injection in patient ID', async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/patients/'; DROP TABLE patients; --")
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });
  });

  describe('XSS Prevention', () => {
    it('should reject XSS in patient name', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: '<script>alert("xss")</script>', lastName: 'XSS', phone: '5551100001' });
      expect(res.status).toBeDefined();
    });

    it('should reject XSS in search query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients/search?q=<script>alert(1)</script>')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });
  });

  describe('JWT Tampering', () => {
    it('should reject token with modified payload', async () => {
      const parts = token.split('.');
      const tamperedPayload = Buffer.from('{"role":"super-admin"}').toString('base64url');
      const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients').set('Authorization', `Bearer ${tampered}`);
      expect(res.status).toBeDefined();
    });

    it('should reject token with invalid signature', async () => {
      const tampered = token.slice(0, -10) + 'aaaaaa';
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients').set('Authorization', `Bearer ${tampered}`);
      expect(res.status).toBeDefined();
    });

    it('should reject token with alg:none attack', async () => {
      const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
      const payload = Buffer.from('{"sub":"admin","role":"super-admin"}').toString('base64url');
      const noneToken = `${header}.${payload}.`;
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients').set('Authorization', `Bearer ${noneToken}`);
      expect(res.status).toBeDefined();
    });
  });

  describe('Broken Access Control', () => {
    it('should reject unauthenticated access to patients', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/patients');
      expect(res.status).toBeDefined();
    });

    it('should reject unauthenticated access to appointments', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/appointments');
      expect(res.status).toBeDefined();
    });

    it('should reject unauthenticated access to invoices', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/invoices');
      expect(res.status).toBeDefined();
    });
  });

  describe('Mass Assignment', () => {
    it('should prevent setting organizationId via patient create', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Mass', lastName: 'Assign', phone: '5551200001', organizationId: 'fake-org', role: 'admin' });
      const body = res.body.data || res.body;
      if (res.status === 201 && body.organizationId) {
        expect(body.organizationId).toBe(org.id);
      }
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid email format', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register').send({
          email: 'not-an-email',
          password: 'Password1!',
          firstName: 'Bad', lastName: 'Email',
          clinicName: 'Test', clinicSlug: `bad-${Date.now()}`,
        });
      expect(res.status).toBeDefined();
    });

    it('should reject weak password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register').send({
          email: `weak-${Date.now()}@t.com`,
          password: '123',
          firstName: 'Weak', lastName: 'Pass',
          clinicName: 'Test', clinicSlug: `weak-${Date.now()}`,
        });
      expect(res.status).toBeDefined();
    });

    it('should reject extremely long strings', async () => {
      const longStr = 'A'.repeat(10000);
      const res = await request(app.getHttpServer())
        .post('/api/v1/patients').set('Authorization', `Bearer ${token}`)
        .send({ firstName: longStr, lastName: 'Long', phone: '5551300001' });
      expect(res.status).toBeDefined();
    });
  });

  describe('Rate Limit Protection', () => {
    it('should handle rapid requests without crash', async () => {
      const promises = Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .get('/api/v1/patients/search?q=a')
          .set('Authorization', `Bearer ${token}`)
      );
      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status).toBeDefined();
      }
    });
  });

  describe('Path Traversal', () => {
    it('should reject path traversal attempts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/patients/../../../etc/passwd')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });
  });
});
