import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  const user = { id: 'u1', organizationId: 'o1', branchId: 'b1', permissions: ['tasks.view'] };
  const req = { user };
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    summary: jest.fn(),
    assignees: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    listComments: jest.fn(),
    addComment: jest.fn(),
  };
  const controller = new TasksController(service as any);

  beforeEach(() => jest.clearAllMocks());

  it('passes the authenticated user (tenant + permissions) to every operation', () => {
    controller.create({ title: 't' }, req);
    expect(service.create).toHaveBeenCalledWith({ title: 't' }, user);
    controller.findAll({ scope: 'all' }, req);
    expect(service.findAll).toHaveBeenCalledWith({ scope: 'all' }, user);
    controller.findOne('id1', req);
    expect(service.findOne).toHaveBeenCalledWith('id1', user);
    controller.update('id1', { status: 'COMPLETED' }, req);
    expect(service.update).toHaveBeenCalledWith('id1', { status: 'COMPLETED' }, user);
    controller.remove('id1', req);
    expect(service.remove).toHaveBeenCalledWith('id1', user);
    controller.addComment('id1', { comment: 'c' }, req);
    expect(service.addComment).toHaveBeenCalledWith('id1', { comment: 'c' }, user);
  });

  it('only honours scope=all for the summary when explicitly requested', () => {
    controller.summary('weird', req);
    expect(service.summary).toHaveBeenCalledWith(user, 'mine');
    controller.summary('all', req);
    expect(service.summary).toHaveBeenLastCalledWith(user, 'all');
  });
});
