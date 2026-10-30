import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, futureSlot, Tenant, uniq } from './helpers/app';

const phone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('Patients (e2e) — registration, search, profile hub, sub-resources', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let http: () => any;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    http = () => request(app.getHttpServer());
    A = await createTenant(app, prisma, 'PatientsA');
    B = await createTenant(app, prisma, 'PatientsB');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('create', () => {
    it('registers a patient with nested addresses, contacts and tags and a generated code', async () => {
      const res = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({
          firstName: 'Ravi',
          lastName: uniq('Kumar'),
          gender: 'male',
          phone: phone(),
          dateOfBirth: '1985-04-12',
          bloodGroup: 'b+',
          addresses: [{ addressType: 'HOME', addressLine1: '12 MG Road', city: 'Pune' }],
          emergencyContacts: [{ name: 'Sita', relationship: 'Spouse', phone: phone() }],
          tags: [{ tagName: 'Diabetic', tagColor: '#ff0000' }],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.patientCode).toMatch(/^PAT-\d{6}$/);
      expect(res.body.data.gender).toBe('MALE');
      expect(res.body.data.bloodGroup).toBe('B+');
      expect(res.body.data.organizationId).toBe(A.org.id);
      expect(res.body.data.branchId).toBe(A.branch.id);

      const full = await http().get(`/api/v1/patients/${res.body.data.id}`).set(auth(A.receptionist));
      expect(full.status).toBe(200);
      expect(full.body.data.addresses).toHaveLength(1);
      expect(full.body.data.emergencyContacts).toHaveLength(1);
      expect(full.body.data.tags[0].tagName).toBe('Diabetic');
    });

    it('ignores client-supplied tenant fields (no mass assignment)', async () => {
      const res = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({ firstName: 'Mass', lastName: uniq('Assign'), phone: phone(), organizationId: B.org.id, branchId: B.branch.id, status: 'ARCHIVED' });
      expect(res.status).toBe(201);
      expect(res.body.data.organizationId).toBe(A.org.id);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('rejects missing names and invalid email', async () => {
      expect((await http().post('/api/v1/patients').set(auth(A.receptionist)).send({ firstName: 'X' })).status).toBe(400);
      expect(
        (await http().post('/api/v1/patients').set(auth(A.receptionist)).send({ firstName: 'X', lastName: 'Y', email: 'nope' })).status,
      ).toBe(400);
    });

    it('detects duplicates by phone (overridable) and email (never)', async () => {
      const p = await createPatient(app, A.receptionist, { email: `${uniq('dup')}@example.test` });
      const samePhone = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({ firstName: 'Family', lastName: 'Member', phone: p.phone });
      expect(samePhone.status).toBe(409);
      expect(samePhone.body.message).toMatch(/duplicate/i);

      const forced = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({ firstName: 'Family', lastName: 'Member', phone: p.phone, allowDuplicate: true });
      expect(forced.status).toBe(201);

      const sameEmail = await http()
        .post('/api/v1/patients')
        .set(auth(A.receptionist))
        .send({ firstName: 'Other', lastName: 'Person', email: p.email.toUpperCase(), allowDuplicate: true });
      expect(sameEmail.status).toBe(409);

      const check = await http().get(`/api/v1/patients/duplicates?phone=${p.phone}`).set(auth(A.receptionist));
      expect(check.status).toBe(200);
      expect(check.body.data.length).toBeGreaterThanOrEqual(2);

      // Another tenant may register the same phone.
      const otherTenant = await http()
        .post('/api/v1/patients')
        .set(auth(B.receptionist))
        .send({ firstName: 'Same', lastName: 'Phone', phone: p.phone });
      expect(otherTenant.status).toBe(201);
    });

    it('denies roles without patients.create', async () => {
      const res = await http().post('/api/v1/patients').set(auth(A.nurse)).send({ firstName: 'N', lastName: 'O' });
      expect(res.status).toBe(403);
    });
  });

  describe('update', () => {
    it('updates whitelisted fields only', async () => {
      const p = await createPatient(app, A.receptionist);
      const res = await http()
        .patch(`/api/v1/patients/${p.id}`)
        .set(auth(A.receptionist))
        .send({ occupation: 'Engineer', organizationId: B.org.id, branchId: B.branch.id, patientCode: 'HACK-1', createdBy: B.owner.id });
      expect(res.status).toBe(200);
      expect(res.body.data.occupation).toBe('Engineer');
      expect(res.body.data.organizationId).toBe(A.org.id);
      expect(res.body.data.branchId).toBe(A.branch.id);
      expect(res.body.data.patientCode).toBe(p.patientCode);
      expect(res.body.data.updatedBy).toBe(A.receptionist.id);
    });

    it('400 on malformed id, 404 cross-tenant', async () => {
      expect((await http().patch('/api/v1/patients/not-a-uuid').set(auth(A.receptionist)).send({})).status).toBe(400);
      const p = await createPatient(app, A.receptionist);
      expect((await http().patch(`/api/v1/patients/${p.id}`).set(auth(B.receptionist)).send({ occupation: 'x' })).status).toBe(404);
      expect((await http().get(`/api/v1/patients/${p.id}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().get(`/api/v1/patients/${p.id}/summary`).set(auth(B.owner))).status).toBe(404);
    });
  });

  describe('list & search', () => {
    let tagged: any;
    const marker = uniq('Zed').replace(/-/g, '');

    beforeAll(async () => {
      tagged = await createPatient(app, A.receptionist, { firstName: marker, lastName: 'Alpha' });
      await createPatient(app, A.receptionist, { firstName: marker, lastName: 'Beta', gender: 'MALE' });
      await http().post(`/api/v1/patients/${tagged.id}/tags`).set(auth(A.receptionist)).send({ tagName: 'VIP' }).expect(201);
    });

    it('paginates with meta and filters by q / gender / tag', async () => {
      const res = await http().get(`/api/v1/patients?q=${marker}&limit=1&page=1`).set(auth(A.receptionist));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.meta.pages).toBe(2);

      const male = await http().get(`/api/v1/patients?q=${marker}&gender=MALE`).set(auth(A.receptionist));
      expect(male.body.data.map((p: any) => p.lastName)).toEqual(['Beta']);

      const vip = await http().get(`/api/v1/patients?q=${marker}&tag=vip`).set(auth(A.receptionist));
      expect(vip.body.data.map((p: any) => p.id)).toEqual([tagged.id]);

      const sorted = await http().get(`/api/v1/patients?q=${marker}&sortBy=name&sortDir=desc`).set(auth(A.receptionist));
      expect(sorted.body.data.map((p: any) => p.lastName)).toEqual(['Beta', 'Alpha']);

      expect((await http().get('/api/v1/patients?limit=1000').set(auth(A.receptionist))).status).toBe(400);
    });

    it('never lists another tenant’s patients', async () => {
      const res = await http().get(`/api/v1/patients?q=${marker}`).set(auth(B.owner));
      expect(res.body.data).toHaveLength(0);
      const s = await http().get(`/api/v1/patients/search?q=${marker}`).set(auth(B.owner));
      expect(s.body.data).toHaveLength(0);
    });

    it('enriched search returns last visit, follow-ups and balance per permission', async () => {
      const slot = futureSlot(3, 11);
      await prisma.appointment.create({
        data: {
          organizationId: A.org.id,
          branchId: A.branch.id,
          patientId: tagged.id,
          doctorId: A.doctor.id,
          scheduledStart: new Date(slot.scheduledStart),
          scheduledEnd: new Date(slot.scheduledEnd),
        },
      });

      const rec = await http().get(`/api/v1/patients/search?q=${marker}`).set(auth(A.receptionist));
      expect(rec.status).toBe(200);
      const hit = rec.body.data.find((p: any) => p.id === tagged.id);
      expect(hit).toBeDefined();
      expect(hit).toHaveProperty('lastVisit');
      expect(hit).toHaveProperty('pendingFollowUps');
      expect(hit.outstandingBalance).toBe('0.00');
      expect(hit.nextAppointment).toBeTruthy();

      // Nurse has no invoices.view → no financial field.
      const nurse = await http().get(`/api/v1/patients/search?q=${marker}`).set(auth(A.nurse));
      expect(nurse.body.data[0]).not.toHaveProperty('outstandingBalance');

      expect((await http().get('/api/v1/patients/search?q=a').set(auth(A.receptionist))).status).toBe(400);
    });

    it('exports CSV with formula-injection protection', async () => {
      await createPatient(app, A.receptionist, { firstName: '=HYPERLINK("x")', lastName: marker });
      const res = await http().get(`/api/v1/patients/export/csv?q=${marker}`).set(auth(A.owner));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain(`'=HYPERLINK`);
      expect((await http().get('/api/v1/patients/export/csv').set(auth(A.receptionist))).status).toBe(403);
    });
  });

  describe('sub-resources', () => {
    let p: any;
    beforeAll(async () => {
      p = await createPatient(app, A.receptionist);
    });

    it('adds / updates / removes addresses and emergency contacts', async () => {
      const addr = await http().post(`/api/v1/patients/${p.id}/addresses`).set(auth(A.receptionist)).send({ city: 'Mumbai' });
      expect(addr.status).toBe(201);
      const upd = await http()
        .patch(`/api/v1/patients/${p.id}/addresses/${addr.body.data.id}`)
        .set(auth(A.receptionist))
        .send({ city: 'Nagpur' });
      expect(upd.body.data.city).toBe('Nagpur');
      expect((await http().delete(`/api/v1/patients/${p.id}/addresses/${addr.body.data.id}`).set(auth(A.receptionist))).status).toBe(200);

      const c = await http().post(`/api/v1/patients/${p.id}/emergency-contacts`).set(auth(A.receptionist)).send({ name: 'Bro', phone: phone() });
      expect(c.status).toBe(201);
      expect((await http().post(`/api/v1/patients/${p.id}/emergency-contacts`).set(auth(A.receptionist)).send({})).status).toBe(400);
      // Cross-tenant: B cannot touch A's contact even via its own patient id.
      const pb = await createPatient(app, B.receptionist);
      expect(
        (await http().delete(`/api/v1/patients/${pb.id}/emergency-contacts/${c.body.data.id}`).set(auth(B.receptionist))).status,
      ).toBe(404);
    });

    it('links family members within the tenant only', async () => {
      const relative = await createPatient(app, A.receptionist);
      const link = await http()
        .post(`/api/v1/patients/${p.id}/family-members`)
        .set(auth(A.receptionist))
        .send({ relatedPatientId: relative.id, relationship: 'Mother' });
      expect(link.status).toBe(201);
      expect(
        (await http().post(`/api/v1/patients/${relative.id}/family-members`).set(auth(A.receptionist)).send({ relatedPatientId: p.id })).status,
      ).toBe(409);
      const reverse = await http().get(`/api/v1/patients/${relative.id}`).set(auth(A.receptionist));
      expect(reverse.body.data.relatedFamilyMembers).toHaveLength(1);

      const foreign = await createPatient(app, B.receptionist);
      expect(
        (await http().post(`/api/v1/patients/${p.id}/family-members`).set(auth(A.receptionist)).send({ relatedPatientId: foreign.id })).status,
      ).toBe(404);
    });

    it('notes: add, list, author-only delete', async () => {
      const n = await http().post(`/api/v1/patients/${p.id}/notes`).set(auth(A.receptionist)).send({ note: 'Prefers morning slots' });
      expect(n.status).toBe(201);
      const list = await http().get(`/api/v1/patients/${p.id}/notes`).set(auth(A.nurse));
      expect(list.body.data[0].note).toBe('Prefers morning slots');
      expect(list.body.data[0].author.id).toBe(A.receptionist.id);
      expect((await http().delete(`/api/v1/patients/${p.id}/notes/${n.body.data.id}`).set(auth(A.doctor))).status).toBe(403);
      expect((await http().delete(`/api/v1/patients/${p.id}/notes/${n.body.data.id}`).set(auth(A.receptionist))).status).toBe(200);
    });
  });

  describe('archive / restore', () => {
    it('archives (soft delete), hides from list, blocks edits, restores', async () => {
      const p = await createPatient(app, A.receptionist);
      expect((await http().delete(`/api/v1/patients/${p.id}`).set(auth(A.receptionist))).status).toBe(403);
      const del = await http().delete(`/api/v1/patients/${p.id}`).set(auth(A.owner)).send({ reason: 'Duplicate record' });
      expect(del.status).toBe(200);
      expect(del.body.data.status).toBe('ARCHIVED');
      const row = await prisma.patient.findUnique({ where: { id: p.id } });
      expect(row?.deletedAt).toBeTruthy();
      expect(row?.deletedBy).toBe(A.owner.id);

      const list = await http().get(`/api/v1/patients?q=${p.lastName}`).set(auth(A.owner));
      expect(list.body.data).toHaveLength(0);
      const archived = await http().get(`/api/v1/patients?q=${p.lastName}&status=ARCHIVED`).set(auth(A.owner));
      expect(archived.body.data).toHaveLength(1);
      expect((await http().patch(`/api/v1/patients/${p.id}`).set(auth(A.owner)).send({ occupation: 'x' })).status).toBe(409);

      const restored = await http().post(`/api/v1/patients/${p.id}/restore`).set(auth(A.owner));
      expect(restored.status).toBe(201);
      expect(restored.body.data.status).toBe('ACTIVE');
    });
  });

  describe('profile hub summary (RBAC inside the summary)', () => {
    let p: any;
    beforeAll(async () => {
      p = await createPatient(app, A.receptionist);
      await http().post(`/api/v1/clinical/patients/${p.id}/allergies`).set(auth(A.doctor)).send({ allergyName: 'Penicillin', severity: 'SEVERE' }).expect(201);
    });

    it('doctor sees clinical sections but not billing', async () => {
      const res = await http().get(`/api/v1/patients/${p.id}/summary`).set(auth(A.doctor));
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.patient.id).toBe(p.id);
      expect(d.allergies[0].allergyName).toBe('Penicillin');
      expect(d).toHaveProperty('conditions');
      expect(d).toHaveProperty('recentVitals');
      expect(d).toHaveProperty('activePrescriptions');
      expect(d).toHaveProperty('recentConsultations');
      expect(d).toHaveProperty('recentDocuments');
      expect(d).not.toHaveProperty('outstandingInvoices');
      expect(d).not.toHaveProperty('outstandingBalance');
    });

    it('accountant sees billing but no clinical sections', async () => {
      const d = (await http().get(`/api/v1/patients/${p.id}/summary`).set(auth(A.accountant))).body.data;
      expect(d.outstandingBalance).toBe('0.00');
      for (const k of ['allergies', 'conditions', 'recentVitals', 'recentConsultations', 'activePrescriptions', 'recentDocuments']) {
        expect(d).not.toHaveProperty(k);
      }
      expect(d.sections).not.toContain('allergies');
    });

    it('receptionist sees appointments + billing, no clinical data', async () => {
      const d = (await http().get(`/api/v1/patients/${p.id}/summary`).set(auth(A.receptionist))).body.data;
      expect(d).toHaveProperty('upcomingAppointments');
      expect(d).toHaveProperty('outstandingBalance');
      for (const k of ['allergies', 'conditions', 'recentVitals', 'recentConsultations', 'activePrescriptions', 'recentDocuments']) {
        expect(d).not.toHaveProperty(k);
      }
    });

    it('patient detail (GET :id) carries no clinical or financial relations', async () => {
      const d = (await http().get(`/api/v1/patients/${p.id}`).set(auth(A.accountant))).body.data;
      for (const k of ['consultations', 'prescriptions', 'invoices', 'documents', 'allergies']) expect(d).not.toHaveProperty(k);
    });
  });
});
