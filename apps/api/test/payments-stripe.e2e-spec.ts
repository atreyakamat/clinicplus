/**
 * Stripe online payments (PAYMENTS_PROVIDER=stripe). No network: StripeService API
 * calls are jest spies; webhook signatures are real HMACs over the raw body.
 */
import { STRIPE_TEST_ENV, restoreStripeEnv } from './helpers/stripe-env';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import Stripe from 'stripe';
import { PrismaService } from '../src/prisma/prisma.service';
import { StripeService } from '../src/payments/stripe.service';
import { auth, createPatient, createTenant, createTestApp, Tenant } from './helpers/app';

describe('Payments — Stripe checkout, webhook and refunds (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stripeSvc: StripeService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  let invoice: any;
  const signer = new Stripe('sk_test_signer_only');
  const http = () => request(app.getHttpServer());

  const sign = (payload: string, secret: string = STRIPE_TEST_ENV.STRIPE_WEBHOOK_SECRET) =>
    signer.webhooks.generateTestHeaderString({ payload, secret });
  const deliver = (event: object, secret?: string) => {
    const payload = JSON.stringify(event);
    return http()
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload, secret))
      .send(payload);
  };

  const session = (over: Record<string, any> = {}) => ({
    id: 'cs_test_' + Math.random().toString(36).slice(2),
    object: 'checkout.session',
    status: 'open',
    url: 'https://checkout.stripe.test/pay/abc',
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    amount_total: 150000,
    currency: 'inr',
    mode: 'payment',
    payment_status: 'unpaid',
    payment_intent: null,
    ...over,
  });

  let createSpy: jest.SpyInstance;
  let retrieveSpy: jest.SpyInstance;
  let expireSpy: jest.SpyInstance;
  let refundSpy: jest.SpyInstance;
  let listRefundsSpy: jest.SpyInstance;
  let created: any;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    stripeSvc = app.get(StripeService);
    createSpy = jest.spyOn(stripeSvc, 'createCheckoutSession').mockImplementation(async (params: any) => {
      created = session({ amount_total: params.line_items[0].price_data.unit_amount });
      return created;
    });
    retrieveSpy = jest.spyOn(stripeSvc, 'retrieveCheckoutSession').mockImplementation(async () => created);
    expireSpy = jest.spyOn(stripeSvc, 'expireCheckoutSession').mockResolvedValue(undefined);
    refundSpy = jest.spyOn(stripeSvc, 'createRefund');
    listRefundsSpy = jest.spyOn(stripeSvc, 'listRefundsForCharge');
    A = await createTenant(app, prisma, 'StrA', { roles: ['Organization Owner', 'Receptionist', 'Accountant', 'Doctor'] });
    B = await createTenant(app, prisma, 'StrB', { roles: ['Receptionist'] });
    patient = await createPatient(app, A.receptionist);
    const res = await http()
      .post('/api/v1/invoices')
      .set(auth(A.receptionist))
      .send({ patientId: patient.id, items: [{ itemName: 'Root canal', quantity: 1, unitPrice: 1500 }] });
    invoice = res.body.data;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
    restoreStripeEnv();
  });

  it('reports online payments as enabled', async () => {
    const cfg = await http().get('/api/v1/invoices/config').set(auth(A.receptionist));
    expect(cfg.body.data).toEqual({ currency: 'INR', onlinePayments: true });
  });

  it('creates a Checkout Session for the outstanding balance', async () => {
    const res = await http().post(`/api/v1/invoices/${invoice.id}/payment-link`).set(auth(A.receptionist)).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.url).toBe('https://checkout.stripe.test/pay/abc');
    expect(res.body.data.reused).toBe(false);
    const params = createSpy.mock.calls[0][0];
    expect(params.mode).toBe('payment');
    expect(params.line_items[0].price_data.currency).toBe('inr');
    expect(params.line_items[0].price_data.unit_amount).toBe(150000);
    expect(params.metadata).toEqual({ organizationId: A.org.id, branchId: A.branch.id, invoiceId: invoice.id });
    expect(params.success_url).toBe(`https://clinic.example.test/pay/result?status=success&invoice=${invoice.id}`);
    expect(params.cancel_url).toBe(`https://clinic.example.test/pay/result?status=cancelled&invoice=${invoice.id}`);
    const row = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(row!.stripeCheckoutSessionId).toBe(created.id);
    expect(row!.paymentLinkUrl).toBe(created.url);
    expect(row!.status).toBe('SENT'); // a draft is issued when a link is created
  });

  it('reuses an open, unexpired session for the same amount', async () => {
    const res = await http().post(`/api/v1/invoices/${invoice.id}/payment-link`).set(auth(A.receptionist)).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.reused).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(retrieveSpy).toHaveBeenCalled();
  });

  it('RBAC / tenant: doctor 403, other tenant 404', async () => {
    expect((await http().post(`/api/v1/invoices/${invoice.id}/payment-link`).set(auth(A.doctor)).send({})).status).toBe(403);
    expect((await http().post(`/api/v1/invoices/${invoice.id}/payment-link`).set(auth(B.receptionist)).send({})).status).toBe(404);
  });

  it('rejects webhooks with a bad or missing signature', async () => {
    const evt = { id: 'evt_bad_' + Date.now(), type: 'checkout.session.completed', data: { object: {} } };
    expect((await deliver(evt, 'whsec_wrong')).status).toBe(400);
    expect((await http().post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').send(evt)).status).toBe(400);
    expect(await prisma.webhookEvent.count({ where: { eventId: evt.id } })).toBe(0);
  });

  it('checkout.session.completed creates exactly one PAID payment, even when delivered twice', async () => {
    const completed = {
      id: 'evt_' + Date.now(),
      object: 'event',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          ...created,
          status: 'complete',
          payment_status: 'paid',
          payment_intent: 'pi_test_123' + Date.now(),
          metadata: { organizationId: A.org.id, branchId: A.branch.id, invoiceId: invoice.id },
        },
      },
    };
    const r1 = await deliver(completed);
    expect(r1.status).toBe(200);
    const r2 = await deliver(completed);
    expect(r2.status).toBe(200);
    expect(r2.body.data.duplicate).toBe(true);
    // a different event id for the same session is still idempotent (idempotencyKey = session id)
    const r3 = await deliver({ ...completed, id: completed.id + '_retry' });
    expect(r3.status).toBe(200);

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].paymentMethod).toBe('STRIPE');
    expect(payments[0].paymentStatus).toBe('PAID');
    expect(payments[0].amount.toFixed(2)).toBe('1500.00');
    expect(payments[0].idempotencyKey).toBe(created.id);
    expect(payments[0].transactionReference).toBe(completed.data.object.payment_intent);
    const inv = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe('PAID');
    expect(inv!.paymentLinkUrl).toBeNull();
    const evt = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: completed.id } },
    });
    expect(evt!.processedAt).not.toBeNull();
    expect(evt!.organizationId).toBe(A.org.id);

    const status = await http().get(`/api/v1/public/payments/status?invoice=${invoice.id}`);
    expect(status.body.data).toEqual({ status: 'PAID', amountPaid: '1500.00', clinicName: expect.any(String) });
  });

  it('payment link on a paid invoice -> 400', async () => {
    const res = await http().post(`/api/v1/invoices/${invoice.id}/payment-link`).set(auth(A.receptionist)).send({});
    expect(res.status).toBe(400);
  });

  it('refunding a STRIPE payment calls stripe.refunds.create (accountant only)', async () => {
    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    refundSpy.mockImplementation(async (params: any) => ({ id: 're_app_1', status: 'succeeded', ...params }));
    expect(
      (await http().post(`/api/v1/payments/${payment.id}/refund`).set(auth(A.receptionist)).send({ amount: 100, reason: 'x' })).status,
    ).toBe(403);
    const res = await http()
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set(auth(A.accountant))
      .send({ amount: 200, reason: 'Goodwill' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('COMPLETED');
    const [params, key] = refundSpy.mock.calls[0];
    expect(params.payment_intent).toBe(payment.transactionReference);
    expect(params.amount).toBe(20000);
    expect(params.metadata.refundId).toBe(res.body.data.id);
    expect(key).toBe(`refund-${res.body.data.id}`);
    const inv = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe('PARTIALLY_PAID');
  });

  it('a Stripe failure marks the refund FAILED and leaves the balance untouched', async () => {
    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    refundSpy.mockRejectedValueOnce(new Error('card_declined'));
    const res = await http()
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set(auth(A.accountant))
      .send({ amount: 50, reason: 'try' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Stripe refused/);
    const failed = await prisma.refund.findFirst({ where: { paymentId: payment.id, status: 'FAILED' } });
    expect(failed).not.toBeNull();
  });

  it('charge.refunded mirrors dashboard refunds once and skips ones made in-app', async () => {
    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    const appRefund = await prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id, status: 'COMPLETED' } });
    listRefundsSpy.mockResolvedValue([
      { id: 're_app_1', payment_intent: payment.transactionReference, amount: 20000, currency: 'inr', status: 'succeeded', metadata: { refundId: appRefund.id } },
      { id: 're_dash_9', payment_intent: payment.transactionReference, amount: 30000, currency: 'inr', status: 'succeeded', metadata: {} },
    ]);
    const evt = { id: 'evt_ref_' + Date.now(), type: 'charge.refunded', data: { object: { id: 'ch_1', object: 'charge' } } };
    expect((await deliver(evt)).status).toBe(200);
    expect((await deliver({ ...evt, id: evt.id + 'b' })).status).toBe(200);
    const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id, status: 'COMPLETED' } });
    expect(refunds.map((r) => r.amount.toFixed(2)).sort()).toEqual(['200.00', '300.00']);
    const detail = await http().get(`/api/v1/invoices/${invoice.id}`).set(auth(A.accountant));
    expect(detail.body.data.amountPaid).toBe('1000.00');
    expect(detail.body.data.status).toBe('PARTIALLY_PAID');
  });

  it('a manual payment retires the open Stripe session', async () => {
    const res = await http()
      .post('/api/v1/invoices')
      .set(auth(A.receptionist))
      .send({ patientId: patient.id, items: [{ itemName: 'Xray', quantity: 1, unitPrice: 800 }], issue: true });
    const inv = res.body.data;
    await http().post(`/api/v1/invoices/${inv.id}/payment-link`).set(auth(A.receptionist)).send({});
    expireSpy.mockClear();
    const pay = await http().post(`/api/v1/invoices/${inv.id}/payments`).set(auth(A.receptionist)).send({ amount: 300, paymentMethod: 'CASH' });
    expect(pay.status).toBe(201);
    expect(expireSpy).toHaveBeenCalledWith(created.id);
    const row = await prisma.invoice.findUnique({ where: { id: inv.id } });
    expect(row!.paymentLinkUrl).toBeNull();
  });
});
