import { AppointmentsController } from './appointments.controller';

describe('AppointmentsController', () => {
  const user = { id: 'u1', organizationId: 'o1', branchId: 'b1' };
  const req = { user };
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'a1' }),
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
    findOne: jest.fn().mockResolvedValue({ id: 'a1' }),
    update: jest.fn().mockResolvedValue({ id: 'a1' }),
    reschedule: jest.fn().mockResolvedValue({ id: 'a1' }),
    transition: jest.fn().mockResolvedValue({ id: 'a1' }),
    remove: jest.fn().mockResolvedValue({ id: 'a1' }),
    exportRows: jest.fn().mockResolvedValue([
      {
        scheduledStart: new Date('2030-01-01T10:00:00Z'),
        scheduledEnd: new Date('2030-01-01T10:30:00Z'),
        status: 'SCHEDULED',
        patient: { firstName: 'A', lastName: 'B', phone: '1' },
        doctor: { firstName: 'C', lastName: 'D' },
      },
    ]),
  };
  const controller = new AppointmentsController(service as any);

  beforeEach(() => jest.clearAllMocks());

  it('passes the authenticated user (never body tenant fields) to create', async () => {
    const dto = { patientId: 'p', doctorId: 'd', scheduledStart: 'x', scheduledEnd: 'y' };
    await controller.create(dto as any, req);
    expect(service.create).toHaveBeenCalledWith(user, dto);
  });

  it('forwards list filters', async () => {
    const q = { date: '2030-01-01', doctorId: 'd' };
    await controller.findAll(req, q as any);
    expect(service.findAll).toHaveBeenCalledWith(user, q);
  });

  it('maps action endpoints onto status transitions', async () => {
    await controller.confirm('a1', req);
    await controller.checkIn('a1', req);
    await controller.start('a1', req);
    await controller.complete('a1', req);
    await controller.noShow('a1', req);
    await controller.cancel('a1', { reason: 'r' }, req);
    expect(service.transition.mock.calls.map((c) => c[2])).toEqual([
      'CONFIRMED',
      'CHECKED_IN',
      'IN_PROGRESS',
      'COMPLETED',
      'NO_SHOW',
      'CANCELLED',
    ]);
    expect(service.transition).toHaveBeenLastCalledWith(user, 'a1', 'CANCELLED', { reason: 'r' });
  });

  it('exports CSV with headers', async () => {
    const res = { set: jest.fn(), send: jest.fn() };
    await controller.exportCsv(req, {} as any, res);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'text/csv' }));
    expect(res.send.mock.calls[0][0]).toContain('Start Time');
    expect(res.send.mock.calls[0][0]).toContain('A B');
  });
});
