import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { Tenant, auth, createPatient, createTenant, createTestApp, futureSlot } from './helpers/app';

describe('Queue management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  let patient: any;
  const http = () => request(app.getHttpServer());

  let slotIdx = 0;
  const book = async () => {
    const res = await http()
      .post('/api/v1/appointments')
      .set(auth(A.receptionist))
      .send({ patientId: patient.id, doctorId: A.doctor.id, ...futureSlot(2, 9, 15, 15 * slotIdx++) });
    if (res.status !== 201) throw new Error(`booking failed ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const checkIn = (appointmentId: string, extra: Record<string, unknown> = {}) =>
    http().post('/api/v1/queues/check-in').set(auth(A.receptionist)).send({ appointmentId, ...extra });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    A = await createTenant(app, prisma, 'Queue A');
    B = await createTenant(app, prisma, 'Queue B', { roles: ['Organization Owner', 'Receptionist', 'Accountant'] });
    patient = await createPatient(app, A.receptionist, { firstName: 'Ravi', lastName: 'Kumar' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues sequential daily tokens and marks the appointment CHECKED_IN', async () => {
    const a1 = await book();
    const a2 = await book();
    const r1 = await checkIn(a1.id);
    const r2 = await checkIn(a2.id);
    expect(r1.status).toBe(201);
    expect(r2.body.data.tokenNumber).toBe(r1.body.data.tokenNumber + 1);
    expect(r1.body.data.priorityLevel).toBe('NORMAL');
    const appt = await prisma.appointment.findUnique({ where: { id: a1.id } });
    expect(appt?.status).toBe('CHECKED_IN');
    expect((await checkIn(a1.id)).status).toBe(409);
  });

  it('rejects invalid / foreign appointment ids', async () => {
    expect((await checkIn('not-a-uuid')).status).toBe(400);
    expect((await checkIn('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    const a = await book();
    const foreign = await http().post('/api/v1/queues/check-in').set(auth(B.receptionist)).send({ appointmentId: a.id });
    expect(foreign.status).toBe(404);
  });

  it('orders emergencies first, supports room assignment, call-next and reorder', async () => {
    const normal = await book();
    const emergency = await book();
    await checkIn(normal.id);
    const em = await checkIn(emergency.id, { priority: 'EMERGENCY', room: 'ER-1' });
    expect(em.body.data.priorityLevel).toBe('EMERGENCY');

    const live = await http().get('/api/v1/queues/live').set(auth(A.nurse));
    expect(live.status).toBe(200);
    expect(live.body.data.entries[0].id).toBe(em.body.data.id);
    expect(live.body.data.entries[0].room).toBe('ER-1');

    // reorder normal-priority waiting entries: reverse their order
    const waitingNormal = live.body.data.entries.filter((e: any) => e.status === 'WAITING' && e.priorityLevel === 'NORMAL');
    const reversed = waitingNormal.map((e: any) => e.id).reverse();
    const re = await http().put('/api/v1/queues/reorder').set(auth(A.receptionist)).send({ entryIds: [em.body.data.id, ...reversed] });
    expect(re.status).toBe(200);
    const order = re.body.data.entries.filter((e: any) => e.status === 'WAITING').map((e: any) => e.id);
    expect(order).toEqual([em.body.data.id, ...reversed]);

    // call-next takes the emergency
    const next = await http().post('/api/v1/queues/call-next').set(auth(A.doctor)).send({ room: 'Room 2' });
    expect(next.status).toBe(200);
    expect(next.body.data.id).toBe(em.body.data.id);
    expect(next.body.data.status).toBe('CALLED');
    expect(next.body.data.room).toBe('Room 2');

    // priority change on an entry
    const bump = await http().patch(`/api/v1/queues/entries/${reversed[reversed.length - 1]}`).set(auth(A.nurse)).send({ priority: 'HIGH', room: 'Room 3' });
    expect(bump.status).toBe(200);
    expect(bump.body.data.priorityLevel).toBe('HIGH');
    const live2 = await http().get('/api/v1/queues/live').set(auth(A.nurse));
    const firstWaiting = live2.body.data.entries.find((e: any) => e.status === 'WAITING');
    expect(firstWaiting.id).toBe(reversed[reversed.length - 1]);
  });

  it('enforces entry status transitions and syncs the appointment', async () => {
    const a = await book();
    const entry = (await checkIn(a.id)).body.data;
    const setStatus = (status: string, who = A.nurse) => http().patch(`/api/v1/queues/entries/${entry.id}/status`).set(auth(who)).send({ status });
    expect((await setStatus('COMPLETED')).status).toBe(409);
    expect((await setStatus('BOGUS')).status).toBe(400);
    expect((await setStatus('CALLED')).body.data.calledTime).toBeTruthy();
    expect((await setStatus('IN_PROGRESS')).status).toBe(200);
    expect((await prisma.appointment.findUnique({ where: { id: a.id } }))?.status).toBe('IN_PROGRESS');
    const done = await setStatus('COMPLETED');
    expect(done.body.data.completedTime).toBeTruthy();
    expect((await prisma.appointment.findUnique({ where: { id: a.id } }))?.status).toBe('COMPLETED');
    expect((await setStatus('WAITING')).status).toBe(409);
  });

  it('cross-tenant: cannot update another org\'s queue entry', async () => {
    const a = await book();
    const entry = (await checkIn(a.id)).body.data;
    const res = await http().patch(`/api/v1/queues/entries/${entry.id}/status`).set(auth(B.receptionist)).send({ status: 'CANCELLED' });
    expect(res.status).toBe(404);
    expect((await http().patch(`/api/v1/queues/entries/${entry.id}`).set(auth(B.receptionist)).send({ room: 'x' })).status).toBe(404);
    expect((await prisma.queueEntry.findUnique({ where: { id: entry.id } }))?.status).toBe('WAITING');
    const otherLive = await http().get('/api/v1/queues/live').set(auth(B.owner));
    expect(otherLive.body.data.entries).toHaveLength(0);
  });

  it('walk-in creates an appointment and a token', async () => {
    const res = await http().post('/api/v1/queues/walk-in').set(auth(A.receptionist)).send({ patientId: patient.id, doctorId: A.doctor.id, priority: 'EMERGENCY' });
    expect(res.status).toBe(201);
    const appt = await prisma.appointment.findUnique({ where: { id: res.body.data.appointmentId } });
    expect(appt).toMatchObject({ status: 'CHECKED_IN', appointmentSource: 'WALK_IN', organizationId: A.org.id });
    // nurse has queues.update but not appointments.create
    expect((await http().post('/api/v1/queues/walk-in').set(auth(A.nurse)).send({ patientId: patient.id, doctorId: A.doctor.id })).status).toBe(403);
  });

  it('display endpoint exposes only token, room and abbreviated names', async () => {
    const res = await http().get('/api/v1/queues/display').set(auth(A.receptionist));
    expect(res.status).toBe(200);
    const all = [...res.body.data.nowServing, ...res.body.data.waiting];
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].patient).toBe('Ravi K.');
    expect(JSON.stringify(res.body.data)).not.toContain('Kumar');
    expect(JSON.stringify(res.body.data)).not.toContain(patient.phone);
  });

  it('RBAC: accountant cannot view or update the queue', async () => {
    expect((await http().get('/api/v1/queues/live').set(auth(B.accountant))).status).toBe(403);
    expect((await http().post('/api/v1/queues/call-next').set(auth(B.accountant)).send({})).status).toBe(403);
  });
});
