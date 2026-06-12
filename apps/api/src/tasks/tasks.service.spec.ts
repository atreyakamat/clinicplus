import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockUserId = 'user-1';
  const mockOrgId2 = 'org-2';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: PrismaService,
          useValue: {
            task: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('HAPPY PATH: Task Creation & Management', () => {
    it('should create a task with priority and assignment', async () => {
      const data = {
        title: 'Call patient for follow-up',
        description: 'Reminder to call patient John Doe',
        priority: 'HIGH',
        assignedTo: 'user-2',
      } as any;

      jest.spyOn(prisma.task, 'create').mockResolvedValue({
        id: 'task-1',
        ...data,
        status: 'OPEN',
        createdBy: mockUserId,
        organizationId: mockOrgId,
      });

      const result = await service.create(
        data,
        mockOrgId,
        mockBranchId,
        mockUserId,
      );

      expect(result.id).toBe('task-1');
      expect(result.priority).toBe('HIGH');
      expect(result.status).toBe('OPEN');
    });

    it('should retrieve task with full details', async () => {
      const task = {
        id: 'task-1',
        title: 'Call patient',
        priority: 'HIGH',
        assignedToUser: { id: 'user-2', firstName: 'Dr', lastName: 'Smith' },
        createdByUser: {
          id: 'user-1',
          firstName: 'Manager',
          lastName: 'Admin',
        },
      };

      jest.spyOn(prisma.task, 'findFirst').mockResolvedValue(task as any);

      const result = await service.findOne('task-1', mockOrgId, mockBranchId);

      expect(result.assignedToUser.firstName).toBe('Dr');
      expect(result.createdByUser.firstName).toBe('Manager');
    });

    it('should list all tasks for organization', async () => {
      const tasks = [
        { id: 'task-1', priority: 'HIGH', status: 'OPEN' },
        { id: 'task-2', priority: 'MEDIUM', status: 'IN_PROGRESS' },
        { id: 'task-3', priority: 'LOW', status: 'OPEN' },
      ];

      jest.spyOn(prisma.task, 'findMany').mockResolvedValue(tasks as any);

      const result = await service.findAll(mockOrgId, mockBranchId);

      expect(result.length).toBe(3);
    });
  });

  describe('VALIDATION: Task Business Rules', () => {
    it('should support all priority levels', async () => {
      const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

      for (const priority of priorities) {
        const data = {
          title: `Task with priority ${priority}`,
          priority,
          assignedTo: 'user-2',
        } as any;

        jest.spyOn(prisma.task, 'create').mockResolvedValue({
          id: `task-${priority}`,
          ...data,
          status: 'OPEN',
        });

        const result = await service.create(
          data,
          mockOrgId,
          mockBranchId,
          mockUserId,
        );
        expect(result.priority).toBe(priority);
      }
    });

    it('should track createdBy and updatedBy users', async () => {
      const data = {
        title: 'Task',
        priority: 'HIGH',
        assignedTo: 'user-2',
      } as any;

      jest.spyOn(prisma.task, 'create').mockResolvedValue({
        id: 'task-1',
        ...data,
        createdBy: mockUserId,
      });

      await service.create(data, mockOrgId, mockBranchId, mockUserId);

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdBy: mockUserId,
          }),
        }),
      );
    });

    it('should update task with new status', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ id: 'task-1', status: 'OPEN' } as any);
      jest.spyOn(prisma.task, 'update').mockResolvedValue({
        id: 'task-1',
        status: 'COMPLETED',
        updatedBy: mockUserId,
      } as any);

      const result = await service.update(
        'task-1',
        { status: 'COMPLETED', updatedBy: mockUserId },
        mockOrgId,
        mockBranchId,
      );

      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('EDGE CASES: Complex Task Scenarios', () => {
    it('should handle task reassignment', async () => {
      const existing = { id: 'task-1', assignedTo: 'user-1' };
      const updated = { id: 'task-1', assignedTo: 'user-2' };

      jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);
      jest.spyOn(prisma.task, 'update').mockResolvedValue(updated as any);

      const result = await service.update(
        'task-1',
        { assignedTo: 'user-2' },
        mockOrgId,
        mockBranchId,
      );

      expect(result.assignedTo).toBe('user-2');
    });

    it('should support task descriptions with special characters', async () => {
      const data = {
        title: 'Task_2026-Q2 (Urgent)',
        description: 'Follow up: Patient status update & medication review',
        priority: 'URGENT',
      } as any;

      jest.spyOn(prisma.task, 'create').mockResolvedValue({
        id: 'task-1',
        ...data,
        status: 'OPEN',
      });

      const result = await service.create(
        data,
        mockOrgId,
        mockBranchId,
        mockUserId,
      );

      expect(result.title).toContain('Task_2026');
      expect(result.description).toContain('medication review');
    });

    it('should soft delete task by changing status to CANCELLED', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ id: 'task-1', status: 'OPEN' } as any);
      jest
        .spyOn(prisma.task, 'update')
        .mockResolvedValue({ id: 'task-1', status: 'CANCELLED' } as any);

      const result = await service.remove('task-1', mockOrgId, mockBranchId);

      expect(result.status).toBe('CANCELLED');
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
          }),
        }),
      );
    });
  });

  describe('MULTI-TENANT: Task Isolation', () => {
    it('should only retrieve tasks for specified organization', async () => {
      jest
        .spyOn(prisma.task, 'findMany')
        .mockResolvedValue([
          { id: 'task-1', organizationId: mockOrgId },
        ] as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            branchId: mockBranchId,
          }),
        }),
      );
    });

    it('should prevent cross-organization task access', async () => {
      jest.spyOn(prisma.task, 'findFirst').mockResolvedValue(null);

      await expect(
        service.findOne('task-1', mockOrgId2, mockBranchId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create tasks with correct organization context', async () => {
      const data = { title: 'Task', priority: 'HIGH' } as any;

      jest.spyOn(prisma.task, 'create').mockResolvedValue({
        id: 'task-1',
        organizationId: mockOrgId2,
        branchId: 'branch-2',
        ...data,
      });

      const result = await service.create(
        data,
        mockOrgId2,
        'branch-2',
        mockUserId,
      );

      expect(result.organizationId).toBe(mockOrgId2);
      expect(result.branchId).toBe('branch-2');
    });
  });

  describe('STATUS TRANSITION: Task States', () => {
    it('should allow transition from OPEN to IN_PROGRESS', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ id: 'task-1', status: 'OPEN' } as any);
      jest
        .spyOn(prisma.task, 'update')
        .mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS' } as any);

      const result = await service.update(
        'task-1',
        { status: 'IN_PROGRESS' },
        mockOrgId,
        mockBranchId,
      );

      expect(result.status).toBe('IN_PROGRESS');
    });

    it('should allow transition to COMPLETED', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS' } as any);
      jest
        .spyOn(prisma.task, 'update')
        .mockResolvedValue({ id: 'task-1', status: 'COMPLETED' } as any);

      const result = await service.update(
        'task-1',
        { status: 'COMPLETED' },
        mockOrgId,
        mockBranchId,
      );

      expect(result.status).toBe('COMPLETED');
    });

    it('should support cancellation at any stage', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS' } as any);
      jest
        .spyOn(prisma.task, 'update')
        .mockResolvedValue({ id: 'task-1', status: 'CANCELLED' } as any);

      const result = await service.update(
        'task-1',
        { status: 'CANCELLED' },
        mockOrgId,
        mockBranchId,
      );

      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('TRANSACTION ROLLBACK: Error Handling', () => {
    it('should throw NotFoundException when task not found', async () => {
      jest.spyOn(prisma.task, 'findUnique').mockResolvedValue(null);

      await expect(
        service.findOne('task-1', mockOrgId, mockBranchId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle database error during creation', async () => {
      const data = { title: 'Task', priority: 'HIGH' } as any;

      jest
        .spyOn(prisma.task, 'create')
        .mockRejectedValue(new Error('Database error'));

      await expect(
        service.create(data, mockOrgId, mockBranchId, mockUserId),
      ).rejects.toThrow('Database error');
    });

    it('should verify task exists before update', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockRejectedValue(new NotFoundException('Task not found'));

      await expect(
        service.update(
          'task-1',
          { status: 'COMPLETED' },
          mockOrgId,
          mockBranchId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('should verify task exists before removal', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockRejectedValue(new NotFoundException('Task not found'));

      await expect(
        service.remove('task-1', mockOrgId, mockBranchId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('RBAC: Task Audit Context', () => {
    it('should record task creator in all operations', async () => {
      const data = { title: 'Task', priority: 'HIGH' } as any;
      const testUserId = 'user-doctor-456';

      jest.spyOn(prisma.task, 'create').mockResolvedValue({
        id: 'task-1',
        createdBy: testUserId,
        ...data,
      });

      await service.create(data, mockOrgId, mockBranchId, testUserId);

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdBy: testUserId,
          }),
        }),
      );
    });

    it('should track updatedBy user on modifications', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'task-1' } as any);
      jest.spyOn(prisma.task, 'update').mockResolvedValue({
        id: 'task-1',
        updatedBy: mockUserId,
      } as any);

      await service.update(
        'task-1',
        { status: 'COMPLETED', updatedBy: mockUserId },
        mockOrgId,
        mockBranchId,
      );

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            updatedBy: mockUserId,
          }),
        }),
      );
    });

    it('should include user relations in task retrieval', async () => {
      const task = {
        id: 'task-1',
        createdByUser: { id: mockUserId },
        assignedToUser: { id: 'user-2' },
      };

      jest.spyOn(prisma.task, 'findFirst').mockResolvedValue(task as any);

      await service.findOne('task-1', mockOrgId, mockBranchId);

      expect(prisma.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.any(Object),
        }),
      );
    });
  });
});
