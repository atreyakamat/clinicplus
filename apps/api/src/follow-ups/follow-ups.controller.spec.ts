import { FollowUpsController } from './follow-ups.controller';

describe('FollowUpsController', () => {
  const user = { id: 'u1', organizationId: 'o1', branchId: 'b1' };
  const req = { user };
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    metrics: jest.fn(),
    doctors: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    addOutcome: jest.fn(),
  };
  const controller = new FollowUpsController(service as any);

  beforeEach(() => jest.clearAllMocks());

  it('delegates with the authenticated user as tenant context', () => {
    const dto = { patientId: 'p1', scheduledDate: '2026-11-01T10:00:00.000Z' };
    controller.create(dto, req);
    expect(service.create).toHaveBeenCalledWith(dto, user);
    controller.findAll({ overdue: true }, req);
    expect(service.findAll).toHaveBeenCalledWith({ overdue: true }, user);
    controller.metrics({}, req);
    expect(service.metrics).toHaveBeenCalledWith({}, user);
    controller.findOne('f1', req);
    expect(service.findOne).toHaveBeenCalledWith('f1', user);
    controller.update('f1', { notes: 'n' }, req);
    expect(service.update).toHaveBeenCalledWith('f1', { notes: 'n' }, user);
    controller.updateStatus('f1', { status: 'MISSED' }, req);
    expect(service.updateStatus).toHaveBeenCalledWith('f1', 'MISSED', user);
    controller.addOutcome('f1', { outcomeType: 'IMPROVING' }, req);
    expect(service.addOutcome).toHaveBeenCalledWith('f1', { outcomeType: 'IMPROVING' }, user);
  });
});
