import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, Tenant, TenantUser } from './helpers/app';
import { addRoleUser } from './helpers/clinical';

describe('Prescriptions (e2e) — safety checks, ownership, cancel, PDF', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let doctorB: TenantUser;
  let http: () => any;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    http = () => request(app.getHttpServer());
    A = await createTenant(app, prisma, 'RxA');
    B = await createTenant(app, prisma, 'RxB');
    doctorB = await addRoleUser(app, prisma, A, 'Doctor');
  });

  afterAll(async () => {
    await app.close();
  });

  const rx = (patientId: string, items: any[], extra: Record<string, unknown> = {}, user: TenantUser = A.doctor) =>
    http().post('/api/v1/prescriptions').set(auth(user)).send({ patientId, items, ...extra });

  it('creates a prescription with items (doctor = caller, ACTIVE)', async () => {
    const p = await createPatient(app, A.receptionist);
    const res = await rx(p.id, [
      { medicineName: 'Paracetamol 500mg', dosage: '1 tab', frequency: 'TDS', duration: '5 days' },
      { medicineName: 'Cetirizine 10mg', frequency: 'HS' },
    ], { doctorId: doctorB.id, organizationId: B.org.id, notes: 'Plenty of fluids' });
    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.doctorId).toBe(A.doctor.id);
    expect(res.body.data.organizationId).toBe(A.org.id);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.warnings).toEqual([]);
  });

  it('validates body', async () => {
    const p = await createPatient(app, A.receptionist);
    expect((await rx(p.id, [])).status).toBe(400);
    expect((await http().post('/api/v1/prescriptions').set(auth(A.doctor)).send({ items: [{ medicineName: 'X1' }] })).status).toBe(400);
    expect((await rx(p.id, [{ dosage: '1' }])).status).toBe(400);
  });

  it('allergy match blocks unless acknowledged (case-insensitive substring)', async () => {
    const p = await createPatient(app, A.receptionist);
    await http().post(`/api/v1/clinical/patients/${p.id}/allergies`).set(auth(A.doctor)).send({ allergyName: 'penicillin', severity: 'SEVERE' }).expect(201);

    const check = await http()
      .post('/api/v1/prescriptions/check-safety')
      .set(auth(A.doctor))
      .send({ patientId: p.id, items: [{ medicineName: 'Amoxicillin' }, { medicineName: 'PENICILLIN V 250mg' }] });
    expect(check.status).toBe(201);
    expect(check.body.data.warnings).toHaveLength(1);
    expect(check.body.data.warnings[0]).toMatchObject({ type: 'ALLERGY', allergyName: 'penicillin' });

    const blocked = await rx(p.id, [{ medicineName: 'Penicillin V 250mg' }]);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('SAFETY_WARNINGS');
    expect(blocked.body.message).toMatch(/penicillin/i);
    expect(await prisma.prescription.count({ where: { patientId: p.id } })).toBe(0);

    const ok = await rx(p.id, [{ medicineName: 'Penicillin V 250mg' }], { acknowledgeWarnings: true });
    expect(ok.status).toBe(201);
    expect(ok.body.data.warnings[0].type).toBe('ALLERGY');
  });

  it('duplicate active medicine for the same patient is flagged', async () => {
    const p = await createPatient(app, A.receptionist);
    expect((await rx(p.id, [{ medicineName: 'Metformin 500mg' }])).status).toBe(201);
    const dup = await rx(p.id, [{ medicineName: 'metformin 1000mg' }]);
    expect(dup.status).toBe(409);
    const within = await rx(p.id, [{ medicineName: 'Pantoprazole' }, { medicineName: 'pantoprazole' }]);
    expect(within.status).toBe(409);
    expect((await rx(p.id, [{ medicineName: 'Metformin 1000mg' }], { acknowledgeWarnings: true })).status).toBe(201);

    const active = await http().get(`/api/v1/prescriptions/patient/${p.id}/active`).set(auth(A.doctor));
    expect(active.status).toBe(200);
    expect(active.body.data.map((m: any) => m.medicineName).sort()).toEqual(['Metformin 1000mg', 'Metformin 500mg']);
  });

  it('update: prescribing doctor only, ACTIVE only, re-runs safety checks', async () => {
    const p = await createPatient(app, A.receptionist);
    const created = (await rx(p.id, [{ medicineName: 'Azithromycin 500mg' }])).body.data;

    const other = await http()
      .patch(`/api/v1/prescriptions/${created.id}`)
      .set(auth(doctorB))
      .send({ items: [{ medicineName: 'Hacked' }] });
    expect(other.status).toBe(403);

    const upd = await http()
      .patch(`/api/v1/prescriptions/${created.id}`)
      .set(auth(A.doctor))
      .send({ notes: 'Take after food', items: [{ medicineName: 'Azithromycin 250mg', frequency: 'OD', duration: '3 days' }] });
    expect(upd.status).toBe(200);
    expect(upd.body.data.items).toHaveLength(1);
    expect(upd.body.data.items[0].medicineName).toBe('Azithromycin 250mg');
    expect(upd.body.data.notes).toBe('Take after food');

    await http().post(`/api/v1/clinical/patients/${p.id}/allergies`).set(auth(A.doctor)).send({ allergyName: 'Ibuprofen' }).expect(201);
    expect(
      (await http().patch(`/api/v1/prescriptions/${created.id}`).set(auth(A.doctor)).send({ items: [{ medicineName: 'Ibuprofen 400' }] })).status,
    ).toBe(409);
  });

  it('cancel with reason; cancelled prescriptions are immutable; other doctor cannot cancel', async () => {
    const p = await createPatient(app, A.receptionist);
    const created = (await rx(p.id, [{ medicineName: 'Ciprofloxacin' }])).body.data;
    expect((await http().post(`/api/v1/prescriptions/${created.id}/cancel`).set(auth(doctorB)).send({ reason: 'Not mine' })).status).toBe(403);
    expect((await http().post(`/api/v1/prescriptions/${created.id}/cancel`).set(auth(A.doctor)).send({})).status).toBe(400);
    const c = await http().post(`/api/v1/prescriptions/${created.id}/cancel`).set(auth(A.doctor)).send({ reason: 'Wrong patient' });
    expect(c.status).toBe(201);
    expect(c.body.data.status).toBe('CANCELLED');
    expect(c.body.data.cancelReason).toBe('Wrong patient');
    expect(c.body.data.cancelledAt).toBeTruthy();
    expect((await http().patch(`/api/v1/prescriptions/${created.id}`).set(auth(A.doctor)).send({ notes: 'x' })).status).toBe(409);
    // Cancelled medicine no longer counts as a duplicate.
    expect((await rx(p.id, [{ medicineName: 'Ciprofloxacin' }])).status).toBe(201);

    const tl = await http().get(`/api/v1/timeline?patientId=${p.id}&category=PRESCRIPTION`).set(auth(A.doctor));
    const types = tl.body.data.map((e: any) => e.eventType);
    expect(types).toContain('PRESCRIPTION_ISSUED');
    expect(types).toContain('PRESCRIPTION_CANCELLED');
  });

  it('links to own open consultation only', async () => {
    const p = await createPatient(app, A.receptionist);
    const cons = (await http().post('/api/v1/consultations').set(auth(A.doctor)).send({ patientId: p.id })).body.data;
    expect((await rx(p.id, [{ medicineName: 'ORS' }], { consultationId: cons.id }, doctorB)).status).toBe(403);
    const other = await createPatient(app, A.receptionist);
    expect((await rx(other.id, [{ medicineName: 'ORS' }], { consultationId: cons.id })).status).toBe(400);
    const ok = await rx(p.id, [{ medicineName: 'ORS' }], { consultationId: cons.id });
    expect(ok.status).toBe(201);
    const ws = await http().get(`/api/v1/consultations/${cons.id}/workspace`).set(auth(A.doctor));
    expect(ws.body.data.prescriptions.map((x: any) => x.id)).toContain(ok.body.data.id);
    await http().post(`/api/v1/consultations/${cons.id}/complete`).set(auth(A.doctor)).expect(201);
    expect((await rx(p.id, [{ medicineName: 'Zinc' }], { consultationId: cons.id })).status).toBe(409);
  });

  it('lists with filters, reads one, downloads PDF', async () => {
    const p = await createPatient(app, A.receptionist);
    const created = (await rx(p.id, [{ medicineName: 'Vitamin D3 60k', frequency: 'Weekly' }])).body.data;
    const list = await http().get(`/api/v1/prescriptions?patientId=${p.id}&status=ACTIVE`).set(auth(A.receptionist));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);

    const one = await http().get(`/api/v1/prescriptions/${created.id}`).set(auth(A.doctor));
    expect(one.body.data.canEdit).toBe(true);
    expect(one.body.data.doctor).not.toHaveProperty('passwordHash');
    const oneB = await http().get(`/api/v1/prescriptions/${created.id}`).set(auth(doctorB));
    expect(oneB.body.data.canEdit).toBe(false);

    const pdf = await http()
      .get(`/api/v1/prescriptions/${created.id}/download`)
      .set(auth(A.receptionist))
      .buffer(true)
      .parse((res: any, cb: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('RBAC and cross-tenant negatives', async () => {
    const p = await createPatient(app, A.receptionist);
    expect((await rx(p.id, [{ medicineName: 'X1' }], {}, A.nurse)).status).toBe(403);
    expect((await rx(p.id, [{ medicineName: 'X1' }], {}, A.receptionist)).status).toBe(403);
    expect((await rx(p.id, [{ medicineName: 'X1' }], {}, A.owner)).status).toBe(403);
    expect((await http().get('/api/v1/prescriptions').set(auth(A.accountant))).status).toBe(403);

    const created = (await rx(p.id, [{ medicineName: 'Amlodipine 5mg' }])).body.data;
    expect((await http().get(`/api/v1/prescriptions/${created.id}`).set(auth(B.doctor))).status).toBe(404);
    expect((await http().get(`/api/v1/prescriptions/${created.id}/download`).set(auth(B.doctor))).status).toBe(404);
    expect((await http().post(`/api/v1/prescriptions/${created.id}/cancel`).set(auth(B.doctor)).send({ reason: 'cross tenant' })).status).toBe(404);
    expect((await rx(p.id, [{ medicineName: 'X1' }], {}, B.doctor)).status).toBe(404);
    expect((await http().get(`/api/v1/prescriptions/patient/${p.id}/active`).set(auth(B.doctor))).status).toBe(404);
  });
});
