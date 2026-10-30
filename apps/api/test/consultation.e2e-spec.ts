import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, Tenant, TenantUser } from './helpers/app';
import { addRoleUser } from './helpers/clinical';

describe('Consultations, vitals, diagnoses, allergies & timeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let doctorB: TenantUser;
  let patient: any;
  let http: () => any;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    http = () => request(app.getHttpServer());
    A = await createTenant(app, prisma, 'ConsultA');
    B = await createTenant(app, prisma, 'ConsultB');
    doctorB = await addRoleUser(app, prisma, A, 'Doctor');
    patient = await createPatient(app, A.receptionist);
  });

  afterAll(async () => {
    await app.close();
  });

  const startConsultation = async (doctor = A.doctor, body: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/api/v1/consultations')
      .set(auth(doctor))
      .send({ patientId: patient.id, chiefComplaint: 'Fever for 3 days', ...body });
    expect(res.status).toBe(201);
    return res.body.data;
  };

  describe('consultation lifecycle', () => {
    it('creates with doctor = caller and ignores spoofed fields', async () => {
      const res = await http()
        .post('/api/v1/consultations')
        .set(auth(A.doctor))
        .send({ patientId: patient.id, chiefComplaint: 'Cough', doctorId: doctorB.id, organizationId: B.org.id, status: 'COMPLETED' });
      expect(res.status).toBe(201);
      expect(res.body.data.doctorId).toBe(A.doctor.id);
      expect(res.body.data.organizationId).toBe(A.org.id);
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('validates input and tenant ownership of the patient', async () => {
      expect((await http().post('/api/v1/consultations').set(auth(A.doctor)).send({})).status).toBe(400);
      const foreign = await createPatient(app, B.receptionist);
      expect((await http().post('/api/v1/consultations').set(auth(A.doctor)).send({ patientId: foreign.id })).status).toBe(404);
    });

    it('is idempotent per appointment', async () => {
      const appt = await prisma.appointment.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: patient.id,
          doctorId: A.doctor.id,
          scheduledStart: new Date(),
          scheduledEnd: new Date(Date.now() + 15 * 60_000),
          status: 'CHECKED_IN',
        },
      });
      const one = await startConsultation(A.doctor, { appointmentId: appt.id });
      const two = await http().post('/api/v1/consultations').set(auth(A.doctor)).send({ patientId: patient.id, appointmentId: appt.id });
      expect(two.body.data.id).toBe(one.id);
    });

    it('only the consulting doctor may edit; completed consultations are locked; addenda allowed', async () => {
      const c = await startConsultation();
      const upd = await http().patch(`/api/v1/consultations/${c.id}`).set(auth(A.doctor)).send({ clinicalAssessment: 'Viral fever' });
      expect(upd.status).toBe(200);
      expect(upd.body.data.clinicalAssessment).toBe('Viral fever');

      expect((await http().patch(`/api/v1/consultations/${c.id}`).set(auth(doctorB)).send({ treatmentPlan: 'x' })).status).toBe(403);
      expect((await http().post(`/api/v1/consultations/${c.id}/complete`).set(auth(doctorB))).status).toBe(403);
      expect((await http().post(`/api/v1/consultations/${c.id}/addendum`).set(auth(A.doctor)).send({ note: 'too early' })).status).toBe(400);

      const done = await http().post(`/api/v1/consultations/${c.id}/complete`).set(auth(A.doctor));
      expect(done.status).toBe(201);
      expect(done.body.data.status).toBe('COMPLETED');

      const locked = await http().patch(`/api/v1/consultations/${c.id}`).set(auth(A.doctor)).send({ treatmentPlan: 'change' });
      expect(locked.status).toBe(409);
      expect(locked.body.message).toMatch(/locked/i);
      expect((await http().post(`/api/v1/consultations/${c.id}/complete`).set(auth(A.doctor))).status).toBe(409);
      expect((await http().post('/api/v1/vitals').set(auth(A.nurse)).send({ consultationId: c.id, pulse: 80 })).status).toBe(409);
      expect(
        (await http().post('/api/v1/diagnoses').set(auth(A.doctor)).send({ consultationId: c.id, diagnosisName: 'Late' })).status,
      ).toBe(409);

      const add = await http().post(`/api/v1/consultations/${c.id}/addendum`).set(auth(A.doctor)).send({ note: 'Lab results normal' });
      expect(add.status).toBe(201);
      const ws = await http().get(`/api/v1/consultations/${c.id}/workspace`).set(auth(A.doctor));
      expect(ws.body.data.addenda.map((a: any) => a.note)).toEqual(['Lab results normal']);
      expect(ws.body.data.canEdit).toBe(false);
    });

    it('lists with filters and pagination', async () => {
      const res = await http().get(`/api/v1/consultations?patientId=${patient.id}&limit=2`).set(auth(A.doctor));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
      const completed = await http().get(`/api/v1/consultations?patientId=${patient.id}&status=COMPLETED`).set(auth(A.nurse));
      expect(completed.body.data.every((c: any) => c.status === 'COMPLETED')).toBe(true);
      const mine = await http().get('/api/v1/consultations?mine=true').set(auth(doctorB));
      expect(mine.body.data).toHaveLength(0);
    });

    it('RBAC: receptionist and accountant cannot read consultations; nurse cannot create', async () => {
      const c = await startConsultation();
      expect((await http().get(`/api/v1/consultations/${c.id}`).set(auth(A.receptionist))).status).toBe(403);
      expect((await http().get('/api/v1/consultations').set(auth(A.accountant))).status).toBe(403);
      expect((await http().get(`/api/v1/consultations/${c.id}/workspace`).set(auth(A.receptionist))).status).toBe(403);
      expect((await http().post('/api/v1/consultations').set(auth(A.nurse)).send({ patientId: patient.id })).status).toBe(403);
    });

    it('cross-tenant: 404 on another tenant’s consultation', async () => {
      const c = await startConsultation();
      expect((await http().get(`/api/v1/consultations/${c.id}`).set(auth(B.doctor))).status).toBe(404);
      expect((await http().patch(`/api/v1/consultations/${c.id}`).set(auth(B.doctor)).send({ treatmentPlan: 'x' })).status).toBe(404);
      expect((await http().post('/api/v1/vitals').set(auth(B.nurse)).send({ consultationId: c.id, pulse: 70 })).status).toBe(404);
    });
  });

  describe('vitals', () => {
    it('nurse records vitals; BMI computed; history per patient', async () => {
      const c = await startConsultation();
      const v = await http()
        .post('/api/v1/vitals')
        .set(auth(A.nurse))
        .send({ consultationId: c.id, height: 170, weight: 72.5, pulse: 82, bloodPressureSystolic: 128, bloodPressureDiastolic: 84, spo2: 98, temperature: 37.2 });
      expect(v.status).toBe(201);
      expect(v.body.data.bmi).toBe(25.1);
      expect(v.body.data.bmiCategory).toBe('Overweight');

      expect((await http().post('/api/v1/vitals').set(auth(A.nurse)).send({ consultationId: c.id })).status).toBe(400);
      expect((await http().post('/api/v1/vitals').set(auth(A.nurse)).send({ consultationId: c.id, spo2: 140 })).status).toBe(400);
      expect(
        (await http().post('/api/v1/vitals').set(auth(A.nurse)).send({ consultationId: c.id, bloodPressureSystolic: 80, bloodPressureDiastolic: 90 })).status,
      ).toBe(400);

      const list = await http().get(`/api/v1/vitals?consultationId=${c.id}`).set(auth(A.doctor));
      expect(list.body.data).toHaveLength(1);
      const hist = await http().get(`/api/v1/vitals/patient/${patient.id}`).set(auth(A.doctor));
      expect(hist.status).toBe(200);
      expect(hist.body.data[0].bmi).toBe(25.1);
      expect(hist.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('RBAC: receptionist cannot read vitals; accountant cannot record', async () => {
      expect((await http().get(`/api/v1/vitals/patient/${patient.id}`).set(auth(A.receptionist))).status).toBe(403);
      expect((await http().post('/api/v1/vitals').set(auth(A.accountant)).send({})).status).toBe(403);
      expect((await http().get(`/api/v1/vitals/patient/${patient.id}`).set(auth(B.doctor))).status).toBe(404);
    });
  });

  describe('diagnoses', () => {
    it('doctor adds / edits / deletes ICD diagnoses on own draft consultation', async () => {
      const c = await startConsultation();
      const d = await http()
        .post('/api/v1/diagnoses')
        .set(auth(A.doctor))
        .send({ consultationId: c.id, icdCode: 'j06.9', diagnosisName: 'Acute upper respiratory infection', severity: 'MILD' });
      expect(d.status).toBe(201);
      expect(d.body.data.icdCode).toBe('J06.9');
      expect(
        (await http().post('/api/v1/diagnoses').set(auth(A.doctor)).send({ consultationId: c.id, icdCode: 'not an icd!', diagnosisName: 'X' })).status,
      ).toBe(400);
      expect((await http().post('/api/v1/diagnoses').set(auth(doctorB)).send({ consultationId: c.id, diagnosisName: 'Mine' })).status).toBe(403);
      expect((await http().post('/api/v1/diagnoses').set(auth(A.nurse)).send({ consultationId: c.id, diagnosisName: 'N' })).status).toBe(403);

      const upd = await http().patch(`/api/v1/diagnoses/${d.body.data.id}`).set(auth(A.doctor)).send({ severity: 'MODERATE' });
      expect(upd.body.data.severity).toBe('MODERATE');

      const byPatient = await http().get(`/api/v1/diagnoses?patientId=${patient.id}`).set(auth(A.nurse));
      expect(byPatient.body.data.some((x: any) => x.id === d.body.data.id)).toBe(true);
      expect((await http().get(`/api/v1/diagnoses?consultationId=${c.id}`).set(auth(A.receptionist))).status).toBe(403);
      expect((await http().delete(`/api/v1/diagnoses/${d.body.data.id}`).set(auth(B.doctor))).status).toBe(404);
      expect((await http().delete(`/api/v1/diagnoses/${d.body.data.id}`).set(auth(A.doctor))).status).toBe(200);
    });
  });

  describe('allergies, conditions & history', () => {
    it('doctor manages allergies; duplicates rejected; accountant/receptionist cannot read', async () => {
      const a = await http().post(`/api/v1/clinical/patients/${patient.id}/allergies`).set(auth(A.doctor)).send({ allergyName: 'Sulfa drugs', severity: 'MODERATE' });
      expect(a.status).toBe(201);
      expect(
        (await http().post(`/api/v1/clinical/patients/${patient.id}/allergies`).set(auth(A.doctor)).send({ allergyName: 'sulfa DRUGS' })).status,
      ).toBe(409);
      expect((await http().post(`/api/v1/clinical/patients/${patient.id}/allergies`).set(auth(A.nurse)).send({ allergyName: 'Latex' })).status).toBe(403);
      expect((await http().get(`/api/v1/clinical/patients/${patient.id}/allergies`).set(auth(A.accountant))).status).toBe(403);
      expect((await http().get(`/api/v1/clinical/patients/${patient.id}/allergies`).set(auth(A.receptionist))).status).toBe(403);
      expect((await http().get(`/api/v1/clinical/patients/${patient.id}/allergies`).set(auth(B.doctor))).status).toBe(404);
      expect((await http().patch(`/api/v1/clinical/allergies/${a.body.data.id}`).set(auth(B.doctor)).send({ severity: 'MILD' })).status).toBe(404);

      const list = await http().get(`/api/v1/clinical/patients/${patient.id}/allergies`).set(auth(A.nurse));
      expect(list.body.data.map((x: any) => x.allergyName)).toContain('Sulfa drugs');

      const cond = await http()
        .post(`/api/v1/clinical/patients/${patient.id}/conditions`)
        .set(auth(A.doctor))
        .send({ conditionName: 'Type 2 diabetes', diagnosedDate: '2020-01-01', status: 'CHRONIC' });
      expect(cond.status).toBe(201);
      const upd = await http().patch(`/api/v1/clinical/conditions/${cond.body.data.id}`).set(auth(A.doctor)).send({ status: 'CONTROLLED' });
      expect(upd.body.data.status).toBe('CONTROLLED');

      const hist = await http().get(`/api/v1/clinical/patients/${patient.id}/history`).set(auth(A.doctor));
      expect(hist.status).toBe(200);
      expect(hist.body.data.conditions[0].conditionName).toBe('Type 2 diabetes');
      expect(Array.isArray(hist.body.data.pastDiagnoses)).toBe(true);
      expect(Array.isArray(hist.body.data.medicationHistory)).toBe(true);
    });

    it('workspace aggregates consultation, vitals, diagnoses, prescriptions and allergies', async () => {
      const c = await startConsultation();
      await http().post('/api/v1/vitals').set(auth(A.nurse)).send({ consultationId: c.id, pulse: 70 }).expect(201);
      await http().post('/api/v1/diagnoses').set(auth(A.doctor)).send({ consultationId: c.id, diagnosisName: 'Gastritis', icdCode: 'K29.7' }).expect(201);
      const ws = await http().get(`/api/v1/consultations/${c.id}/workspace`).set(auth(A.doctor));
      expect(ws.status).toBe(200);
      const d = ws.body.data;
      expect(d.consultation.id).toBe(c.id);
      expect(d.vitals).toHaveLength(1);
      expect(d.diagnoses[0].icdCode).toBe('K29.7');
      expect(Array.isArray(d.prescriptions)).toBe(true);
      expect(d.allergies.map((x: any) => x.allergyName)).toContain('Sulfa drugs');
      expect(d.canEdit).toBe(true);
      expect(d.previousConsultations.length).toBeGreaterThan(0);
    });
  });

  describe('timeline', () => {
    it('records typed events and filters by category and permission', async () => {
      const all = await http().get(`/api/v1/timeline?patientId=${patient.id}&limit=100`).set(auth(A.doctor));
      expect(all.status).toBe(200);
      const types = all.body.data.map((e: any) => e.eventType);
      for (const t of ['PATIENT_REGISTERED', 'CONSULTATION_STARTED', 'CONSULTATION_COMPLETED', 'VITALS_RECORDED', 'ALLERGY_ADDED', 'DIAGNOSIS_ADDED']) {
        expect(types).toContain(t);
      }
      // Interceptor duplicates are hidden.
      expect(all.body.data.filter((e: any) => e.category === 'SYSTEM')).toHaveLength(0);

      const clinical = await http().get(`/api/v1/timeline?patientId=${patient.id}&category=CLINICAL&limit=5`).set(auth(A.doctor));
      expect(clinical.body.data.every((e: any) => e.category === 'CLINICAL')).toBe(true);
      expect(clinical.body.meta.limit).toBe(5);

      // Receptionist: timeline.view but no clinical access → no CLINICAL events.
      const rec = await http().get(`/api/v1/timeline?patientId=${patient.id}&limit=100`).set(auth(A.receptionist));
      expect(rec.status).toBe(200);
      expect(rec.body.data.some((e: any) => e.category === 'CLINICAL')).toBe(false);
      expect(rec.body.data.some((e: any) => e.eventType === 'PATIENT_REGISTERED')).toBe(true);

      expect((await http().get(`/api/v1/timeline?patientId=${patient.id}`).set(auth(A.accountant))).status).toBe(403);
      expect((await http().get(`/api/v1/timeline?patientId=${patient.id}`).set(auth(B.doctor))).status).toBe(404);
    });
  });
});
