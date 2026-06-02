import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { faker } from '@faker-js/faker';

describe('Workflow: New Patient Journey (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let orgId: string;
  let branchId: string;
  let doctorId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Setup: Create Org, Branch, Doctor
    const org = await prisma.organization.create({
      data: { name: 'E2E Test Clinic', slug: `e2e-clinic-${faker.string.uuid()}` }
    });
    orgId = org.id;

    const branch = await prisma.branch.create({
      data: { name: 'E2E Main', organizationId: orgId }
    });
    branchId = branch.id;

    const doctor = await prisma.user.create({
      data: {
        email: `e2e-doc-${faker.internet.email()}`,
        passwordHash: 'hashed',
        firstName: 'E2E',
        lastName: 'Doctor',
        organizationId: orgId,
        branchId: branchId
      }
    });
    doctorId = doctor.id;

    // Get Token (Simplified for E2E)
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: doctor.email, password: 'password123' }); // Assuming default seed pass or mock
    
    // In real E2E, we might use a mock guard or a real login if seed is active
    // For this demonstration, we'll bypass real auth check or use a known token if possible.
    // Let's assume we can generate a token manually via AuthService if needed.
  });

  afterAll(async () => {
    // Cleanup
    await prisma.patient.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.branch.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('should complete a full patient journey: Register -> Appt -> CheckIn -> Consult -> Billing', async () => {
    // 1. Patient Registration
    const patientData = {
      firstName: 'E2E',
      lastName: 'Patient',
      email: faker.internet.email(),
      phone: '1234567890',
      gender: 'Male'
    };

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(patientData)
      .expect(201);
    
    const patientId = regRes.body.id;
    expect(patientId).toBeDefined();

    // 2. Appointment Booking
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 60000);
    const apptRes = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        patientId,
        doctorId,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      })
      .expect(201);
    
    const appointmentId = apptRes.body.id;

    // 3. Patient Check-In (Queue Assignment)
    const checkInRes = await request(app.getHttpServer())
      .post('/api/v1/queues/check-in')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ appointmentId })
      .expect(201);
    
    const queueEntryId = checkInRes.body.id;
    expect(checkInRes.body.tokenNumber).toBeDefined();

    // 4. Start Consultation
    const consultationRes = await request(app.getHttpServer())
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ patientId, appointmentId })
      .expect(201);
    
    const consultationId = consultationRes.body.id;

    // 5. Complete Consultation (Update Notes & Vitals)
    await request(app.getHttpServer())
      .patch(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        chiefComplaint: 'E2E Test Fever',
        clinicalAssessment: 'Normal',
        vitals: { weight: 70, height: 175 }
      })
      .expect(200);

    // 6. Generate Prescription
    const rxRes = await request(app.getHttpServer())
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        patientId,
        consultationId,
        items: [{ medicineName: 'Test Med', dosage: '1-0-1', duration: '3 days' }]
      })
      .expect(201);

    // 7. Invoice & Payment
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        patientId,
        invoiceNumber: `E2E-${faker.string.alphanumeric(5)}`,
        total: 100,
        items: [{ itemName: 'Consultation', quantity: 1, unitPrice: 100, amount: 100 }]
      })
      .expect(201);
    
    const invoiceId = invRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 100, paymentMethod: 'CASH', paymentStatus: 'PAID' })
      .expect(201);

    // 8. Follow-up
    await request(app.getHttpServer())
      .post('/api/v1/follow-ups')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        patientId,
        consultationId,
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Check back in 24h'
      })
      .expect(201);

    // Final verification of DB state
    const dbPatient = await prisma.patient.findUnique({ where: { id: patientId }, include: { appointments: true, consultations: true, invoices: true } });
    expect(dbPatient?.appointments.length).toBe(1);
    expect(dbPatient?.consultations.length).toBe(1);
    expect(dbPatient?.invoices.length).toBe(1);
  });
});
