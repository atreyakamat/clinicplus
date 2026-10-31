import { QueuesController } from './queues.controller';

describe('QueuesController', () => {
  const user = { id: 'u1', organizationId: 'o1', branchId: 'b1' };
  const req = { user };
  const service = {
    getLiveQueue: jest.fn().mockResolvedValue({ entries: [] }),
    getDisplay: jest.fn().mockResolvedValue({ nowServing: [], waiting: [] }),
    checkIn: jest.fn().mockResolvedValue({ id: 'e1' }),
    walkIn: jest.fn().mockResolvedValue({ id: 'e1' }),
    callNext: jest.fn().mockResolvedValue({ id: 'e1' }),
    reorder: jest.fn().mockResolvedValue({ entries: [] }),
    updateEntry: jest.fn().mockResolvedValue({ id: 'e1' }),
    updateStatus: jest.fn().mockResolvedValue({ id: 'e1' }),
  };
  const controller = new QueuesController(service as any);

  it('scopes every call to the authenticated user', async () => {
    await controller.getLiveQueue(req);
    await controller.getDisplay(req);
    await controller.checkIn({ appointmentId: 'a' } as any, req);
    await controller.callNext({ room: 'R1' } as any, req);
    await controller.updateStatus('e1', { status: 'CALLED' } as any, req);
    await controller.updateEntry('e1', { room: 'R2' } as any, req);
    expect(service.getLiveQueue).toHaveBeenCalledWith(user);
    expect(service.getDisplay).toHaveBeenCalledWith(user);
    expect(service.checkIn).toHaveBeenCalledWith(user, { appointmentId: 'a' });
    expect(service.callNext).toHaveBeenCalledWith(user, { room: 'R1' });
    expect(service.updateStatus).toHaveBeenCalledWith(user, 'e1', 'CALLED');
    expect(service.updateEntry).toHaveBeenCalledWith(user, 'e1', { room: 'R2' });
  });
});
