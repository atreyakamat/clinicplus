/**
 * Billing: invoices, manual payments, refunds, void rules, reports and RBAC / tenant isolation.
 * Runs with PAYMENTS_PROVIDER unset (= none); Stripe flows live in payments-stripe.e2e-spec.ts.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createPatient, createTenant, createTestApp, Tenant, TenantUser } from './helpers/app';

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  let patientB: any;
  let service: any;

  const http = () => request(app.getHttpServer());
  const get = (u: TenantUser, url: string) => http().get(url).set(auth(u));
  const post = (u: TenantUser, url: string, body: any = {}) => http().post(url).set(auth(u)).send(body);
  const patch = (u: TenantUser, url: string, body: any = {}) => http().patch(url).set(auth(u)).send(body);

  async function newInvoice(u: TenantUser, body: any = {}) {
    const res = await post(u, '/api/v1/invoices', {
      patientId: patient.id,
      items: [{ itemName: 'Consultation', quantity: 1, unitPrice: 500 }],
      issue: true,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'BillA');
    B = await createTenant(app, prisma, 'BillB', { roles: ['Organization Owner', 'Accountant', 'Receptionist'] });
    patient = await createPatient(app, A.receptionist);
    patientB = await createPatient(app, B.receptionist);
    service = await prisma.clinicService.create({
      data: { organizationId: A.org.id, name: 'Dental cleaning', price: '1499.99', duration: 30 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('invoices', () => {
    let draft: any;

    it('creates a draft with catalog + free-text lines and exact decimal totals', async () => {
      const res = await post(A.receptionist, '/api/v1/invoices', {
        patientId: patient.id,
        items: [
          { serviceId: service.id, quantity: 2 },
          { itemName: 'Gauze', quantity: 3, unitPrice: 0.1 },
          { itemName: 'Swab', quantity: 1, unitPrice: 0.2 },
        ],
        discount: 0.3,
        tax: 18.05,
      });
      expect(res.status).toBe(201);
      draft = res.body.data;
      expect(draft.status).toBe('DRAFT');
      expect(draft.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
      expect(Number(draft.subtotal)).toBeCloseTo(3000.48, 2);
      expect(String(draft.subtotal)).toBe('3000.48');
      expect(String(draft.total)).toBe('3018.23');
      const line = draft.items.find((i: any) => i.serviceId === service.id);
      expect(line.itemName).toBe('Dental cleaning');
      expect(String(line.unitPrice)).toBe('1499.99');
      expect(draft.amountPaid).toBe('0.00');
      expect(draft.balance).toBe('3018.23');
    });

    it('allows overriding the catalog price', async () => {
      const inv = await newInvoice(A.receptionist, { items: [{ serviceId: service.id, quantity: 1, unitPrice: 1000 }] });
      expect(String(inv.total)).toBe('1000');
    });

    it('rejects invalid input (no items, discount > subtotal, foreign service, free text without price)', async () => {
      expect((await post(A.receptionist, '/api/v1/invoices', { patientId: patient.id, items: [] })).status).toBe(400);
      expect(
        (await post(A.receptionist, '/api/v1/invoices', {
          patientId: patient.id,
          items: [{ itemName: 'X', quantity: 1, unitPrice: 10 }],
          discount: 11,
        })).status,
      ).toBe(400);
      expect(
        (await post(A.receptionist, '/api/v1/invoices', { patientId: patient.id, items: [{ itemName: 'X', quantity: 1 }] })).status,
      ).toBe(400);
      const foreign = await prisma.clinicService.create({ data: { organizationId: B.org.id, name: 'B svc', price: 5 } });
      expect(
        (await post(A.receptionist, '/api/v1/invoices', { patientId: patient.id, items: [{ serviceId: foreign.id, quantity: 1 }] })).status,
      ).toBe(404);
      // mass-assignment of totals/tenant ids is stripped
      const res = await post(A.receptionist, '/api/v1/invoices', {
        patientId: patient.id,
        items: [{ itemName: 'X', quantity: 1, unitPrice: 10 }],
        total: 1,
        organizationId: B.org.id,
      });
      expect(res.status).toBe(201);
      expect(String(res.body.data.total)).toBe('10');
      expect(res.body.data.organizationId).toBe(A.org.id);
    });

    it('updates a draft and recalculates totals; marks it sent', async () => {
      const res = await patch(A.accountant, `/api/v1/invoices/${draft.id}`, {
        items: [{ itemName: 'Consultation', quantity: 2, unitPrice: 250.25 }],
        discount: 0.5,
        tax: 0,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe('500');
      expect(res.body.data.items).toHaveLength(1);
      // receptionist may create but not edit
      expect((await patch(A.receptionist, `/api/v1/invoices/${draft.id}`, { notes: 'x' })).status).toBe(403);
      const sent = await post(A.accountant, `/api/v1/invoices/${draft.id}/send`);
      expect(sent.status).toBe(201);
      expect(sent.body.data.status).toBe('SENT');
    });

    it('lists with filters and pagination', async () => {
      const res = await get(A.accountant, `/api/v1/invoices?patientId=${patient.id}&limit=2&page=1`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data[0]).toHaveProperty('balance');
      const drafts = await get(A.accountant, '/api/v1/invoices?status=DRAFT');
      expect(drafts.body.data.every((i: any) => i.status === 'DRAFT')).toBe(true);
      const open = await get(A.accountant, '/api/v1/invoices?outstanding=true&limit=200');
      expect(open.body.data.every((i: any) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status))).toBe(true);
      const search = await get(A.accountant, `/api/v1/invoices?search=${draft.invoiceNumber}`);
      expect(search.body.data.map((i: any) => i.id)).toEqual([draft.id]);
    });

    it('marks past-due unpaid invoices OVERDUE', async () => {
      const inv = await newInvoice(A.receptionist, { dueDate: new Date(Date.now() - 3 * 86_400_000).toISOString() });
      expect(inv.status).toBe('OVERDUE');
      const res = await get(A.accountant, '/api/v1/invoices?status=OVERDUE&limit=200');
      expect(res.body.data.map((i: any) => i.id)).toContain(inv.id);
    });

    it('downloads a PDF', async () => {
      const res = await get(A.accountant, `/api/v1/invoices/${draft.id}/download`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('exposes the service catalog to invoice creators', async () => {
      const res = await get(A.receptionist, '/api/v1/invoices/catalog');
      expect(res.status).toBe(200);
      expect(res.body.data.map((s: any) => s.id)).toContain(service.id);
      expect((await get(A.doctor, '/api/v1/invoices/catalog')).status).toBe(403);
    });
  });

  describe('payments, refunds and void', () => {
    let inv: any;
    let cashPayment: any;

    beforeAll(async () => {
      inv = await newInvoice(A.receptionist, {
        items: [{ itemName: 'Procedure', quantity: 1, unitPrice: 1000 }],
      });
    });

    it('records a partial payment (receptionist) and moves to PARTIALLY_PAID', async () => {
      const res = await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, { amount: 400.1, paymentMethod: 'CASH' });
      expect(res.status).toBe(201);
      cashPayment = res.body.data;
      expect(cashPayment.paymentStatus).toBe('PAID');
      const after = await get(A.accountant, `/api/v1/invoices/${inv.id}`);
      expect(after.body.data.status).toBe('PARTIALLY_PAID');
      expect(after.body.data.amountPaid).toBe('400.10');
      expect(after.body.data.balance).toBe('599.90');
    });

    it('rejects overpayment and invalid amounts', async () => {
      const over = await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, { amount: 599.91, paymentMethod: 'UPI' });
      expect(over.status).toBe(400);
      expect(over.body.message).toMatch(/exceeds the outstanding balance/);
      expect((await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, { amount: -5, paymentMethod: 'CASH' })).status).toBe(400);
      expect((await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, { amount: 1.001, paymentMethod: 'CASH' })).status).toBe(400);
      expect((await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, { amount: 1, paymentMethod: 'STRIPE' })).status).toBe(400);
    });

    it('honours idempotency keys', async () => {
      const body = { amount: 99.9, paymentMethod: 'CARD', idempotencyKey: `pay-${inv.id}` };
      const first = await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, body);
      const second = await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(2);
    });

    it('cannot edit or void an invoice that has payments', async () => {
      expect((await patch(A.accountant, `/api/v1/invoices/${inv.id}`, { discount: 10 })).status).toBe(400);
      const v = await post(A.accountant, `/api/v1/invoices/${inv.id}/void`, { reason: 'Mistake' });
      expect(v.status).toBe(400);
      expect(v.body.message).toMatch(/refund/i);
    });

    it('pays in full -> PAID; further payments rejected', async () => {
      const res = await post(A.receptionist, '/api/v1/payments', { invoiceId: inv.id, amount: 500, paymentMethod: 'UPI' });
      expect(res.status).toBe(201);
      const after = await get(A.accountant, `/api/v1/invoices/${inv.id}`);
      expect(after.body.data.status).toBe('PAID');
      expect(after.body.data.balance).toBe('0.00');
      expect((await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, { amount: 1, paymentMethod: 'CASH' })).status).toBe(400);
    });

    it('refunds require payments.refund (receptionist 403) and cannot exceed the payment', async () => {
      expect(
        (await post(A.receptionist, `/api/v1/payments/${cashPayment.id}/refund`, { amount: 10, reason: 'x' })).status,
      ).toBe(403);
      expect(
        (await post(A.accountant, `/api/v1/payments/${cashPayment.id}/refund`, { amount: 400.11, reason: 'too much' })).status,
      ).toBe(400);
      expect((await post(A.accountant, `/api/v1/payments/${cashPayment.id}/refund`, { amount: 10 })).status).toBe(400);
    });

    it('records a cash refund and reopens the balance', async () => {
      const r1 = await post(A.accountant, `/api/v1/payments/${cashPayment.id}/refund`, { amount: 100.1, reason: 'Partial' });
      expect(r1.status).toBe(201);
      expect(r1.body.data.status).toBe('COMPLETED');
      let inv2 = (await get(A.accountant, `/api/v1/invoices/${inv.id}`)).body.data;
      expect(inv2.status).toBe('PARTIALLY_PAID');
      expect(inv2.amountPaid).toBe('899.90');
      const pay = (await get(A.accountant, `/api/v1/payments/${cashPayment.id}`)).body.data;
      expect(pay.paymentStatus).toBe('PARTIALLY_REFUNDED');
      const r2 = await post(A.accountant, `/api/v1/payments/${cashPayment.id}/refund`, { amount: 300.01, reason: 'Rest' });
      expect(r2.status).toBe(400); // only 300.00 left on this payment
      expect((await post(A.accountant, `/api/v1/payments/${cashPayment.id}/refund`, { amount: 300, reason: 'Rest' })).status).toBe(201);
      inv2 = (await get(A.accountant, `/api/v1/invoices/${inv.id}`)).body.data;
      expect(inv2.amountPaid).toBe('599.90');
    });

    it('voids only after every payment is refunded; void requires a reason and blocks payments', async () => {
      const payments = await prisma.payment.findMany({ where: { invoiceId: inv.id, paymentStatus: 'PAID' } });
      for (const p of payments) {
        const res = await post(A.owner, `/api/v1/payments/${p.id}/refund`, { amount: Number(p.amount), reason: 'Cancel visit' });
        expect(res.status).toBe(201);
      }
      expect((await get(A.accountant, `/api/v1/invoices/${inv.id}`)).body.data.amountPaid).toBe('0.00');
      expect((await post(A.receptionist, `/api/v1/invoices/${inv.id}/void`, { reason: 'x' })).status).toBe(403);
      expect((await post(A.accountant, `/api/v1/invoices/${inv.id}/void`, {})).status).toBe(400);
      const v = await post(A.accountant, `/api/v1/invoices/${inv.id}/void`, { reason: 'Visit cancelled' });
      expect(v.status).toBe(201);
      expect(v.body.data.status).toBe('VOID');
      expect(v.body.data.voidReason).toBe('Visit cancelled');
      expect((await post(A.receptionist, `/api/v1/invoices/${inv.id}/payments`, { amount: 1, paymentMethod: 'CASH' })).status).toBe(400);
      expect((await post(A.accountant, `/api/v1/invoices/${inv.id}/void`, { reason: 'again' })).status).toBe(400);
    });

    it('payment link without a provider -> 400 "Online payments are not configured"', async () => {
      const open = await newInvoice(A.receptionist);
      const res = await post(A.receptionist, `/api/v1/invoices/${open.id}/payment-link`, {});
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Online payments are not configured');
      const cfg = await get(A.receptionist, '/api/v1/invoices/config');
      expect(cfg.body.data.onlinePayments).toBe(false);
    });

    it('public status endpoint exposes no PII', async () => {
      const res = await http().get(`/api/v1/public/payments/status?invoice=${inv.id}`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(['amountPaid', 'clinicName', 'status']);
      expect(res.body.data.status).toBe('VOID');
      expect((await http().get('/api/v1/public/payments/status?invoice=00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await http().get('/api/v1/public/payments/status?invoice=nope')).status).toBe(400);
    });
  });

  describe('RBAC and tenant isolation', () => {
    let invA: any;
    let payA: any;

    beforeAll(async () => {
      invA = await newInvoice(A.receptionist);
      payA = (await post(A.receptionist, `/api/v1/invoices/${invA.id}/payments`, { amount: 100, paymentMethod: 'CASH' })).body.data;
    });

    it('doctor and nurse cannot see invoices or payments', async () => {
      expect((await get(A.doctor, '/api/v1/invoices')).status).toBe(403);
      expect((await get(A.doctor, `/api/v1/invoices/${invA.id}`)).status).toBe(403);
      expect((await get(A.nurse, '/api/v1/payments')).status).toBe(403);
      expect((await post(A.doctor, `/api/v1/invoices/${invA.id}/payments`, { amount: 1, paymentMethod: 'CASH' })).status).toBe(403);
    });

    it('tenant B gets 404 for tenant A ids', async () => {
      expect((await get(B.accountant, `/api/v1/invoices/${invA.id}`)).status).toBe(404);
      expect((await get(B.accountant, `/api/v1/invoices/${invA.id}/download`)).status).toBe(404);
      expect((await patch(B.owner, `/api/v1/invoices/${invA.id}`, { notes: 'x' })).status).toBe(404);
      expect((await post(B.owner, `/api/v1/invoices/${invA.id}/void`, { reason: 'x' })).status).toBe(404);
      expect((await post(B.receptionist, `/api/v1/invoices/${invA.id}/payments`, { amount: 1, paymentMethod: 'CASH' })).status).toBe(404);
      expect((await get(B.accountant, `/api/v1/payments/${payA.id}`)).status).toBe(404);
      expect((await post(B.accountant, `/api/v1/payments/${payA.id}/refund`, { amount: 1, reason: 'x' })).status).toBe(404);
      // B cannot bill A's patient
      expect(
        (await post(B.receptionist, '/api/v1/invoices', { patientId: patient.id, items: [{ itemName: 'x', quantity: 1, unitPrice: 1 }] })).status,
      ).toBe(404);
      const list = await get(B.accountant, '/api/v1/invoices?limit=200');
      expect(list.body.data.map((i: any) => i.id)).not.toContain(invA.id);
      void patientB;
    });
  });

  describe('reports', () => {
    it('RBAC: doctor/receptionist cannot view reports; manager cannot export', async () => {
      expect((await get(A.doctor, '/api/v1/reports/outstanding')).status).toBe(403);
      expect((await get(A.receptionist, '/api/v1/reports/daily-close')).status).toBe(403);
      expect((await get(A.manager, '/api/v1/reports/ageing')).status).toBe(200);
      expect((await get(A.manager, '/api/v1/reports/outstanding/export')).status).toBe(403);
      expect((await get(A.manager, '/api/v1/reports/outstanding?scope=org')).status).toBe(403); // not org-wide
    });

    it('outstanding receivables per patient', async () => {
      const res = await get(A.accountant, '/api/v1/reports/outstanding');
      expect(res.status).toBe(200);
      const row = res.body.data.rows.find((r: any) => r.patientId === patient.id);
      expect(row).toBeDefined();
      const fromInvoices = await get(A.accountant, `/api/v1/invoices?patientId=${patient.id}&outstanding=true&limit=200`);
      const expected = fromInvoices.body.data.reduce((s: number, i: any) => s + Number(i.balance) * 100, 0) / 100;
      expect(Number(row.outstanding)).toBeCloseTo(expected, 2);
      expect(res.body.data.rows.some((r: any) => r.patientId === patientB.id)).toBe(false);
    });

    it('AR ageing buckets', async () => {
      const res = await get(A.accountant, '/api/v1/reports/ageing');
      expect(res.status).toBe(200);
      expect(res.body.data.buckets.map((b: any) => b.bucket)).toEqual(['0-30', '31-60', '61-90', '90+']);
      const sum = res.body.data.buckets.reduce((s: number, b: any) => s + Number(b.amount) * 100, 0) / 100;
      expect(sum).toBeCloseTo(Number(res.body.data.total), 2);
    });

    it('daily close: collections by method, refunds and invoices raised', async () => {
      const res = await get(A.accountant, '/api/v1/reports/daily-close');
      expect(res.status).toBe(200);
      const d = res.body.data;
      const byMethod = Object.fromEntries(d.collections.map((c: any) => [c.method, Number(c.amount)]));
      expect(byMethod.CASH).toBeGreaterThanOrEqual(500.1);
      expect(byMethod.UPI).toBeGreaterThanOrEqual(500);
      expect(Number(d.totalRefunded)).toBeGreaterThanOrEqual(1000);
      expect(d.invoices.raisedCount).toBeGreaterThan(0);
      expect(d.invoices.voidedCount).toBeGreaterThanOrEqual(1);
      const y = await get(A.accountant, '/api/v1/reports/daily-close?date=2001-01-01');
      expect(y.body.data.totalCollected).toBe('0.00');
    });

    it('revenue by method / service / doctor', async () => {
      const m = await get(A.accountant, '/api/v1/reports/revenue?groupBy=method');
      expect(m.status).toBe(200);
      expect(m.body.data.rows.map((r: any) => r.key)).toEqual(expect.arrayContaining(['CASH', 'UPI']));
      const s = await get(A.accountant, '/api/v1/reports/revenue?groupBy=service');
      expect(s.body.data.rows.find((r: any) => r.key === service.id)).toBeDefined();
      const d = await get(A.accountant, '/api/v1/reports/revenue?groupBy=doctor');
      expect(d.status).toBe(200);
      expect(d.body.data.rows.length).toBeGreaterThan(0);
      expect((await get(A.accountant, '/api/v1/reports/revenue?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    });

    it('CSV export (accountant) and org-wide consolidation (owner)', async () => {
      const csv = await get(A.accountant, '/api/v1/reports/outstanding/export');
      expect(csv.status).toBe(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.split('\n')[0]).toContain('Outstanding');
      expect((await get(A.accountant, '/api/v1/reports/nope/export')).status).toBe(400);
      const org = await get(A.owner, '/api/v1/reports/daily-close?scope=org');
      expect(org.status).toBe(200);
      expect(org.body.data.scope).toBe('org');
    });
  });
});
