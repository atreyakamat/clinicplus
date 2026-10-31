import { ConflictException, NotFoundException } from '@nestjs/common';
import { PRIORITY_BAND, QueuesService, priorityLevel, priorityValue } from './queues.service';

const user = { id: 'u1', organizationId: 'o1', branchId: 'b1', permissions: [], roles: [] } as any;
const ID = '11111111-1111-4111-8111-111111111111';

function setup() {
  const prisma: any = {
    $executeRaw: jest.fn(),
    queue: { findFirst: jest.fn(), create: jest.fn() },
    queueEntry: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, priority: 0, ...data })),
    },
    appointment: { update: jest.fn() },
    branch: { findFirst: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const audit = { log: jest.fn() };
  const tenant = { appointment: jest.fn(), patient: jest.fn(), user: jest.fn() };
  const schedule = { branchTimezone: jest.fn().mockResolvedValue('Asia/Kolkata') };
  return { service: new QueuesService(prisma, audit as any, tenant as any, schedule as any), prisma, tenant };
}

describe('QueuesService', () => {
  it('maps priority levels to sort bands', () => {
    expect(priorityValue('NORMAL')).toBe(0);
    expect(priorityValue('HIGH')).toBe(PRIORITY_BAND);
    expect(priorityValue('EMERGENCY')).toBe(2 * PRIORITY_BAND);
    expect(priorityLevel(2 * PRIORITY_BAND + 7)).toBe('EMERGENCY');
    expect(priorityLevel(PRIORITY_BAND - 1)).toBe('NORMAL');
  });

  it('getLiveQueue returns an empty queue (without creating one) when none exists today', async () => {
    const { service, prisma } = setup();
    prisma.queue.findFirst.mockResolvedValue(null);
    const res = await service.getLiveQueue(user);
    expect(res.entries).toEqual([]);
    expect(prisma.queue.create).not.toHaveBeenCalled();
    expect(prisma.queue.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: 'o1', branchId: 'b1' });
  });

  it('check-in refuses finished appointments', async () => {
    const { service, tenant } = setup();
    tenant.appointment.mockResolvedValue({ id: ID, status: 'COMPLETED' });
    await expect(service.checkIn(user, { appointmentId: ID })).rejects.toBeInstanceOf(ConflictException);
    expect(tenant.appointment).toHaveBeenCalledWith(ID, 'o1', 'b1');
  });

  it('check-in issues the next token and marks the appointment checked in', async () => {
    const { service, prisma, tenant } = setup();
    tenant.appointment.mockResolvedValue({ id: ID, status: 'SCHEDULED' });
    prisma.queueEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ tokenNumber: 4 });
    prisma.queue.findFirst.mockResolvedValue({ id: 'q1' });
    prisma.queueEntry.create.mockImplementation(async ({ data }) => ({ id: 'e1', ...data }));
    const entry = await service.checkIn(user, { appointmentId: ID, priority: 'EMERGENCY' });
    expect(entry.tokenNumber).toBe(5);
    expect(entry.priorityLevel).toBe('EMERGENCY');
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.appointment.update.mock.calls[0][0].data.status).toBe('CHECKED_IN');
  });

  it('updateStatus is tenant scoped and follows the transition table', async () => {
    const { service, prisma } = setup();
    prisma.queueEntry.findFirst.mockResolvedValue(null);
    await expect(service.updateStatus(user, ID, 'CALLED')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.queueEntry.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: 'o1', branchId: 'b1' });

    prisma.queueEntry.findFirst.mockResolvedValue({ id: ID, status: 'WAITING', priority: 0, appointment: { id: 'a', status: 'CHECKED_IN' } });
    await expect(service.updateStatus(user, ID, 'COMPLETED')).rejects.toBeInstanceOf(ConflictException);
    const called = await service.updateStatus(user, ID, 'CALLED');
    expect(called.calledTime).toBeInstanceOf(Date);
  });

  it('completing an entry completes the appointment', async () => {
    const { service, prisma } = setup();
    prisma.queueEntry.findFirst.mockResolvedValue({ id: ID, status: 'IN_PROGRESS', priority: 0, appointment: { id: 'a', status: 'IN_PROGRESS' } });
    await service.updateStatus(user, ID, 'COMPLETED');
    expect(prisma.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
  });

  it('call-next 404s when nobody is waiting', async () => {
    const { service, prisma } = setup();
    prisma.queueEntry.findFirst.mockResolvedValue(null);
    await expect(service.callNext(user, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reorder keeps priority bands and orders within each band', async () => {
    const { service, prisma } = setup();
    const ids = ['a', 'b', 'c'].map((c) => c.repeat(8) + '-1111-4111-8111-111111111111');
    prisma.queueEntry.findMany
      .mockResolvedValueOnce([
        { id: ids[0], priority: 0 },
        { id: ids[1], priority: 2 * PRIORITY_BAND },
        { id: ids[2], priority: 5 },
      ])
      .mockResolvedValue([]);
    prisma.queue.findFirst.mockResolvedValue(null);
    await service.reorder(user, { entryIds: ids });
    const priorities = Object.fromEntries(prisma.queueEntry.update.mock.calls.map((c: any) => [c[0].where.id, c[0].data.priority]));
    expect(priorities[ids[1]]).toBeGreaterThanOrEqual(2 * PRIORITY_BAND);
    expect(priorities[ids[0]]).toBeGreaterThan(priorities[ids[2]]);
    expect(priorities[ids[0]]).toBeLessThan(PRIORITY_BAND);
  });
});
