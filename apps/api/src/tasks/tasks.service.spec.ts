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
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    it('should create a task', async () => {
      const data = { title: 'Call patient', priority: 'HIGH' } as any;
      jest.spyOn(prisma.task, 'create').mockResolvedValue({ id: 'task-1', ...data } as any);

      const result = await service.create(data, mockOrgId, mockBranchId, mockUserId);
      expect(result.id).toBe('task-1');
    });
  });

  describe('findAll', () => {
    it('should list tasks for organization', async () => {
      jest.spyOn(prisma.task, 'findMany').mockResolvedValue([{ id: 'task-1' }] as any);
      const result = await service.findAll(mockOrgId, mockBranchId);
      expect(result.length).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return task if exists', async () => {
      jest.spyOn(prisma.task, 'findUnique').mockResolvedValue({ id: 'task-1' } as any);
      const result = await service.findOne('task-1', mockOrgId, mockBranchId);
      expect(result.id).toBe('task-1');
    });

    it('should throw NotFoundException if missing', async () => {
      jest.spyOn(prisma.task, 'findUnique').mockResolvedValue(null);
      await expect(service.findOne('task-1', mockOrgId, mockBranchId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update task and retain updatedBy', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'task-1' } as any);
      jest.spyOn(prisma.task, 'update').mockResolvedValue({ id: 'task-1', status: 'COMPLETED' } as any);

      const result = await service.update('task-1', { status: 'COMPLETED', updatedBy: 'user-2' }, mockOrgId, mockBranchId);
      expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ updatedBy: 'user-2' })
      }));
    });
  });

  describe('remove', () => {
    it('should soft delete task', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'task-1' } as any);
      jest.spyOn(prisma.task, 'update').mockResolvedValue({ id: 'task-1', status: 'CANCELLED' } as any);

      const result = await service.remove('task-1', mockOrgId, mockBranchId);
      expect(result.status).toBe('CANCELLED');
    });
  });
});
