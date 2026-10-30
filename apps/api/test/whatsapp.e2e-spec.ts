/**
 * Patient communication (console driver): messaging, templates, campaigns, inbox,
 * automations, RBAC and cross-tenant isolation. MESSAGING_PROVIDER=console here,
 * so nothing may ever be recorded as delivered.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SmsService } from '../src/messages/sms.service';
import { auth, createPatient, createTenant, createTestApp, Tenant } from './helpers/app';

describe('Patient communication — console driver (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let patientA: any;
  let http: () => any;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    http = () => request(app.getHttpServer());
    A = await createTenant(app, prisma, 'MsgA');
    B = await createTenant(app, prisma, 'MsgB');
    patientA = await createPatient(app, A.receptionist, { firstName: 'Riya' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('provider + sending', () => {
    it('reports the console driver', async () => {
      const res = await http().get('/api/v1/messages/provider-status').set(auth(A.receptionist));
      expect(res.status).toBe(200);
      expect(res.body.data.driver).toBe('console');
      expect(res.body.data.delivering).toBe(false);
      expect(JSON.stringify(res.body.data)).not.toMatch(/AUTH_TOKEN|authToken/);
    });

    it('records a console send as NOT_SENT_CONSOLE (never SENT)', async () => {
      const res = await http()
        .post('/api/v1/messages/send')
        .set(auth(A.receptionist))
        .send({ patientId: patientA.id, body: 'Hello from the clinic' });
      expect(res.status).toBe(201);
      expect(res.body.data.deliveryStatus).toBe('NOT_SENT_CONSOLE');
      expect(res.body.data.direction).toBe('OUTBOUND');
      const row = await prisma.message.findUnique({ where: { id: res.body.data.id } });
      expect(row!.deliveryStatus).toBe('NOT_SENT_CONSOLE');
      expect(row!.organizationId).toBe(A.org.id);
    });

    it('legacy /messages/sms and /messages/whatsapp still work and validate', async () => {
      const sms = await http().post('/api/v1/messages/sms').set(auth(A.doctor)).send({ patientId: patientA.id, content: 'SMS test' });
      expect(sms.status).toBe(201);
      expect(sms.body.data.channel).toBe('SMS');
      expect(sms.body.data.deliveryStatus).toBe('NOT_SENT_CONSOLE');
      const wa = await http().post('/api/v1/messages/whatsapp').set(auth(A.doctor)).send({ patientId: patientA.id, content: 'WA test' });
      expect(wa.status).toBe(201);
      expect(wa.body.data.channel).toBe('WHATSAPP');
      const bad = await http().post('/api/v1/messages/whatsapp').set(auth(A.doctor)).send({});
      expect(bad.status).toBe(400);
    });

    it('SmsService.sendSms does not claim success on the console driver', async () => {
      const r = await app.get(SmsService).sendSms('9876543210', 'Invite', A.org.id, A.branch.id);
      expect(r.success).toBe(false);
      expect(r.status).toBe('NOT_SENT_CONSOLE');
    });

    it('SmsService.sendAndRecord refuses a patient of another organization', async () => {
      await expect(app.get(SmsService).sendAndRecord(patientA.id, 'x', B.org.id, B.branch.id)).rejects.toThrow(/not found/i);
      const count = await prisma.message.count({ where: { organizationId: B.org.id, patientId: patientA.id } });
      expect(count).toBe(0);
    });

    it('opted-out patients are not messaged', async () => {
      const p = await createPatient(app, A.receptionist);
      await prisma.patient.update({ where: { id: p.id }, data: { communicationOptIn: false } });
      const res = await http().post('/api/v1/messages/send').set(auth(A.receptionist)).send({ patientId: p.id, body: 'hi' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/opted out/i);
    });

    it('RBAC: Nurse cannot send, Accountant cannot view', async () => {
      const send = await http().post('/api/v1/messages/send').set(auth(A.nurse)).send({ patientId: patientA.id, body: 'x' });
      expect(send.status).toBe(403);
      const view = await http().get('/api/v1/messages').set(auth(A.accountant));
      expect(view.status).toBe(403);
      const reply = await http().post(`/api/v1/messages/conversations/${patientA.id}/reply`).set(auth(A.nurse)).send({ body: 'x' });
      expect(reply.status).toBe(403);
    });

    it('cross-tenant: tenant B cannot message or read tenant A patient', async () => {
      const send = await http().post('/api/v1/messages/send').set(auth(B.owner)).send({ patientId: patientA.id, body: 'x' });
      expect(send.status).toBe(404);
      const thread = await http().get(`/api/v1/messages/conversations/${patientA.id}`).set(auth(B.owner));
      expect(thread.status).toBe(404);
      const log = await http().get('/api/v1/messages').set(auth(B.owner));
      expect(log.status).toBe(200);
      expect(log.body.data.every((m: any) => m.patientId !== patientA.id)).toBe(true);
    });
  });

  describe('inbox', () => {
    it('lists conversations and the thread for a patient; reply is recorded', async () => {
      const list = await http().get('/api/v1/messages/conversations').set(auth(A.receptionist));
      expect(list.status).toBe(200);
      const conv = list.body.data.find((c: any) => c.patient?.id === patientA.id);
      expect(conv).toBeTruthy();
      expect(conv.lastMessage).toBeTruthy();

      const reply = await http().post(`/api/v1/messages/conversations/${patientA.id}/reply`).set(auth(A.receptionist)).send({ body: 'Reply text', channel: 'SMS' });
      expect(reply.status).toBe(201);

      const thread = await http().get(`/api/v1/messages/conversations/${patientA.id}`).set(auth(A.receptionist));
      expect(thread.status).toBe(200);
      expect(thread.body.data.patient.id).toBe(patientA.id);
      expect(thread.body.data.messages.map((m: any) => m.messageBody)).toContain('Reply text');
    });
  });

  describe('templates', () => {
    let templateId: string;

    it('seeds default templates on first list', async () => {
      const res = await http().get('/api/v1/templates').set(auth(A.receptionist));
      expect(res.status).toBe(200);
      const purposes = res.body.data.items.map((t: any) => t.purpose);
      for (const p of ['APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER_24H', 'APPOINTMENT_REMINDER_2H', 'FOLLOW_UP_REMINDER', 'REVIEW_REQUEST', 'PAYMENT_LINK']) {
        expect(purposes).toContain(p);
      }
      const again = await http().get('/api/v1/templates').set(auth(A.owner));
      expect(again.body.data.items.length).toBe(res.body.data.items.length);
    });

    it('creates, renders and updates a template (templates.manage)', async () => {
      const created = await http()
        .post('/api/v1/templates')
        .set(auth(A.owner))
        .send({ name: 'Greeting', channel: 'SMS', content: 'Hi {{firstName}}, welcome to {{clinicName}}!' });
      expect(created.status).toBe(201);
      templateId = created.body.data.id;

      const preview = await http()
        .post('/api/v1/templates/preview')
        .set(auth(A.receptionist))
        .send({ content: 'Hi {{firstName}} ({{patientName}}) at {{clinicName}}', patientId: patientA.id });
      expect(preview.status).toBe(201);
      expect(preview.body.data.rendered).toContain('Hi Riya (Riya ');
      expect(preview.body.data.rendered).toContain(A.org.name);

      const upd = await http().patch(`/api/v1/templates/${templateId}`).set(auth(A.admin)).send({ content: 'Hello {{firstName}}' });
      expect(upd.status).toBe(200);
      expect(upd.body.data.templateContent).toBe('Hello {{firstName}}');

      const send = await http().post('/api/v1/messages/send').set(auth(A.receptionist)).send({ patientId: patientA.id, templateId });
      expect(send.status).toBe(201);
      expect(send.body.data.messageBody).toBe('Hello Riya');
    });

    it('rejects unknown variables', async () => {
      const res = await http().post('/api/v1/templates').set(auth(A.owner)).send({ name: 'Bad', channel: 'SMS', content: 'Hi {{nope}}' });
      expect(res.status).toBe(400);
    });

    it('RBAC: Receptionist cannot manage templates; Accountant cannot list', async () => {
      const create = await http().post('/api/v1/templates').set(auth(A.receptionist)).send({ name: 'X', channel: 'SMS', content: 'x' });
      expect(create.status).toBe(403);
      const del = await http().delete(`/api/v1/templates/${templateId}`).set(auth(A.receptionist));
      expect(del.status).toBe(403);
      const list = await http().get('/api/v1/templates').set(auth(A.accountant));
      expect(list.status).toBe(403);
    });

    it('cross-tenant: tenant B cannot read/update/delete or send tenant A template', async () => {
      expect((await http().get(`/api/v1/templates/${templateId}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().patch(`/api/v1/templates/${templateId}`).set(auth(B.owner)).send({ name: 'pwn' })).status).toBe(404);
      expect((await http().delete(`/api/v1/templates/${templateId}`).set(auth(B.owner))).status).toBe(404);
      const pB = await createPatient(app, B.receptionist);
      expect((await http().post('/api/v1/messages/send').set(auth(B.owner)).send({ patientId: pB.id, templateId })).status).toBe(404);
    });

    it('deletes a template', async () => {
      const del = await http().delete(`/api/v1/templates/${templateId}`).set(auth(A.owner));
      expect(del.status).toBe(200);
      expect(await prisma.template.findUnique({ where: { id: templateId } })).toBeNull();
    });
  });

  describe('campaigns', () => {
    let C: Tenant;
    let campaignId: string;
    const tag = 'diabetes';

    beforeAll(async () => {
      C = await createTenant(app, prisma, 'MsgC');
      const mk = async (overrides: Record<string, unknown>, tagged: boolean, optIn: boolean) => {
        const p = await createPatient(app, C.receptionist, overrides);
        if (tagged) {
          await prisma.patientTag.create({ data: { organizationId: C.org.id, branchId: C.branch.id, patientId: p.id, tagName: tag } });
        }
        if (!optIn) await prisma.patient.update({ where: { id: p.id }, data: { communicationOptIn: false } });
        return p;
      };
      await mk({ firstName: 'Tagged', gender: 'FEMALE' }, true, true);
      await mk({ firstName: 'TaggedMale', gender: 'MALE' }, true, true);
      await mk({ firstName: 'OptedOut', gender: 'FEMALE' }, true, false);
      await mk({ firstName: 'Untagged', gender: 'FEMALE' }, false, true);
    });

    it('previews the audience with filters and excludes opted-out patients', async () => {
      const all = await http().post('/api/v1/campaigns/audience/preview').set(auth(C.owner)).send({ audience: { tags: [tag] } });
      expect(all.status).toBe(201);
      expect(all.body.data.count).toBe(2);
      expect(all.body.data.excludedOptedOut).toBe(1);

      const female = await http().post('/api/v1/campaigns/audience/preview').set(auth(C.owner)).send({ audience: { tags: [tag], gender: 'FEMALE' } });
      expect(female.body.data.count).toBe(1);
      expect(female.body.data.sample[0].firstName).toBe('Tagged');

      const upcoming = await http().post('/api/v1/campaigns/audience/preview').set(auth(C.owner)).send({ audience: { hasUpcomingAppointment: true } });
      expect(upcoming.body.data.count).toBe(0);

      const bad = await http().post('/api/v1/campaigns/audience/preview').set(auth(C.owner)).send({ audience: { ageMin: -3 } });
      expect(bad.status).toBe(400);
    });

    it('creates and sends a campaign; only opted-in audience is messaged', async () => {
      const created = await http()
        .post('/api/v1/campaigns')
        .set(auth(C.owner))
        .send({ name: 'Diabetes check', channel: 'SMS', messageBody: 'Hi {{firstName}}, time for your sugar check at {{clinicName}}.', audience: { tags: [tag] } });
      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe('DRAFT');
      campaignId = created.body.data.id;

      const sent = await http().post(`/api/v1/campaigns/${campaignId}/send`).set(auth(C.owner)).send({});
      expect(sent.status).toBe(201);
      expect(sent.body.data.status).toBe('COMPLETED');
      // console driver: recorded, never delivered
      expect(sent.body.data.sentCount).toBe(0);
      expect(sent.body.data.failedCount).toBe(2);
      expect(sent.body.data.deliveryBreakdown).toEqual([{ deliveryStatus: 'NOT_SENT_CONSOLE', count: 2 }]);

      const msgs = await prisma.message.findMany({ where: { organizationId: C.org.id, reminderKey: { startsWith: `campaign:${campaignId}:` } }, include: { patient: true } });
      expect(msgs.map((m) => m.patient.firstName).sort()).toEqual(['Tagged', 'TaggedMale']);
      expect(msgs[0].messageBody).toMatch(/^Hi Tagged/);

      const again = await http().post(`/api/v1/campaigns/${campaignId}/send`).set(auth(C.owner)).send({});
      expect(again.status).toBe(400);
    });

    it('schedules and cancels a campaign', async () => {
      const created = await http().post('/api/v1/campaigns').set(auth(C.admin)).send({ name: 'Later', channel: 'SMS', messageBody: 'Later', audience: {} });
      const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
      const sched = await http().post(`/api/v1/campaigns/${created.body.data.id}/send`).set(auth(C.admin)).send({ scheduledAt: at });
      expect(sched.body.data.status).toBe('SCHEDULED');
      const cancel = await http().post(`/api/v1/campaigns/${created.body.data.id}/cancel`).set(auth(C.admin));
      expect(cancel.status).toBe(201);
      expect(cancel.body.data.status).toBe('CANCELLED');
    });

    it('RBAC: Receptionist cannot view or manage campaigns; Branch Manager can view only', async () => {
      expect((await http().get('/api/v1/campaigns').set(auth(C.receptionist))).status).toBe(403);
      expect((await http().post('/api/v1/campaigns').set(auth(C.receptionist)).send({ name: 'x', channel: 'SMS', messageBody: 'x' })).status).toBe(403);
      expect((await http().get('/api/v1/campaigns').set(auth(C.manager))).status).toBe(200);
      expect((await http().post('/api/v1/campaigns').set(auth(C.manager)).send({ name: 'x', channel: 'SMS', messageBody: 'x' })).status).toBe(403);
      expect((await http().post(`/api/v1/campaigns/${campaignId}/send`).set(auth(C.manager)).send({})).status).toBe(403);
    });

    it('cross-tenant: tenant B cannot see or act on tenant C campaign', async () => {
      expect((await http().get(`/api/v1/campaigns/${campaignId}`).set(auth(B.owner))).status).toBe(404);
      expect((await http().post(`/api/v1/campaigns/${campaignId}/cancel`).set(auth(B.owner))).status).toBe(404);
      const list = await http().get('/api/v1/campaigns').set(auth(B.owner));
      expect(list.body.data.find((c: any) => c.id === campaignId)).toBeUndefined();
    });
  });

  describe('automations', () => {
    it('sends booking confirmation, 24h reminder and follow-up reminder exactly once', async () => {
      const p = await createPatient(app, A.receptionist, { firstName: 'Auto' });
      const start = new Date(Date.now() + 2 * 86_400_000);
      const appt = await prisma.appointment.create({
        data: {
          organizationId: A.org.id, branchId: A.branch.id, patientId: p.id, doctorId: A.doctor.id,
          scheduledStart: start, scheduledEnd: new Date(start.getTime() + 30 * 60_000), status: 'SCHEDULED',
        },
      });
      const soon = new Date(Date.now() + 20 * 3_600_000);
      const appt24 = await prisma.appointment.create({
        data: {
          organizationId: A.org.id, branchId: A.branch.id, patientId: p.id, doctorId: A.doctor.id,
          scheduledStart: soon, scheduledEnd: new Date(soon.getTime() + 30 * 60_000), status: 'CONFIRMED',
          createdAt: new Date(Date.now() - 3 * 86_400_000),
        },
      });
      const fu = await prisma.followUp.create({
        data: { organizationId: A.org.id, branchId: A.branch.id, patientId: p.id, doctorId: A.doctor.id, scheduledDate: new Date(Date.now() + 20 * 3_600_000), status: 'PENDING' },
      });

      const run = await http().post('/api/v1/messages/automations/run').set(auth(A.owner));
      expect(run.status).toBe(200);
      expect(run.body.data.errors).toEqual([]);

      const confirm = await prisma.message.findUnique({ where: { reminderKey: `confirm:${appt.id}` } });
      expect(confirm).toBeTruthy();
      expect(confirm!.deliveryStatus).toBe('NOT_SENT_CONSOLE');
      expect(confirm!.messageBody).toContain('Auto');
      expect(confirm!.messageBody).toMatch(/confirmed/i);
      expect(await prisma.message.findUnique({ where: { reminderKey: `remind24:${appt24.id}` } })).toBeTruthy();
      expect(await prisma.message.findUnique({ where: { reminderKey: `fu-due:${fu.id}` } })).toBeTruthy();
      const fuAfter = await prisma.followUp.findUnique({ where: { id: fu.id } });
      expect(fuAfter!.reminderCount).toBe(1);
      expect(fuAfter!.lastRemindedAt).toBeTruthy();

      const before = await prisma.message.count({ where: { patientId: p.id } });
      await http().post('/api/v1/messages/automations/run').set(auth(A.owner));
      expect(await prisma.message.count({ where: { patientId: p.id } })).toBe(before);

      // tenant B's run never touches tenant A
      await http().post('/api/v1/messages/automations/run').set(auth(B.owner));
      expect(await prisma.message.count({ where: { organizationId: B.org.id, patientId: p.id } })).toBe(0);
    });

    it('status endpoint and RBAC on manual run', async () => {
      const st = await http().get('/api/v1/messages/automations/status').set(auth(A.receptionist));
      expect(st.status).toBe(200);
      expect(st.body.data.last7Days.bookingConfirmations).toBeGreaterThanOrEqual(1);
      expect((await http().post('/api/v1/messages/automations/run').set(auth(A.receptionist))).status).toBe(403);
      expect((await http().post('/api/v1/messages/automations/run').set(auth(A.nurse))).status).toBe(403);
    });
  });

  describe('twilio webhooks without TWILIO_AUTH_TOKEN', () => {
    it('reject unsigned callbacks', async () => {
      const res = await http().post('/api/v1/webhooks/twilio/status').type('form').send({ MessageSid: 'SMx', MessageStatus: 'delivered' });
      expect(res.status).toBe(403);
    });
  });
});
