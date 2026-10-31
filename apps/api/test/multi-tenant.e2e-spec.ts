/**
 * Tenant isolation through the real API.
 *  - Organization A vs organization B: cross-tenant ids are 404 (never 403/200), lists and
 *    searches never leak the other tenant's rows, writes against foreign ids change nothing.
 *  - Two branches of the same organization: branch-level staff are pinned to their branch;
 *    org-wide users (owner) can switch with X-Branch-Id.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, futureSlot, Tenant, TenantUser, uniq } from './helpers/app';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n');

describe('Multi-tenant & multi-branch isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  const http = () => request(app.getHttpServer());
  const get = (u: TenantUser, url: string) => http().get(url).set(auth(u));
  const ids = (res: any) => (res.body.data as any[]).map((r) => r.id);

  // Tenant A records
  const a: Record<string, any> = {};
  let patientB: any;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'IsoA');
    B = await createTenant(app, prisma, 'IsoB');

    const marker = uniq('IsoMarker');
    a.marker = marker;
    a.patient = await createPatient(app, A.receptionist, { firstName: marker });
    patientB = await createPatient(app, B.receptionist, { firstName: 'Bee' });

    const appt = await http()
      .post('/api/v1/appointments')
      .set(auth(A.receptionist))
      .send({ patientId: a.patient.id, doctorId: A.doctor.id, ...futureSlot(2, 11) });
    expect(appt.status).toBe(201);
    a.appointment = appt.body.data;

    const c = await http().post('/api/v1/consultations').set(auth(A.doctor)).send({ patientId: a.patient.id, chiefComplaint: 'Headache' });
    expect(c.status).toBe(201);
    a.consultation = c.body.data;

    const rx = await http()
      .post('/api/v1/prescriptions')
      .set(auth(A.doctor))
      .send({ patientId: a.patient.id, consultationId: a.consultation.id, items: [{ medicineName: 'Ibuprofen 400mg', frequency: 'BD' }] });
    expect(rx.status).toBe(201);
    a.prescription = rx.body.data;

    const inv = await http()
      .post('/api/v1/invoices')
      .set(auth(A.receptionist))
      .send({ patientId: a.patient.id, items: [{ itemName: 'Consultation', quantity: 1, unitPrice: 300 }], issue: true });
    expect(inv.status).toBe(201);
    a.invoice = inv.body.data;

    const doc = await http()
      .post('/api/v1/documents/upload')
      .set(auth(A.receptionist))
      .attach('file', PDF, 'report.pdf')
      .field('patientId', a.patient.id)
      .field('documentType', 'OTHER')
      .field('title', 'Report');
    expect(doc.status).toBe(201);
    a.document = doc.body.data;

    const fu = await http()
      .post('/api/v1/follow-ups')
      .set(auth(A.doctor))
      .send({ patientId: a.patient.id, scheduledDate: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    expect(fu.status).toBe(201);
    a.followUp = fu.body.data;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('organization A vs organization B', () => {
    it('own records are readable by the owning tenant', async () => {
      expect((await get(A.receptionist, `/api/v1/patients/${a.patient.id}`)).status).toBe(200);
      expect((await get(A.receptionist, `/api/v1/appointments/${a.appointment.id}`)).status).toBe(200);
      expect((await get(A.doctor, `/api/v1/consultations/${a.consultation.id}`)).status).toBe(200);
      expect((await get(A.doctor, `/api/v1/prescriptions/${a.prescription.id}`)).status).toBe(200);
      expect((await get(A.accountant, `/api/v1/invoices/${a.invoice.id}`)).status).toBe(200);
      expect((await get(A.doctor, `/api/v1/documents/${a.document.id}`)).status).toBe(200);
      expect((await get(A.doctor, `/api/v1/follow-ups/${a.followUp.id}`)).status).toBe(200);
    });

    it('cross-tenant reads by id return 404 (even for the other org owner)', async () => {
      const cases: Array<[TenantUser, string]> = [
        [B.receptionist, `/api/v1/patients/${a.patient.id}`],
        [B.owner, `/api/v1/patients/${a.patient.id}`],
        [B.owner, `/api/v1/patients/${a.patient.id}/summary`],
        [B.receptionist, `/api/v1/appointments/${a.appointment.id}`],
        [B.doctor, `/api/v1/consultations/${a.consultation.id}`],
        [B.doctor, `/api/v1/consultations/${a.consultation.id}/workspace`],
        [B.doctor, `/api/v1/prescriptions/${a.prescription.id}`],
        [B.accountant, `/api/v1/invoices/${a.invoice.id}`],
        [B.doctor, `/api/v1/documents/${a.document.id}`],
        [B.doctor, `/api/v1/documents/${a.document.id}/download`],
        [B.doctor, `/api/v1/follow-ups/${a.followUp.id}`],
        [B.doctor, `/api/v1/timeline?patientId=${a.patient.id}`],
      ];
      for (const [user, url] of cases) {
        const res = await get(user, url);
        expect({ url, status: res.status }).toEqual({ url, status: 404 });
      }
    });

    it('cross-tenant writes return 404 and change nothing', async () => {
      const upd = await http().patch(`/api/v1/patients/${a.patient.id}`).set(auth(B.owner)).send({ firstName: 'Hacked' });
      expect(upd.status).toBe(404);
      const del = await http().delete(`/api/v1/patients/${a.patient.id}`).set(auth(B.owner)).send({});
      expect(del.status).toBe(404);
      const cancel = await http().post(`/api/v1/appointments/${a.appointment.id}/cancel`).set(auth(B.receptionist)).send({ reason: 'x' });
      expect(cancel.status).toBe(404);
      const pay = await http().post(`/api/v1/invoices/${a.invoice.id}/payments`).set(auth(B.receptionist)).send({ amount: 1, paymentMethod: 'CASH' });
      expect(pay.status).toBe(404);
      const rxCancel = await http().post(`/api/v1/prescriptions/${a.prescription.id}/cancel`).set(auth(B.doctor)).send({ reason: 'Not needed' });
      expect(rxCancel.status).toBe(404);
      const docDel = await http().delete(`/api/v1/documents/${a.document.id}`).set(auth(B.owner));
      expect(docDel.status).toBe(404);

      const p = await prisma.patient.findUnique({ where: { id: a.patient.id } });
      expect(p!.firstName).toBe(a.marker);
      expect(p!.deletedAt).toBeNull();
      expect((await prisma.appointment.findUnique({ where: { id: a.appointment.id } }))!.status).not.toBe('CANCELLED');
      expect((await prisma.prescription.findUnique({ where: { id: a.prescription.id } }))!.status).toBe('ACTIVE');
      expect(await prisma.payment.count({ where: { invoiceId: a.invoice.id } })).toBe(0);
    });

    it('cannot reference another tenant’s patient when creating records', async () => {
      const appt = await http()
        .post('/api/v1/appointments')
        .set(auth(B.receptionist))
        .send({ patientId: a.patient.id, doctorId: B.doctor.id, ...futureSlot(3, 10) });
      expect(appt.status).toBe(404);
      expect((await http().post('/api/v1/consultations').set(auth(B.doctor)).send({ patientId: a.patient.id })).status).toBe(404);
      const inv = await http()
        .post('/api/v1/invoices')
        .set(auth(B.receptionist))
        .send({ patientId: a.patient.id, items: [{ itemName: 'X', quantity: 1, unitPrice: 1 }] });
      expect(inv.status).toBe(404);
    });

    it('lists and searches never include the other tenant’s rows', async () => {
      const lists: Array<[TenantUser, string, string]> = [
        [B.owner, '/api/v1/patients?limit=200', a.patient.id],
        [B.receptionist, '/api/v1/appointments?limit=200', a.appointment.id],
        [B.doctor, '/api/v1/consultations?limit=200', a.consultation.id],
        [B.doctor, '/api/v1/prescriptions?limit=200', a.prescription.id],
        [B.accountant, '/api/v1/invoices?limit=200', a.invoice.id],
        [B.doctor, '/api/v1/documents?limit=200', a.document.id],
        [B.doctor, '/api/v1/follow-ups?limit=200', a.followUp.id],
      ];
      for (const [user, url, foreignId] of lists) {
        const res = await get(user, url);
        expect({ url, status: res.status }).toEqual({ url, status: 200 });
        expect(ids(res)).not.toContain(foreignId);
      }
      // Sanity: tenant B does see its own patient.
      expect(ids(await get(B.owner, '/api/v1/patients?limit=200'))).toContain(patientB.id);

      const search = await get(B.receptionist, `/api/v1/patients/search?q=${encodeURIComponent(a.marker)}`);
      expect(search.status).toBe(200);
      expect(JSON.stringify(search.body.data)).not.toContain(a.patient.id);
      const ownSearch = await get(A.receptionist, `/api/v1/patients/search?q=${encodeURIComponent(a.marker)}`);
      expect(JSON.stringify(ownSearch.body.data)).toContain(a.patient.id);
    });

    it('X-Branch-Id cannot point into another organization', async () => {
      expect((await get(B.owner, '/api/v1/patients').set('X-Branch-Id', A.branch.id)).status).toBe(403);
    });
  });

  describe('two branches in the same organization', () => {
    let branch2: any;
    let patient2: any;

    beforeAll(async () => {
      const res = await http().post('/api/v1/branches').set(auth(A.owner)).send({ name: uniq('Second Branch'), city: 'Mumbai', timezone: 'Asia/Kolkata' });
      expect(res.status).toBe(201);
      branch2 = res.body.data;
      expect(branch2.organizationId).toBe(A.org.id);

      // Owner switches into branch 2 and registers a patient there.
      const p = await http()
        .post('/api/v1/patients')
        .set(auth(A.owner))
        .set('X-Branch-Id', branch2.id)
        .send({ firstName: 'BranchTwo', lastName: uniq('P'), gender: 'MALE', phone: `97${Math.floor(10000000 + Math.random() * 89999999)}` });
      expect(p.status).toBe(201);
      patient2 = p.body.data;
      expect(patient2.branchId).toBe(branch2.id);
    });

    it('branch staff cannot create branches', async () => {
      expect((await http().post('/api/v1/branches').set(auth(A.receptionist)).send({ name: uniq('Nope') })).status).toBe(403);
      expect((await http().post('/api/v1/branches').set(auth(A.manager)).send({ name: uniq('Nope') })).status).toBe(403);
    });

    it('branch-level receptionist cannot see the other branch’s patients', async () => {
      expect((await get(A.receptionist, `/api/v1/patients/${patient2.id}`)).status).toBe(404);
      const list = await get(A.receptionist, '/api/v1/patients?limit=200');
      expect(ids(list)).not.toContain(patient2.id);
      expect(ids(list)).toContain(a.patient.id);
    });

    it('branch-level receptionist gets 403 when sending X-Branch-Id of the other branch', async () => {
      expect((await get(A.receptionist, '/api/v1/patients').set('X-Branch-Id', branch2.id)).status).toBe(403);
      expect((await get(A.receptionist, `/api/v1/patients/${patient2.id}`).set('X-Branch-Id', branch2.id)).status).toBe(403);
      // Sending your own branch is a no-op.
      expect((await get(A.receptionist, '/api/v1/patients').set('X-Branch-Id', A.branch.id)).status).toBe(200);
    });

    it('owner switches branches with X-Branch-Id', async () => {
      const inB2 = await get(A.owner, '/api/v1/patients?limit=200').set('X-Branch-Id', branch2.id);
      expect(inB2.status).toBe(200);
      expect(ids(inB2)).toContain(patient2.id);
      expect(ids(inB2)).not.toContain(a.patient.id);

      const home = await get(A.owner, '/api/v1/patients?limit=200');
      expect(ids(home)).toContain(a.patient.id);
      expect(ids(home)).not.toContain(patient2.id);

      expect((await get(A.owner, `/api/v1/patients/${patient2.id}`).set('X-Branch-Id', branch2.id)).status).toBe(200);
      expect((await get(A.owner, '/api/v1/patients').set('X-Branch-Id', 'not-a-uuid')).status).toBe(403);
    });
  });
});
