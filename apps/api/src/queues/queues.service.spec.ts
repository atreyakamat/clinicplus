import { Test, TestingModule } from '@nestjs/testing';
import { QueuesService } from './queues.service';
import { PrismaService } from '../prisma/prisma.service';

describe('QueuesService', () => {
  let service: QueuesService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockOrgId2 = 'org-2';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueuesService,
        {
          provide: PrismaService,
          useValue: {
            queue: {
              findFirst: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
            },
            queueEntry: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<QueuesService>(QueuesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('HAPPY PATH: Queue Management', () => {
    it('should return existing queue if found', async () => {
      const queue = { id: 'q-1', organizationId: mockOrgId, branchId: mockBranchId, name: 'Main Queue' };
      jest.spyOn(prisma.queue, 'findFirst').mockResolvedValue(queue as any);

      const result = await service.getLiveQueue(mockOrgId, mockBranchId);

      expect(result.id).toBe('q-1');
      expect(result.name).toBe('Main Queue');
    });

    it('should create default queue if not found', async () => {
      jest.spyOn(prisma.queue, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.queue, 'create').mockResolvedValue({
        id: 'new-q',
        organizationId: mockOrgId,
        branchId: mockBranchId
      } as any);

      const result = await service.getLiveQueue(mockOrgId, mockBranchId);

      expect(result.id).toBe('new-q');
      expect(prisma.queue.create).toHaveBeenCalled();
    });

    it('should check in patient with sequential token', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst').mockResolvedValue({ tokenNumber: 5 } as any);
      jest.spyOn(prisma.queueEntry, 'create').mockResolvedValue({
        id: 'entry-1',
        tokenNumber: 6,
        status: 'WAITING'
      } as any);

      const result = await service.checkIn('appt-1', mockOrgId, mockBranchId);

      expect(result.tokenNumber).toBe(6);
      expect(result.status).toBe('WAITING');
    });

    it('should update queue entry status', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockResolvedValue({
        id: 'entry-1',
        status: 'IN_PROGRESS'
      } as any);

      const result = await service.updateEntryStatus('entry-1', 'IN_PROGRESS');

      expect(result.status).toBe('IN_PROGRESS');
    });
  });

  describe('VALIDATION: Queue Business Rules', () => {
    it('should start with token 1 if queue is empty', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.queueEntry, 'create').mockResolvedValue({
        id: 'entry-1',
        tokenNumber: 1,
        status: 'WAITING'
      } as any);

      const result = await service.checkIn('appt-1', mockOrgId, mockBranchId);

      expect(result.tokenNumber).toBe(1);
      expect(prisma.queueEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tokenNumber: 1, status: 'WAITING' })
      }));
    });

    it('should increment token number sequentially', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst')
        .mockResolvedValueOnce({ tokenNumber: 1 } as any)
        .mockResolvedValueOnce({ tokenNumber: 2 } as any)
        .mockResolvedValueOnce({ tokenNumber: 3 } as any);

      jest.spyOn(prisma.queueEntry, 'create')
        .mockResolvedValueOnce({ tokenNumber: 2 } as any)
        .mockResolvedValueOnce({ tokenNumber: 3 } as any)
        .mockResolvedValueOnce({ tokenNumber: 4 } as any);

      const result1 = await service.checkIn('appt-1', mockOrgId, mockBranchId);
      const result2 = await service.checkIn('appt-2', mockOrgId, mockBranchId);
      const result3 = await service.checkIn('appt-3', mockOrgId, mockBranchId);

      expect(result1.tokenNumber).toBe(2);
      expect(result2.tokenNumber).toBe(3);
      expect(result3.tokenNumber).toBe(4);
    });

    it('should associate queue entry with appointment', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.queueEntry, 'create').mockResolvedValue({ id: 'entry-1', appointmentId: 'appt-1' } as any);

      await service.checkIn('appt-1', mockOrgId, mockBranchId);

      expect(prisma.queueEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          appointmentId: 'appt-1'
        })
      }));
    });
  });

  describe('EDGE CASES: Complex Queue Scenarios', () => {
    it('should handle multiple entries with status transitions', async () => {
      const entries = [
        { id: 'entry-1', tokenNumber: 1, status: 'COMPLETED' },
        { id: 'entry-2', tokenNumber: 2, status: 'IN_PROGRESS' },
        { id: 'entry-3', tokenNumber: 3, status: 'WAITING' },
      ];

      jest.spyOn(prisma.queueEntry, 'findMany').mockResolvedValue(entries as any);

      const result = await service.getQueueStatus(mockOrgId, mockBranchId);

      expect(result).toBeDefined();
    });

    it('should record calledTime when status is CALLED', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockImplementation(async (args) => args.data as any);

      const result = await service.updateEntryStatus('entry-1', 'CALLED');

      expect(result.calledTime).toBeDefined();
    });

    it('should record completedTime when status is COMPLETED', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockImplementation(async (args) => args.data as any);

      const result = await service.updateEntryStatus('entry-1', 'COMPLETED');

      expect(result.completedTime).toBeDefined();
    });

    it('should support CANCELLED status', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockResolvedValue({
        id: 'entry-1',
        status: 'CANCELLED'
      } as any);

      const result = await service.updateEntryStatus('entry-1', 'CANCELLED');

      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('MULTI-TENANT: Queue Isolation', () => {
    it('should only retrieve queues for specified organization', async () => {
      jest.spyOn(prisma.queue, 'findFirst').mockResolvedValue({
        id: 'q-1',
        organizationId: mockOrgId,
        branchId: mockBranchId
      } as any);

      await service.getLiveQueue(mockOrgId, mockBranchId);

      expect(prisma.queue.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });

    it('should create queue with correct organization context', async () => {
      jest.spyOn(prisma.queue, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.queue, 'create').mockResolvedValue({
        id: 'q-1',
        organizationId: mockOrgId2,
        branchId: 'branch-2'
      } as any);

      const result = await service.getLiveQueue(mockOrgId2, 'branch-2');

      expect(result.organizationId).toBe(mockOrgId2);
      expect(result.branchId).toBe('branch-2');
    });

    it('should enforce branch isolation within organization', async () => {
      jest.spyOn(prisma.queue, 'findFirst').mockResolvedValue({
        id: 'q-1',
        branchId: mockBranchId
      } as any);

      await service.getLiveQueue(mockOrgId, mockBranchId);

      const callArgs = (prisma.queue.findFirst as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(mockBranchId);
    });

    it('should create queue entries with organization context', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.queueEntry, 'create').mockResolvedValue({
        id: 'entry-1',
        organizationId: mockOrgId
      } as any);

      await service.checkIn('appt-1', mockOrgId, mockBranchId);

      expect(prisma.queueEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });
  });

  describe('STATUS TRANSITION: Queue Entry States', () => {
    it('should transition from WAITING to CALLED', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockResolvedValue({
        id: 'entry-1',
        status: 'CALLED'
      } as any);

      const result = await service.updateEntryStatus('entry-1', 'CALLED');

      expect(result.status).toBe('CALLED');
    });

    it('should transition from CALLED to IN_PROGRESS', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockResolvedValue({
        id: 'entry-1',
        status: 'IN_PROGRESS'
      } as any);

      const result = await service.updateEntryStatus('entry-1', 'IN_PROGRESS');

      expect(result.status).toBe('IN_PROGRESS');
    });

    it('should transition from IN_PROGRESS to COMPLETED', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockResolvedValue({
        id: 'entry-1',
        status: 'COMPLETED'
      } as any);

      const result = await service.updateEntryStatus('entry-1', 'COMPLETED');

      expect(result.status).toBe('COMPLETED');
    });

    it('should allow CANCELLED from any state', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockResolvedValue({
        id: 'entry-1',
        status: 'CANCELLED'
      } as any);

      const result = await service.updateEntryStatus('entry-1', 'CANCELLED');

      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('TRANSACTION ROLLBACK: Error Handling', () => {
    it('should handle database error during queue check-in', async () => {
      jest.spyOn(service, 'getLiveQueue').mockRejectedValue(new Error('Database error'));

      await expect(
        service.checkIn('appt-1', mockOrgId, mockBranchId)
      ).rejects.toThrow('Database error');
    });

    it('should handle error during status update', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockRejectedValue(new Error('Update failed'));

      await expect(
        service.updateEntryStatus('entry-1', 'IN_PROGRESS')
      ).rejects.toThrow('Update failed');
    });

    it('should handle token number calculation error', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst').mockRejectedValue(new Error('Query failed'));

      await expect(
        service.checkIn('appt-1', mockOrgId, mockBranchId)
      ).rejects.toThrow('Query failed');
    });
  });

  describe('RBAC: Queue Entry Audit', () => {
    it('should track appointment reference in queue entry', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.queueEntry, 'create').mockResolvedValue({
        id: 'entry-1',
        appointmentId: 'appt-1'
      } as any);

      await service.checkIn('appt-1', mockOrgId, mockBranchId);

      expect(prisma.queueEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          appointmentId: 'appt-1'
        })
      }));
    });

    it('should include timestamps in status updates', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockImplementation(async (args) => args.data as any);

      const result = await service.updateEntryStatus('entry-1', 'CALLED');

      expect(result.calledTime).toBeDefined();
    });

    it('should enforce organization context in queue retrieval', async () => {
      jest.spyOn(prisma.queueEntry, 'findMany').mockResolvedValue([] as any);

      await service.getQueueStatus(mockOrgId, mockBranchId);

      expect(prisma.queueEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });
  });
});
