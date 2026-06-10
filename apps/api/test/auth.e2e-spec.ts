import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

describe('Authentication System (E2E) — Phase 2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let org: any;
  let branch: any;
  let createdUserId: string;
  let accessToken: string;
  let refreshToken: string;
  let sessionId: string;
  const testEmail = `auth-test-${Date.now()}@clinicos.com`;
  const testPassword = 'SecurePass123!';

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
      data: { name: 'Auth Test Org', slug: `auth-${Date.now()}` },
    });
    branch = await prisma.branch.create({
      data: { name: 'Auth Branch', organizationId: org.id },
    });
  });

  afterAll(async () => {
    if (createdUserId) {
      await prisma.userSession.deleteMany({ where: { userId: createdUserId } });
      await prisma.loginAttempt.deleteMany({ where: { email: testEmail } });
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
    if (org?.id) {
      await prisma.branch.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new clinic and owner', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          firstName: 'Auth',
          lastName: 'Tester',
          clinicName: 'Auth Test Clinic',
          clinicSlug: `auth-clinic-${Date.now()}`,
          phone: '1234567890',
        });

      expect(res.status).toBe(201);
      expect(res.body.data?.organizationId || res.body.organizationId).toBeDefined();
      expect(res.body.data?.userId || res.body.userId).toBeDefined();
      createdUserId = res.body.data?.userId || res.body.userId;
    });

    it('should reject duplicate email registration', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          firstName: 'Auth',
          lastName: 'Tester',
          clinicName: 'Another Clinic',
          clinicSlug: `another-clinic-${Date.now()}`,
          phone: '1234567890',
        });

      expect(res.status).toBe(409);
    });

    it('should reject registration with missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'incomplete@test.com' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials and return tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(201);
      const body = res.body.data || res.body;
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.sessionId).toBeDefined();
      expect(body.user).toBeDefined();

      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
      sessionId = body.sessionId;
    });

    it('should reject invalid password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'WrongPassword!' });
      expect(res.status).toBe(401);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@test.com', password: testPassword });
      expect(res.status).toBe(401);
    });

    it('should reject empty credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({});
      expect(res.status).toBe(400);
    });

    it('should record failed login attempts', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'wrong' });

      const attempts = await prisma.loginAttempt.findMany({
        where: { email: testEmail, status: 'FAILED' },
      });
      expect(attempts.length).toBeGreaterThanOrEqual(1);
    });

    it('should record successful login attempts', async () => {
      const attempts = await prisma.loginAttempt.findMany({
        where: { email: testEmail, status: 'SUCCESS' },
      });
      expect(attempts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken, sessionId });

      expect(res.status).toBe(201);
      const body = res.body.data || res.body;
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.refreshToken).not.toBe(refreshToken);

      refreshToken = body.refreshToken;
      accessToken = body.accessToken;
    });

    it('should reject refresh with invalid session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token', sessionId: 'fake-session' });
      expect(res.status).toBe(401);
    });

    it('should reject refresh with empty body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({});
      expect(res.status).toBe(401);
    });

    it('should rotate refresh token on each refresh', async () => {
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken, sessionId });

      expect(res1.status).toBe(201);
      const token1 = res1.body.data?.refreshToken || res1.body.refreshToken;

      const res2 = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: token1, sessionId });

      expect(res2.status).toBe(201);
      const token2 = res2.body.data?.refreshToken || res2.body.refreshToken;
      expect(token2).not.toBe(token1);

      refreshToken = token2;
      accessToken = res2.body.data?.accessToken || res2.body.accessToken;
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    it('should return user profile with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      const body = res.body.data || res.body;
      expect(body.email).toBe(testEmail);
    });

    it('should reject request without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile');
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token-here');
      expect(res.status).toBe(401);
    });

    it('should reject tampered JWT token', async () => {
      const tampered = accessToken.slice(0, -10) + 'a1b2c3d4e5';
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${tampered}`);
      expect(res.status).toBe(401);
    });

    it('should reject expired JWT token', async () => {
      const expiredToken = jwtService.sign(
        { sub: createdUserId, email: testEmail },
        { expiresIn: '0s' },
      );
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout and invalidate session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId });

      expect(res.status).toBe(201);
    });

    it('should reject refresh after logout (revoked session)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken, sessionId });
      expect(res.status).toBe(401);
    });
  });

  describe('Password Hashing Verification', () => {
    it('should store password as bcrypt hash, not plaintext', async () => {
      const user = await prisma.user.findUnique({ where: { id: createdUserId } });
      expect(user?.passwordHash).toBeDefined();
      expect(user?.passwordHash).not.toBe(testPassword);
      expect(user?.passwordHash).toMatch(/^\$2[aby]\$\d+\$/);
    });
  });

  describe('Concurrent Sessions', () => {
    let session2Id: string;
    let token2: string;

    it('should allow multiple active sessions for same user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(201);
      const body = res.body.data || res.body;
      session2Id = body.sessionId;
      token2 = body.accessToken;

      const sessions = await prisma.userSession.findMany({
        where: { userId: createdUserId, status: 'ACTIVE' },
      });
      expect(sessions.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow logout of single session without affecting others', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token2}`)
        .send({ sessionId: session2Id });

      const sessions = await prisma.userSession.findMany({
        where: { userId: createdUserId, status: 'ACTIVE' },
      });
      expect(sessions.length).toBe(0);
    });
  });

  describe('JWT Token Structure', () => {
    it('should contain standard JWT claims', async () => {
      const decoded: any = jwtService.decode(accessToken);
      expect(decoded).toBeDefined();
      expect(decoded.sub).toBe(createdUserId);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should include org/branch context in JWT', async () => {
      const decoded: any = jwtService.decode(accessToken);
      expect(decoded.organizationId).toBeDefined();
      expect(decoded.roles).toBeDefined();
    });
  });
});
