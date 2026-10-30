import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const TARGET = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  const manager = {
    id: ACTOR,
    organizationId: ORG,
    branchId: BRANCH,
    homeBranchId: BRANCH,
    orgWide: false,
    roles: ['Branch Manager'],
    permissions: ['users.view', 'users.update'],
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
      userRole: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      role: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('findByEmail looks up active users case-insensitively', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: '1' });
    await service.findByEmail('Test@Test.com');
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: 'Test@Test.com', mode: 'insensitive' }, status: 'ACTIVE' },
      }),
    );
  });

  it('findAll is always tenant scoped', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: '1', roles: [] }]);
    await service.findAll(ORG);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
    );
  });

  it('a branch-level actor only lists their home branch, even when asking for all branches', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.list(manager, { allBranches: 'true' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, branchId: BRANCH }) }),
    );
  });

  it('nobody can change their own roles', async () => {
    await expect(service.setRoles(ACTOR, [TARGET], manager)).rejects.toThrow(ForbiddenException);
  });

  it('nobody can deactivate themselves', async () => {
    await expect(service.deactivate(ACTOR, manager)).rejects.toThrow(ForbiddenException);
  });

  it('moving a user between branches requires an org-wide actor', async () => {
    await expect(service.moveBranch(TARGET, BRANCH, manager)).rejects.toThrow(ForbiddenException);
  });
});
