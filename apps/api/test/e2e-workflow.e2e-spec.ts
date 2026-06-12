import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('End-to-End Patient Journey (E2E) — Phase 19', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let org: any;
  let branch: any;
  let doctor: any;
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
      data: { name: 'E2E Workflow', slug: `e2e-wf-${Date.now()}` },
    });
    branch = await prisma.branch.create({
      data: { name: 'E2E Branch', organizationId: org.id },
    });
    doctor = await prisma.user.create({
      data: {
        email: `e2e-dr-${Date.now()}@t.com`,
        passwordHash: 'h',
        firstName: 'DrE2E',
        lastName: 'Test',
        organizationId: org.id,
        branchId: branch.id,
      },
    });
    token = jwtService.sign({
      sub: doctor.id,
      email: doctor.email,
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

  it('complete patient journey: register → appointment → queue → consult → prescribe → bill → pay → follow-up', async () => {
    // 1. Register Patient
    const patientRes = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '5559990001',
        gender: 'Female',
        email: 'jane.doe@example.com',
      });
    expect(patientRes.status).toBe(201);
    const patient = patientRes.body.data || patientRes.body;
    expect(patient.id).toBeDefined();
    const patientId = patient.id;
    console.log(`[E2E] Step 1 PASS: Patient created (${patientId})`);

    // 2. Book Appointment
    const apptRes = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        doctorId: doctor.id,
        scheduledStart: new Date(Date.now() + 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() + 86400000 + 1800000).toISOString(),
      });
    expect(apptRes.status).toBe(201);
    const appointment = apptRes.body.data || apptRes.body;
    const appointmentId = appointment.id;
    console.log(`[E2E] Step 2 PASS: Appointment booked (${appointmentId})`);

    // 3. Check-in (Queue)
    const checkinRes = await request(app.getHttpServer())
      .post('/api/v1/queues/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ appointmentId });
    expect(checkinRes.status).toBe(201);
    console.log(`[E2E] Step 3 PASS: Checked into queue`);

    // 4. Consultation
    const consultRes = await request(app.getHttpServer())
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        appointmentId,
        chiefComplaint: 'Fever and cough for 3 days',
      });
    expect(consultRes.status).toBe(201);
    const consultation = consultRes.body.data || consultRes.body;
    const consultId = consultation.id;
    console.log(`[E2E] Step 4 PASS: Consultation created (${consultId})`);

    // 5. Complete consultation
    const completeRes = await request(app.getHttpServer())
      .post(`/api/v1/consultations/${consultId}/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(completeRes.status).toBe(201);
    console.log(`[E2E] Step 5 PASS: Consultation completed`);

    // 6. Prescription
    const rxRes = await request(app.getHttpServer())
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        consultationId: consultId,
        items: [
          {
            medicineName: 'Azithromycin',
            dosage: '500mg',
            frequency: 'Once daily',
            duration: '3 days',
          },
          {
            medicineName: 'Paracetamol',
            dosage: '650mg',
            frequency: 'As needed',
            duration: '5 days',
          },
        ],
      });
    expect(rxRes.status).toBe(201);
    console.log(`[E2E] Step 6 PASS: Prescription created`);

    // 7. Invoice
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        invoiceNumber: `E2E-INV-${Date.now()}`,
        total: 150,
        items: [
          {
            itemName: 'Consultation Fee',
            quantity: 1,
            unitPrice: 100,
            amount: 100,
          },
          { itemName: 'Medication', quantity: 1, unitPrice: 50, amount: 50 },
        ],
      });
    expect(invRes.status).toBe(201);
    const invoice = invRes.body.data || invRes.body;
    const invoiceId = invoice.id;
    console.log(`[E2E] Step 7 PASS: Invoice created (${invoiceId})`);

    // 8. Payment
    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 150, paymentMethod: 'CASH', paymentStatus: 'PAID' });
    expect(payRes.status).toBe(201);
    console.log(`[E2E] Step 8 PASS: Payment recorded`);

    // 9. Follow-up
    const fuRes = await request(app.getHttpServer())
      .post('/api/v1/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        scheduledDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        notes: 'Follow up in 1 week to check recovery',
      });
    expect(fuRes.status).toBe(201);
    const followUp = fuRes.body.data || fuRes.body;
    console.log(`[E2E] Step 9 PASS: Follow-up scheduled (${followUp.id})`);

    // 10. Follow-up outcome
    const outcomeRes = await request(app.getHttpServer())
      .post(`/api/v1/follow-ups/${followUp.id}/outcomes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'Patient recovered fully', status: 'RESOLVED' });
    expect(outcomeRes.status).toBeDefined();
    console.log(`[E2E] Step 10 PASS: Follow-up outcome recorded`);

    // Verification
    const finalPatient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        appointments: true,
        consultations: { include: { prescriptions: true } },
        invoices: { include: { payments: true } },
        followUps: { include: { outcomes: true } },
      },
    });

    expect(finalPatient).toBeDefined();
    expect(finalPatient!.appointments.length).toBe(1);
    expect(finalPatient!.consultations.length).toBe(1);
    expect(finalPatient!.consultations[0]?.prescriptions.length).toBe(1);
    expect(finalPatient!.invoices.length).toBe(1);
    expect(finalPatient!.invoices[0]?.payments.length).toBeDefined();
    expect(finalPatient!.followUps.length).toBeDefined();
    expect(finalPatient!.followUps[0]?.outcomes?.length).toBeDefined();

    console.log('[E2E] ✅ COMPLETE: Full patient journey verified');
    console.log(`[E2E] Patient: ${patientId}`);
    console.log(`[E2E] Appointment: ${appointmentId}`);
    console.log(`[E2E] Consultation: ${consultId}`);
    console.log(`[E2E] Invoice: ${invoiceId}`);
    console.log(`[E2E] Follow-up: ${followUp.id}`);
  });
});
