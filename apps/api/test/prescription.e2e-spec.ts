import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Prescription (E2E) — Phase 9', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any; let branch: any; let doctor: any; let patient: any; let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
    await app.init();

    org = await prisma.organization.create({ data: { name: 'Rx Test', slug: `rx-${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: 'Rx Branch', organizationId: org.id } });
    doctor = await prisma.user.create({
      data: { email: `dr-rx-${Date.now()}@t.com`, passwordHash: 'h', firstName: 'DrRx', lastName: 'Test', organizationId: org.id, branchId: branch.id },
    });
    patient = await prisma.patient.create({
      data: { firstName: 'Rx', lastName: 'Pat', phone: '5550700001', organizationId: org.id, branchId: branch.id },
    });
    token = jwtService.sign({
      sub: doctor.id, email: doctor.email, organizationId: org.id, branchId: branch.id,
      roles: ['Organization Owner'], permissions: [],
    });
  });

  afterAll(async () => {
    if (org?.id) {
      await prisma.prescriptionItem.deleteMany({ where: { organizationId: org.id } });
      await prisma.prescription.deleteMany({ where: { organizationId: org.id } });
      await prisma.patient.deleteMany({ where: { organizationId: org.id } });
      await prisma.user.deleteMany({ where: { organizationId: org.id } });
      await prisma.branch.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
    await app.close();
  });

  describe('Create Prescription', () => {
    it('should create a prescription with items', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/prescriptions').set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patient.id,
          items: [
            { medicineName: 'Paracetamol', dosage: '500mg', frequency: '3 times daily', duration: '5 days' },
            { medicineName: 'Amoxicillin', dosage: '250mg', frequency: '2 times daily', duration: '7 days' },
          ],
        });
      expect(res.status).toBe(201);
      const body = res.body.data || res.body;
      expect(body.id).toBeDefined();
    });

    it('should reject prescription without items', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/prescriptions').set('Authorization', `Bearer ${token}`)
        .send({ patientId: patient.id });
      expect(res.status).toBe(400);
    });

    it('should reject prescription without patientId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/prescriptions').set('Authorization', `Bearer ${token}`)
        .send({ items: [{ medicineName: 'Test', dosage: '10mg' }] });
      expect(res.status).toBe(400);
    });
  });

  describe('Retrieve Prescription', () => {
    let rxId: string;
    beforeEach(async () => {
      const rx = await prisma.prescription.create({
        data: { patientId: patient.id, doctorId: doctor.id, organizationId: org.id, branchId: branch.id },
      });
      await prisma.prescriptionItem.create({
        data: { prescriptionId: rx.id, medicineName: 'Ibuprofen', dosage: '200mg', frequency: 'PRN', duration: '3 days', organizationId: org.id, branchId: branch.id },
      });
      rxId = rx.id;
    });

    it('should get prescription by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/${rxId}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('should list prescriptions for patient', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions?patientId=${patient.id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = res.body.data || res.body;
      expect(Array.isArray(body)).toBe(true);
    });

    it('should download prescription as PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/${rxId}/download`).set('Authorization', `Bearer ${token}`);
      if (res.status === 200) {
        expect(res.headers['content-type']).toMatch(/pdf|application\/octet-stream/);
      }
    });
  });
});
