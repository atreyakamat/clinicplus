import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService, TaskActor } from './tasks.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const ME = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const TASK = '55555555-5555-4555-8555-555555555555';

const staff: TaskActor = { id: ME, organizationId: ORG, branchId: BRANCH, permissions: ['tasks.view', 'tasks.create', 'tasks.update'] };
const manager: TaskActor = { ...staff, permissions: [...staff.permissions!, 'tasks.assign'] };

function setup() {
  const prisma = {
    task: {
      create: jest.fn(async ({ data }) => ({ id: TASK, ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      update: jest.fn(async ({ data }) => ({ id: TASK, ...data })),
    },
    taskComment: { create: jest.fn(), findMany: jest.fn() },
  };
  const tenant = { user: jest.fn(async (id) => ({ id })), patient: jest.fn(async (id) => ({ id })) };
  const audit = { log: jest.fn() };
  const service = new TasksService(prisma as any, tenant as any, audit as any);
  return { service, prisma, tenant, audit };
}

describe('TasksService', () => {
  it('assigns a new task to the creator when they lack tasks.assign', async () => {
    const { service, prisma } = setup();
    await service.create({ title: 'Restock' }, staff);
    expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({
      assignedTo: ME,
      organizationId: ORG,
      branchId: BRANCH,
      createdBy: ME,
      sourceType: 'MANUAL',
    });
  });

  it('forbids assigning to someone else without tasks.assign', async () => {
    const { service, prisma } = setup();
    await expect(service.create({ title: 'x', assignedTo: OTHER }, staff)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('validates the assignee belongs to the tenant when assigning', async () => {
    const { service, tenant } = setup();
    await service.create({ title: 'x', assignedTo: OTHER }, manager);
    expect(tenant.user).toHaveBeenCalledWith(OTHER, ORG, { label: 'Assignee' });
  });

  it('limits lists to own tasks without tasks.assign, even with scope=all', async () => {
    const { service, prisma } = setup();
    await service.findAll({ scope: 'all' }, staff);
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: ORG, branchId: BRANCH, deletedAt: null });
    expect(where.AND[0]).toEqual({ OR: [{ assignedTo: ME }, { createdBy: ME }] });
  });

  it('lets managers list the whole branch with scope=all', async () => {
    const { service, prisma } = setup();
    await service.findAll({ scope: 'all' }, manager);
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({});
    expect(where.AND).toHaveLength(2); // visibility + default open-status filter
  });

  it('returns 404 for tasks outside the caller visibility', async () => {
    const { service, prisma } = setup();
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TASK, staff)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.task.findFirst.mock.calls[0][0].where).toMatchObject({
      id: TASK,
      organizationId: ORG,
      branchId: BRANCH,
      OR: [{ assignedTo: ME }, { createdBy: ME }],
    });
  });

  it('stamps completedAt on completion and clears it on reopen', async () => {
    const { service, prisma } = setup();
    prisma.task.findFirst.mockResolvedValue({ id: TASK, status: 'OPEN', assignedTo: ME, branchId: BRANCH });
    await service.update(TASK, { status: 'COMPLETED' }, staff);
    expect(prisma.task.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);

    prisma.task.findFirst.mockResolvedValue({ id: TASK, status: 'COMPLETED', assignedTo: ME, branchId: BRANCH });
    await service.update(TASK, { status: 'OPEN' }, staff);
    expect(prisma.task.update.mock.calls[1][0].data.completedAt).toBeNull();
  });

  it('forbids reassignment to others without tasks.assign', async () => {
    const { service, prisma } = setup();
    prisma.task.findFirst.mockResolvedValue({ id: TASK, status: 'OPEN', assignedTo: ME, branchId: BRANCH });
    await expect(service.update(TASK, { assignedTo: OTHER }, staff)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('soft deletes by cancelling and audits', async () => {
    const { service, prisma, audit } = setup();
    prisma.task.findFirst.mockResolvedValue({ id: TASK, status: 'OPEN', title: 't', assignedTo: ME, branchId: BRANCH });
    await service.remove(TASK, manager);
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED', deletedBy: ME });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TASK_DELETED', resourceId: TASK }));
  });
});
