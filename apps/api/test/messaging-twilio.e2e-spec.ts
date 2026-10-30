/**
 * Twilio driver + webhooks (axios mocked — no network).
 */
import { restoreTwilioEnv, TWILIO_TEST_ENV } from './helpers/twilio-env';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import axios from 'axios';
import { PrismaService } from '../src/prisma/prisma.service';
import { computeTwilioSignature } from '../src/messages/twilio-signature';
import { auth, createPatient, createTenant, createTestApp, Tenant } from './helpers/app';

const STATUS_PATH = '/api/v1/webhooks/twilio/status';
const INBOUND_PATH = '/api/v1/webhooks/twilio/inbound';
const sign = (path: string, params: Record<string, string>) =>
  computeTwilioSignature(TWILIO_TEST_ENV.TWILIO_AUTH_TOKEN, TWILIO_TEST_ENV.API_PUBLIC_URL + path, params);

describe('Messaging — Twilio driver & webhooks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let patient: any;
  let postSpy: jest.SpyInstance;
  let sidCounter = 0;
  const nextSid = () => `SM${Date.now().toString(16)}${(sidCounter++).toString().padStart(6, '0')}${Math.random().toString(16).slice(2, 10)}`;

  beforeAll(async () => {
    postSpy = jest.spyOn(axios, 'post').mockImplementation(async () => ({ data: { sid: nextSid(), status: 'queued' } }) as any);
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'Twl', { roles: ['Organization Owner', 'Receptionist', 'Nurse'] });
    patient = await createPatient(app, A.receptionist, { firstName: 'Meena', phone: '98765 43210' });
  });

  afterAll(async () => {
    postSpy.mockRestore();
    await app.close();
    restoreTwilioEnv();
  });

  const http = () => request(app.getHttpServer());

  it('provider-status reports twilio with both channels, no secrets', async () => {
    const res = await http().get('/api/v1/messages/provider-status').set(auth(A.receptionist));
    expect(res.body.data.driver).toBe('twilio');
    expect(res.body.data.channels).toEqual({ SMS: true, WHATSAPP: true });
    expect(res.body.data.statusCallbackUrl).toBe('https://api.clinic.test/api/v1/webhooks/twilio/status');
    expect(JSON.stringify(res.body.data)).not.toContain(TWILIO_TEST_ENV.TWILIO_AUTH_TOKEN);
  });

  it('sends WhatsApp via the Twilio REST API (E.164, basic auth, StatusCallback) and records QUEUED', async () => {
    postSpy.mockClear();
    const res = await http().post('/api/v1/messages/send').set(auth(A.receptionist)).send({ patientId: patient.id, body: 'Hello Meena' });
    expect(res.status).toBe(201);
    expect(res.body.data.channel).toBe('WHATSAPP');
    expect(res.body.data.deliveryStatus).toBe('QUEUED');
    expect(res.body.data.externalId).toMatch(/^SM/);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, body, cfg] = postSpy.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_TEST_ENV.TWILIO_ACCOUNT_SID}/Messages.json`);
    const form = new URLSearchParams(body as string);
    expect(form.get('To')).toBe('whatsapp:+919876543210');
    expect(form.get('From')).toBe('whatsapp:+14155238886');
    expect(form.get('Body')).toBe('Hello Meena');
    expect(form.get('StatusCallback')).toBe('https://api.clinic.test/api/v1/webhooks/twilio/status');
    expect(cfg.auth).toEqual({ username: TWILIO_TEST_ENV.TWILIO_ACCOUNT_SID, password: TWILIO_TEST_ENV.TWILIO_AUTH_TOKEN });
  });

  it('uses SMS for patients who prefer SMS', async () => {
    const p = await createPatient(app, A.receptionist, { phone: '+91 91234 56789' });
    await prisma.patient.update({ where: { id: p.id }, data: { preferredChannel: 'SMS' } });
    postSpy.mockClear();
    const res = await http().post('/api/v1/messages/send').set(auth(A.receptionist)).send({ patientId: p.id, body: 'SMS please' });
    expect(res.body.data.channel).toBe('SMS');
    const form = new URLSearchParams(postSpy.mock.calls[0][1] as string);
    expect(form.get('To')).toBe('+919123456789');
    expect(form.get('From')).toBe('+15005550006');
  });

  it('records provider errors as FAILED with the Twilio message', async () => {
    postSpy.mockImplementationOnce(async () => {
      const err: any = new Error('Request failed with status code 400');
      err.response = { status: 400, data: { code: 21211, message: "The 'To' number is not a valid phone number." } };
      throw err;
    });
    const res = await http().post('/api/v1/messages/send').set(auth(A.receptionist)).send({ patientId: patient.id, body: 'will fail', channel: 'SMS' });
    expect(res.status).toBe(201);
    expect(res.body.data.deliveryStatus).toBe('FAILED');
    expect(res.body.data.errorMessage).toContain('21211');
  });

  describe('status webhook', () => {
    let message: any;
    beforeAll(async () => {
      const res = await http().post('/api/v1/messages/send').set(auth(A.receptionist)).send({ patientId: patient.id, body: 'track me' });
      message = res.body.data;
    });

    it('rejects a missing or invalid signature with 403', async () => {
      const params = { MessageSid: message.externalId, MessageStatus: 'delivered' };
      expect((await http().post(STATUS_PATH).type('form').send(params)).status).toBe(403);
      const bad = await http().post(STATUS_PATH).set('X-Twilio-Signature', sign(STATUS_PATH, { ...params, MessageStatus: 'failed' })).type('form').send(params);
      expect(bad.status).toBe(403);
      const row = await prisma.message.findUnique({ where: { id: message.id } });
      expect(row!.deliveryStatus).toBe('QUEUED');
    });

    it('applies a valid signed callback, idempotently and never backwards', async () => {
      const delivered = { MessageSid: message.externalId, MessageStatus: 'delivered', AccountSid: TWILIO_TEST_ENV.TWILIO_ACCOUNT_SID };
      const ok = await http().post(STATUS_PATH).set('X-Twilio-Signature', sign(STATUS_PATH, delivered)).type('form').send(delivered);
      expect(ok.status).toBe(200);
      expect(ok.text).toContain('<Response>');
      expect((await prisma.message.findUnique({ where: { id: message.id } }))!.deliveryStatus).toBe('DELIVERED');

      // replay → deduplicated by WebhookEvent
      const replay = await http().post(STATUS_PATH).set('X-Twilio-Signature', sign(STATUS_PATH, delivered)).type('form').send(delivered);
      expect(replay.status).toBe(200);
      expect(await prisma.webhookEvent.count({ where: { provider: 'twilio', eventId: `${message.externalId}:delivered` } })).toBe(1);

      // late "sent" must not downgrade DELIVERED
      const sent = { MessageSid: message.externalId, MessageStatus: 'sent' };
      await http().post(STATUS_PATH).set('X-Twilio-Signature', sign(STATUS_PATH, sent)).type('form').send(sent);
      expect((await prisma.message.findUnique({ where: { id: message.id } }))!.deliveryStatus).toBe('DELIVERED');
    });
  });

  describe('inbound webhook + STOP/START', () => {
    const inbound = (body: string) => ({
      MessageSid: `SM${Math.random().toString(16).slice(2)}${Date.now()}`,
      From: 'whatsapp:+919876543210',
      To: 'whatsapp:+14155238886',
      Body: body,
      NumMedia: '0',
    });

    it('rejects unsigned inbound messages', async () => {
      const res = await http().post(INBOUND_PATH).type('form').send(inbound('hi'));
      expect(res.status).toBe(403);
    });

    it('stores an inbound reply on the patient conversation', async () => {
      const params = inbound('Can I come at 5pm?');
      const res = await http().post(INBOUND_PATH).set('X-Twilio-Signature', sign(INBOUND_PATH, params)).type('form').send(params);
      expect(res.status).toBe(200);
      const msg = await prisma.message.findFirst({ where: { externalId: params.MessageSid } });
      expect(msg).toBeTruthy();
      expect(msg!.direction).toBe('INBOUND');
      expect(msg!.patientId).toBe(patient.id);
      expect(msg!.organizationId).toBe(A.org.id);
      expect(msg!.channel).toBe('WHATSAPP');

      const convs = await http().get('/api/v1/messages/conversations').set(auth(A.receptionist));
      const c = convs.body.data.find((x: any) => x.patient.id === patient.id);
      expect(c.awaitingReply).toBe(true);
    });

    it('STOP opts the patient out (campaigns + staff sends skip them); START opts back in', async () => {
      const stop = inbound('STOP');
      await http().post(INBOUND_PATH).set('X-Twilio-Signature', sign(INBOUND_PATH, stop)).type('form').send(stop);
      expect((await prisma.patient.findUnique({ where: { id: patient.id } }))!.communicationOptIn).toBe(false);

      const preview = await http().post('/api/v1/campaigns/audience/preview').set(auth(A.owner)).send({ audience: {} });
      expect(preview.body.data.excludedOptedOut).toBeGreaterThanOrEqual(1);
      const camp = await http().post('/api/v1/campaigns').set(auth(A.owner)).send({ name: 'Promo', channel: 'SMS', messageBody: 'Offer for {{firstName}}' });
      await http().post(`/api/v1/campaigns/${camp.body.data.id}/send`).set(auth(A.owner)).send({});
      expect(await prisma.message.count({ where: { patientId: patient.id, reminderKey: { startsWith: `campaign:${camp.body.data.id}:` } } })).toBe(0);
      const detail = await http().get(`/api/v1/campaigns/${camp.body.data.id}`).set(auth(A.owner));
      expect(detail.body.data.status).toBe('COMPLETED');
      expect(detail.body.data.sentCount).toBeGreaterThanOrEqual(1); // the SMS-preferring patient
      expect((await http().post('/api/v1/messages/send').set(auth(A.receptionist)).send({ patientId: patient.id, body: 'x' })).status).toBe(400);

      const start = inbound('start');
      await http().post(INBOUND_PATH).set('X-Twilio-Signature', sign(INBOUND_PATH, start)).type('form').send(start);
      expect((await prisma.patient.findUnique({ where: { id: patient.id } }))!.communicationOptIn).toBe(true);
    });
  });

  it('RBAC: Nurse cannot send through Twilio', async () => {
    postSpy.mockClear();
    const res = await http().post('/api/v1/messages/send').set(auth(A.nurse)).send({ patientId: patient.id, body: 'x' });
    expect(res.status).toBe(403);
    expect(postSpy).not.toHaveBeenCalled();
  });
});
