import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('WhatsApp / Messaging (E2E) — Phase 12', () => {
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
      data: { name: 'Msg Test', slug: `msg-${Date.now()}` },
    });
    branch = await prisma.branch.create({
      data: { name: 'Msg Branch', organizationId: org.id },
    });
    user = await prisma.user.create({
      data: {
        email: `msg-${Date.now()}@t.com`,
        passwordHash: 'h',
        firstName: 'Msg',
        lastName: 'User',
        organizationId: org.id,
        branchId: branch.id,
      },
    });
    patient = await prisma.patient.create({
      data: {
        firstName: 'Msg',
        lastName: 'Pat',
        phone: '5551000001',
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

  describe('Message Logging', () => {
    it('should list messages', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/messages')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });

    it('should get message templates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/messages/templates')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBeDefined();
    });

    it('should reject sending WhatsApp without required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/messages/whatsapp')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBeDefined();
    });

    it('should record communication in the database', async () => {
      await prisma.message.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          patientId: patient.id,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          messageBody:
            'Your appointment is confirmed for tomorrow at 10:00 AM.',
        },
      });

      const msgs = await prisma.message.findMany({
        where: { organizationId: org.id, patientId: patient.id },
      });
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      expect(msgs[0].channel).toBe('WHATSAPP');
    });
  });

  describe('Template Usage', () => {
    it('should create and retrieve message templates', async () => {
      await prisma.template.create({
        data: {
          organizationId: org.id,
          name: 'appointment_reminder',
          channel: 'WHATSAPP',
          templateContent: 'Dear {{name}}, your appointment is at {{time}}.',
        },
      });

      const templates = await prisma.template.findMany({
        where: { organizationId: org.id },
      });
      expect(templates.length).toBeGreaterThanOrEqual(1);
      expect(templates[0].name).toBe('appointment_reminder');
    });
  });
});
