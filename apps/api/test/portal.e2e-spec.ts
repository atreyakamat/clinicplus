/**
 * Patient self-service portal e2e.
 *
 * Focus is SECURITY: patient auth is fully separated from staff auth, every
 * portal query is scoped to the authenticated patient only, cross-patient and
 * cross-tenant access is impossible, disabled accounts cannot sign in, and
 * self-booking respects conflicts. Stripe and SMS are mocked (no network).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { StripeService } from '../src/payments/stripe.service';
import { SmsService } from '../src/messages/sms.service';
import { configureApp } from '../src/app.setup';
import { assertTestDatabase, auth, createPatient, createTenant, futureSlot, uniq, Tenant } from './helpers/app';

const pauth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ---- mocked externals ------------------------------------------------------
const stripe = {
  _enabled: true,
  isEnabled() {
    return this._enabled;
  },
  currency() {
    return 'inr';
  },
  appBaseUrl() {
    return 'http://localhost:5173';
  },
  async createCheckoutSession(params: any) {
    return {
      id: `cs_test_${uniq('s')}`,
      url: `https://stripe.test/pay/${uniq('u')}`,
      amount_total: params.line_items[0].price_data.unit_amount,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      status: 'open',
    };
  },
  async expireCheckoutSession() {
    /* no-op */
  },
};

const smsOutbox: { patientId: string; content: string }[] = [];
const sms = {
  async sendAndRecord(patientId: string, content: string) {
    smsOutbox.push({ patientId, content });
    return { deliveryStatus: 'SENT' };
  },
  async sendSms() {
    return { success: true };
  },
};

function otpFor(patientId: string): string {
  const msg = [...smsOutbox].reverse().find((m) => m.patientId === patientId);
  // Anchor on the code phrase so digits elsewhere in the message (e.g. the clinic slug) are never matched.
  const match = msg && /login code is (\d{4,8})/.exec(msg.content);
  if (!match) throw new Error(`no OTP captured for ${patientId}`);
  return match[1];
}

describe('Patient portal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let tenantA: Tenant;
  let tenantB: Tenant;

  // patient A1 (fully enabled, password), A2 (enabled), C (not enabled)
  let a1: any;
  let a2: any;
  let notEnabled: any;
  let b1: any;
  let a1Pwd: string;
  let a2Pwd: string;
  let b1Pwd: string;

  beforeAll(async () => {
    assertTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StripeService)
      .useValue(stripe)
      .overrideProvider(SmsService)
      .useValue(sms)
      .compile();
    app = moduleRef.createNestApplication({ logger: ['error', 'warn'], rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);

    tenantA = await createTenant(app, prisma, 'Portal A');
    tenantB = await createTenant(app, prisma, 'Portal B');

    a1 = await createPatient(app, tenantA.receptionist, { phone: `9${Date.now().toString().slice(-9)}`, email: `a1.${tenantA.org.slug}@pt.test` });
    a2 = await createPatient(app, tenantA.receptionist, { phone: `8${Date.now().toString().slice(-9)}`, email: `a2.${tenantA.org.slug}@pt.test` });
    notEnabled = await createPatient(app, tenantA.receptionist, { email: `nc.${tenantA.org.slug}@pt.test` });
    b1 = await createPatient(app, tenantB.receptionist, { email: `b1.${tenantB.org.slug}@pt.test` });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  // =====================================================================
  describe('staff enablement (RBAC)', () => {
    it('rejects staff without patients.portal (Doctor) → 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portal/admin/patients/${a1.id}/enable`)
        .set(auth(tenantA.doctor))
        .send({});
      expect(res.status).toBe(403);
    });

    it('owner enables portal (password) and returns a one-time password once', async () => {
      const r1 = await request(app.getHttpServer())
        .post(`/api/v1/portal/admin/patients/${a1.id}/enable`)
        .set(auth(tenantA.owner))
        .send({ mode: 'password' });
      expect(r1.status).toBe(200);
      expect(r1.body.data.portalEnabled).toBe(true);
      expect(typeof r1.body.data.temporaryPassword).toBe('string');
      a1Pwd = r1.body.data.temporaryPassword;

      const r2 = await request(app.getHttpServer())
        .post(`/api/v1/portal/admin/patients/${a2.id}/enable`)
        .set(auth(tenantA.receptionist))
        .send({ mode: 'password' });
      expect(r2.status).toBe(200);
      a2Pwd = r2.body.data.temporaryPassword;

      const rb = await request(app.getHttpServer())
        .post(`/api/v1/portal/admin/patients/${b1.id}/enable`)
        .set(auth(tenantB.owner))
        .send({ mode: 'password' });
      expect(rb.status).toBe(200);
      b1Pwd = rb.body.data.temporaryPassword;
    });

    it('a clinic cannot enable the portal for another clinic\'s patient → 404', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portal/admin/patients/${b1.id}/enable`)
        .set(auth(tenantA.owner))
        .send({});
      expect(res.status).toBe(404);
    });

    it('branch-level staff cannot enable a portal for a patient in another branch (same tenant); org-wide can', async () => {
      // Owner (org-wide) creates a second branch and a patient in it.
      const branchRes = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set(auth(tenantA.owner))
        .send({ name: uniq('Branch B'), timezone: 'Asia/Kolkata' });
      expect(branchRes.status).toBe(201);
      const otherBranchId = branchRes.body.data.id;

      const patRes = await request(app.getHttpServer())
        .post('/api/v1/patients')
        .set(auth(tenantA.owner))
        .set('X-Branch-Id', otherBranchId)
        .send({ firstName: 'Branch', lastName: uniq('B'), gender: 'MALE', phone: `9${Math.floor(1e8 + Math.random() * 8e8)}` });
      expect(patRes.status).toBe(201);
      const otherBranchPatient = patRes.body.data.id;

      // The receptionist is pinned to the main branch → must not reach this patient.
      const denied = await request(app.getHttpServer())
        .post(`/api/v1/portal/admin/patients/${otherBranchPatient}/enable`)
        .set(auth(tenantA.receptionist))
        .send({ mode: 'password' });
      expect(denied.status).toBe(404);

      // The owner is org-wide → may enable it.
      const allowed = await request(app.getHttpServer())
        .post(`/api/v1/portal/admin/patients/${otherBranchPatient}/enable`)
        .set(auth(tenantA.owner))
        .send({ mode: 'password' });
      expect(allowed.status).toBe(200);
    });
  });

  // =====================================================================
  describe('authentication & token separation', () => {
    it('logs in with clinic slug + identifier + password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/login')
        .send({ clinicSlug: tenantA.org.slug, identifier: a1.email, password: a1Pwd });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.patient.id).toBe(a1.id);
      expect(res.body.data.patient.organization.slug).toBe(tenantA.org.slug);
    });

    it('rejects a wrong password with a generic error (no enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/login')
        .send({ clinicSlug: tenantA.org.slug, identifier: a1.email, password: 'wrong-password' });
      expect(res.status).toBe(401);
    });

    it('a NOT-enabled patient cannot log in → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/login')
        .send({ clinicSlug: tenantA.org.slug, identifier: notEnabled.email, password: 'anything' });
      expect(res.status).toBe(401);
    });

    it('a patient token is REJECTED by a staff endpoint (GET /patients) → 401', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const res = await request(app.getHttpServer()).get('/api/v1/patients').set(pauth(accessToken));
      expect(res.status).toBe(401);
    });

    it('a staff token is REJECTED by portal endpoints → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/portal/me').set(auth(tenantA.owner));
      expect(res.status).toBe(401);
    });

    it('no token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/portal/me');
      expect(res.status).toBe(401);
    });
  });

  // =====================================================================
  describe('profile (own data only)', () => {
    it('GET /portal/me returns the authenticated patient only', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const res = await request(app.getHttpServer()).get('/api/v1/portal/me').set(pauth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(a1.id);
    });

    it('PATCH /portal/me updates contact fields', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const res = await request(app.getHttpServer())
        .patch('/api/v1/portal/me')
        .set(pauth(accessToken))
        .send({ preferredChannel: 'WHATSAPP', address: { city: 'Mumbai', addressLine1: '1 Test Rd' } });
      expect(res.status).toBe(200);
      expect(res.body.data.preferredChannel).toBe('WHATSAPP');
      expect(res.body.data.address.city).toBe('Mumbai');
    });
  });

  // =====================================================================
  describe('cross-patient & cross-tenant isolation', () => {
    let a2Invoice: any;
    let a2Rx: any;
    let a2Doc: any;
    let a2Appt: any;

    beforeAll(async () => {
      a2Invoice = await prisma.invoice.create({
        data: {
          organizationId: tenantA.org.id,
          branchId: tenantA.branch.id,
          patientId: a2.id,
          invoiceNumber: `INV-X-${uniq('n')}`,
          subtotal: 500,
          total: 500,
          status: 'SENT',
        },
      });
      a2Rx = await prisma.prescription.create({
        data: {
          organizationId: tenantA.org.id,
          branchId: tenantA.branch.id,
          patientId: a2.id,
          doctorId: tenantA.doctor.id,
          status: 'ACTIVE',
          items: { create: [{ organizationId: tenantA.org.id, branchId: tenantA.branch.id, medicineName: 'Secret-Med' }] },
        },
      });
      a2Doc = await prisma.medicalDocument.create({
        data: {
          organizationId: tenantA.org.id,
          branchId: tenantA.branch.id,
          patientId: a2.id,
          uploadedBy: tenantA.doctor.id,
          documentType: 'LAB_REPORT',
          title: 'A2 private report',
          fileUrl: '/x',
          storageKey: null,
        },
      });
      const slot = futureSlot(3, 11);
      a2Appt = await prisma.appointment.create({
        data: {
          organizationId: tenantA.org.id,
          branchId: tenantA.branch.id,
          patientId: a2.id,
          doctorId: tenantA.doctor.id,
          scheduledStart: new Date(slot.scheduledStart),
          scheduledEnd: new Date(slot.scheduledEnd),
          status: 'SCHEDULED',
        },
      });
    });

    it('A1 cannot read A2 invoice/prescription/document/appointment → 404', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const h = pauth(accessToken);
      expect((await request(app.getHttpServer()).get(`/api/v1/portal/invoices/${a2Invoice.id}`).set(h)).status).toBe(404);
      expect((await request(app.getHttpServer()).get(`/api/v1/portal/prescriptions/${a2Rx.id}/download`).set(h)).status).toBe(404);
      expect((await request(app.getHttpServer()).get(`/api/v1/portal/documents/${a2Doc.id}/download`).set(h)).status).toBe(404);
      expect((await request(app.getHttpServer()).delete(`/api/v1/portal/appointments/${a2Appt.id}`).set(h).send({})).status).toBe(404);
    });

    it('A1 appointment/invoice lists never include A2 rows', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const h = pauth(accessToken);
      const appts = await request(app.getHttpServer()).get('/api/v1/portal/appointments').set(h);
      const all = [...appts.body.data.upcoming, ...appts.body.data.past];
      expect(all.every((x: any) => x.patientId === a1.id)).toBe(true);
      const inv = await request(app.getHttpServer()).get('/api/v1/portal/invoices').set(h);
      expect(inv.body.data.find((x: any) => x.id === a2Invoice.id)).toBeUndefined();
    });

    it('cross-tenant: B1 cannot read clinic A data → 404', async () => {
      const { accessToken } = await loginPatient(tenantB.org.slug, b1.email, b1Pwd);
      const res = await request(app.getHttpServer()).get(`/api/v1/portal/invoices/${a2Invoice.id}`).set(pauth(accessToken));
      expect(res.status).toBe(404);
    });
  });

  // =====================================================================
  describe('self-booking respects conflicts', () => {
    it('books a slot, then rejects an overlapping slot → 409, rejects the past → 400', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const h = pauth(accessToken);
      const slot = futureSlot(5, 9, 30);

      const ok = await request(app.getHttpServer())
        .post('/api/v1/portal/appointments')
        .set(h)
        .send({ doctorId: tenantA.doctor.id, ...slot });
      expect([200, 201]).toContain(ok.status);
      expect(ok.body.data.appointmentSource).toBe('PORTAL');
      expect(ok.body.data.patientId).toBe(a1.id);

      const clash = await request(app.getHttpServer())
        .post('/api/v1/portal/appointments')
        .set(h)
        .send({ doctorId: tenantA.doctor.id, ...slot });
      expect(clash.status).toBe(409);

      const past = await request(app.getHttpServer())
        .post('/api/v1/portal/appointments')
        .set(h)
        .send({ doctorId: tenantA.doctor.id, scheduledStart: '2020-01-01T10:00:00.000Z', scheduledEnd: '2020-01-01T10:30:00.000Z' });
      expect(past.status).toBe(400);
    });

    it('patient can cancel their own upcoming appointment', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const h = pauth(accessToken);
      const slot = futureSlot(6, 14);
      const made = await request(app.getHttpServer()).post('/api/v1/portal/appointments').set(h).send({ doctorId: tenantA.doctor.id, ...slot });
      const cancel = await request(app.getHttpServer()).delete(`/api/v1/portal/appointments/${made.body.data.id}`).set(h).send({});
      expect(cancel.status).toBe(200);
      expect(cancel.body.data.status).toBe('CANCELLED');
    });
  });

  // =====================================================================
  describe('prescriptions & documents (own, with download)', () => {
    it('downloads own prescription PDF and own document', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const h = pauth(accessToken);

      const rx = await prisma.prescription.create({
        data: {
          organizationId: tenantA.org.id,
          branchId: tenantA.branch.id,
          patientId: a1.id,
          doctorId: tenantA.doctor.id,
          status: 'ACTIVE',
          items: { create: [{ organizationId: tenantA.org.id, branchId: tenantA.branch.id, medicineName: 'Paracetamol', dosage: '500mg' }] },
        },
      });
      const pdf = await request(app.getHttpServer()).get(`/api/v1/portal/prescriptions/${rx.id}/download`).set(h);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');

      const key = `org/${tenantA.org.id}/documents/${uniq('d')}.txt`;
      await storage.put(key, Buffer.from('lab result'), 'text/plain');
      const doc = await prisma.medicalDocument.create({
        data: {
          organizationId: tenantA.org.id,
          branchId: tenantA.branch.id,
          patientId: a1.id,
          uploadedBy: tenantA.doctor.id,
          documentType: 'LAB_REPORT',
          title: 'A1 report',
          fileUrl: '/x',
          storageKey: key,
          mimeType: 'text/plain',
          fileSize: 10,
        },
      });
      const dl = await request(app.getHttpServer()).get(`/api/v1/portal/documents/${doc.id}/download`).set(h);
      expect(dl.status).toBe(200);
    });
  });

  // =====================================================================
  describe('invoices & online payment', () => {
    let invoice: any;
    beforeAll(async () => {
      invoice = await prisma.invoice.create({
        data: {
          organizationId: tenantA.org.id,
          branchId: tenantA.branch.id,
          patientId: a1.id,
          invoiceNumber: `INV-PAY-${uniq('n')}`,
          subtotal: 750,
          total: 750,
          status: 'SENT',
        },
      });
    });

    it('reads an own invoice detail with computed balance', async () => {
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const res = await request(app.getHttpServer()).get(`/api/v1/portal/invoices/${invoice.id}`).set(pauth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(invoice.id);
      expect(res.body.data.balance).toBe('750.00');
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('creates a Stripe pay-link for an own unpaid invoice', async () => {
      stripe._enabled = true;
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const res = await request(app.getHttpServer()).post(`/api/v1/portal/invoices/${invoice.id}/pay-link`).set(pauth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.url).toContain('https://stripe.test/');
    });

    it('returns 400 when online payments are not configured', async () => {
      stripe._enabled = false;
      const { accessToken } = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const res = await request(app.getHttpServer()).post(`/api/v1/portal/invoices/${invoice.id}/pay-link`).set(pauth(accessToken));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not configured/i);
      stripe._enabled = true;
    });
  });

  // =====================================================================
  describe('OTP login', () => {
    it('requests + verifies an OTP (SMS mocked)', async () => {
      const reqRes = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/otp/request')
        .send({ clinicSlug: tenantA.org.slug, identifier: a2.email });
      expect(reqRes.status).toBe(200);
      const code = otpFor(a2.id);

      const bad = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/otp/verify')
        .send({ clinicSlug: tenantA.org.slug, identifier: a2.email, code: '000000' === code ? '111111' : '000000' });
      expect(bad.status).toBe(401);

      const good = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/otp/verify')
        .send({ clinicSlug: tenantA.org.slug, identifier: a2.email, code });
      expect(good.status).toBe(200);
      expect(good.body.data.patient.id).toBe(a2.id);
    });

    it('OTP request for an unknown account still returns a generic 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/otp/request')
        .send({ clinicSlug: tenantA.org.slug, identifier: 'nobody@nowhere.test' });
      expect(res.status).toBe(200);
    });
  });

  // =====================================================================
  describe('refresh, logout & disablement revoke sessions', () => {
    it('rotates the refresh token and invalidates the old one', async () => {
      const first = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const r = await request(app.getHttpServer()).post('/api/v1/portal/auth/refresh').send({ refreshToken: first.refreshToken });
      expect(r.status).toBe(200);
      expect(r.body.data.refreshToken).not.toBe(first.refreshToken);
      const reuse = await request(app.getHttpServer()).post('/api/v1/portal/auth/refresh').send({ refreshToken: first.refreshToken });
      expect(reuse.status).toBe(401);
    });

    it('logout revokes the session immediately', async () => {
      const s = await loginPatient(tenantA.org.slug, a1.email, a1Pwd);
      const h = pauth(s.accessToken);
      expect((await request(app.getHttpServer()).get('/api/v1/portal/me').set(h)).status).toBe(200);
      await request(app.getHttpServer()).post('/api/v1/portal/auth/logout').send({ refreshToken: s.refreshToken });
      expect((await request(app.getHttpServer()).get('/api/v1/portal/me').set(h)).status).toBe(401);
    });

    it('disabling the portal kills live sessions and blocks new logins', async () => {
      // Dedicated patient so other tests keep working.
      const p = await createPatient(app, tenantA.receptionist, { email: `dis.${uniq('p')}@pt.test` });
      const pwd = await enablePatient(tenantA.owner, p.id);
      const s = await loginPatient(tenantA.org.slug, p.email, pwd);
      const h = pauth(s.accessToken);
      expect((await request(app.getHttpServer()).get('/api/v1/portal/me').set(h)).status).toBe(200);

      const dis = await request(app.getHttpServer())
        .post(`/api/v1/portal/admin/patients/${p.id}/disable`)
        .set(auth(tenantA.owner))
        .send({});
      expect(dis.status).toBe(200);
      expect(dis.body.data.portalEnabled).toBe(false);

      expect((await request(app.getHttpServer()).get('/api/v1/portal/me').set(h)).status).toBe(401);
      const relogin = await request(app.getHttpServer())
        .post('/api/v1/portal/auth/login')
        .send({ clinicSlug: tenantA.org.slug, identifier: p.email, password: pwd });
      expect(relogin.status).toBe(401);
    });
  });

  // ---- helpers -------------------------------------------------------------
  async function loginPatient(clinicSlug: string, identifier: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portal/auth/login')
      .send({ clinicSlug, identifier, password });
    if (res.status !== 200) throw new Error(`portal login failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data as { accessToken: string; refreshToken: string; patient: any };
  }

  async function enablePatient(owner: Tenant['owner'], patientId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portal/admin/patients/${patientId}/enable`)
      .set(auth(owner))
      .send({ mode: 'password' });
    if (res.status !== 200) throw new Error(`enable failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data.temporaryPassword;
  }
});
