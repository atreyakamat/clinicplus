/**
 * Full patient journey through the real API, each step performed by the role
 * that does it in a clinic:
 *   Receptionist: register → book → check in → invoice → collect payment
 *   Nurse:        vitals
 *   Doctor:       consultation → diagnosis → complete → prescription → follow-up
 *   Accountant:   partial refund
 * Then the timeline must show the journey.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createTenant, createTestApp, futureSlot, Tenant, uniq } from './helpers/app';

describe('Patient journey workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  const http = () => request(app.getHttpServer());

  // Shared journey state (steps run in order).
  const s: Record<string, any> = {};

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'Journey');
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. receptionist registers the patient', async () => {
    const res = await http()
      .post('/api/v1/patients')
      .set(auth(A.receptionist))
      .send({ firstName: 'Workflow', lastName: uniq('Journey'), gender: 'MALE', phone: `98${Math.floor(10000000 + Math.random() * 89999999)}` });
    expect(res.status).toBe(201);
    expect(res.body.data.organizationId).toBe(A.org.id);
    expect(res.body.data.branchId).toBe(A.branch.id);
    s.patient = res.body.data;
  });

  it('2. receptionist books an appointment with the doctor', async () => {
    const res = await http()
      .post('/api/v1/appointments')
      .set(auth(A.receptionist))
      .send({ patientId: s.patient.id, doctorId: A.doctor.id, ...futureSlot(1, 10, 30) });
    expect(res.status).toBe(201);
    expect(res.body.data.doctorId).toBe(A.doctor.id);
    expect(['SCHEDULED', 'CONFIRMED']).toContain(res.body.data.status);
    s.appointment = res.body.data;
  });

  it('3. receptionist checks the patient in (queue token issued)', async () => {
    const res = await http().post('/api/v1/queues/check-in').set(auth(A.receptionist)).send({ appointmentId: s.appointment.id });
    expect(res.status).toBe(201);
    expect(res.body.data.tokenNumber).toBeGreaterThan(0);
    const appt = await http().get(`/api/v1/appointments/${s.appointment.id}`).set(auth(A.receptionist));
    expect(appt.body.data.status).toBe('CHECKED_IN');
    const live = await http().get('/api/v1/queues/live').set(auth(A.doctor));
    expect(live.status).toBe(200);
    expect(live.body.data.entries.map((e: any) => e.id)).toContain(res.body.data.id);
  });

  it('4. doctor starts the consultation for the appointment', async () => {
    const res = await http()
      .post('/api/v1/consultations')
      .set(auth(A.doctor))
      .send({ patientId: s.patient.id, appointmentId: s.appointment.id, chiefComplaint: 'Fever and sore throat' });
    expect(res.status).toBe(201);
    expect(res.body.data.doctorId).toBe(A.doctor.id);
    expect(res.body.data.appointmentId).toBe(s.appointment.id);
    s.consultation = res.body.data;
  });

  it('5. nurse records vitals', async () => {
    const res = await http()
      .post('/api/v1/vitals')
      .set(auth(A.nurse))
      .send({ consultationId: s.consultation.id, temperature: 38.4, pulse: 96, bloodPressureSystolic: 122, bloodPressureDiastolic: 80, spo2: 97 });
    expect(res.status).toBe(201);
  });

  it('6. doctor adds a diagnosis and issues a prescription', async () => {
    const dx = await http()
      .post('/api/v1/diagnoses')
      .set(auth(A.doctor))
      .send({ consultationId: s.consultation.id, diagnosisName: 'Acute pharyngitis', icdCode: 'J02.9' });
    expect(dx.status).toBe(201);

    const res = await http()
      .post('/api/v1/prescriptions')
      .set(auth(A.doctor))
      .send({
        patientId: s.patient.id,
        consultationId: s.consultation.id,
        items: [{ medicineName: 'Paracetamol 500mg', dosage: '1 tab', frequency: 'TDS', duration: '5 days' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.items).toHaveLength(1);
    s.prescription = res.body.data;
  });

  it('7. doctor completes the consultation → appointment COMPLETED', async () => {
    const done = await http().post(`/api/v1/consultations/${s.consultation.id}/complete`).set(auth(A.doctor));
    expect(done.status).toBe(201);
    expect(done.body.data.status).toBe('COMPLETED');

    const appt = await http().get(`/api/v1/appointments/${s.appointment.id}`).set(auth(A.receptionist));
    expect(appt.body.data.status).toBe('COMPLETED');

    // The record is now locked: no further prescriptions against it.
    const late = await http()
      .post('/api/v1/prescriptions')
      .set(auth(A.doctor))
      .send({ patientId: s.patient.id, consultationId: s.consultation.id, items: [{ medicineName: 'Late drug' }] });
    expect(late.status).toBe(409);
  });

  it('8. receptionist raises an invoice and collects full payment → invoice PAID', async () => {
    const inv = await http()
      .post('/api/v1/invoices')
      .set(auth(A.receptionist))
      .send({ patientId: s.patient.id, appointmentId: s.appointment.id, items: [{ itemName: 'Consultation', quantity: 1, unitPrice: 500 }], issue: true });
    expect(inv.status).toBe(201);
    expect(Number(inv.body.data.total)).toBe(500);
    s.invoice = inv.body.data;

    const pay = await http()
      .post(`/api/v1/invoices/${s.invoice.id}/payments`)
      .set(auth(A.receptionist))
      .send({ amount: 500, paymentMethod: 'CASH' });
    expect(pay.status).toBe(201);
    s.payment = pay.body.data;

    const after = await http().get(`/api/v1/invoices/${s.invoice.id}`).set(auth(A.accountant));
    expect(after.body.data.status).toBe('PAID');
    expect(Number(after.body.data.balance)).toBe(0);
  });

  it('9. accountant can refund part of the payment (receptionist cannot)', async () => {
    expect(
      (await http().post(`/api/v1/payments/${s.payment.id}/refund`).set(auth(A.receptionist)).send({ amount: 50, reason: 'Discount' })).status,
    ).toBe(403);
    const r = await http().post(`/api/v1/payments/${s.payment.id}/refund`).set(auth(A.accountant)).send({ amount: 50, reason: 'Discount' });
    expect(r.status).toBe(201);
  });

  it('10. doctor schedules a follow-up and records an outcome', async () => {
    const scheduledDate = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const fu = await http()
      .post('/api/v1/follow-ups')
      .set(auth(A.doctor))
      .send({ patientId: s.patient.id, consultationId: s.consultation.id, scheduledDate, reason: 'Review recovery' });
    expect(fu.status).toBe(201);
    expect(fu.body.data.status).toBe('PENDING');
    expect(fu.body.data.doctorId).toBe(A.doctor.id);
    s.followUp = fu.body.data;

    const outcome = await http()
      .post(`/api/v1/follow-ups/${s.followUp.id}/outcomes`)
      .set(auth(A.doctor))
      .send({ outcomeType: 'IMPROVING', remarks: 'Recovered fully', complete: true });
    expect(outcome.status).toBe(201);
    const after = await http().get(`/api/v1/follow-ups/${s.followUp.id}`).set(auth(A.doctor));
    expect(after.body.data.outcomes).toHaveLength(1);
  });

  it('11. the timeline shows the journey', async () => {
    const res = await http().get(`/api/v1/timeline?patientId=${s.patient.id}&limit=200`).set(auth(A.owner));
    expect(res.status).toBe(200);
    const types: string[] = res.body.data.map((e: any) => e.eventType);
    for (const t of [
      'PATIENT_REGISTERED',
      'APPOINTMENT_BOOKED',
      'CONSULTATION_STARTED',
      'VITALS_RECORDED',
      'DIAGNOSIS_ADDED',
      'CONSULTATION_COMPLETED',
      'PRESCRIPTION_ISSUED',
      'PAYMENT_COLLECTED',
      'PAYMENT_REFUNDED',
      'FOLLOW_UP_CREATED',
    ]) {
      expect(types).toContain(t);
    }
  });

  it('12. the persisted graph is consistent and tenant-scoped', async () => {
    const p = await prisma.patient.findUnique({
      where: { id: s.patient.id },
      include: {
        appointments: true,
        consultations: { include: { prescriptions: true } },
        invoices: { include: { payments: true } },
        followUps: { include: { outcomes: true } },
      },
    });
    expect(p!.appointments).toHaveLength(1);
    expect(p!.consultations).toHaveLength(1);
    expect(p!.consultations[0].prescriptions).toHaveLength(1);
    expect(p!.invoices).toHaveLength(1);
    expect(p!.invoices[0].payments.length).toBeGreaterThanOrEqual(1);
    expect(p!.followUps).toHaveLength(1);
    expect(p!.followUps[0].outcomes).toHaveLength(1);
    for (const row of [p!.appointments[0], p!.consultations[0], p!.invoices[0], p!.followUps[0]]) {
      expect((row as any).organizationId).toBe(A.org.id);
    }
  });
});
