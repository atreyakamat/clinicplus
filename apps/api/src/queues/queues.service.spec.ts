import { Test, TestingModule } from '@nestjs/testing';
import { QueuesService } from './queues.service';
import { PrismaService } from '../prisma/prisma.service';

describe('QueuesService', () => {
  let service: QueuesService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';

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
            },
            queueEntry: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<QueuesService>(QueuesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getLiveQueue', () => {
    it('should return existing queue if found', async () => {
      jest.spyOn(prisma.queue, 'findFirst').mockResolvedValue({ id: 'q-1' } as any);
      const result = await service.getLiveQueue(mockOrgId, mockBranchId);
      expect(result.id).toBe('q-1');
    });

    it('should create default queue if not found', async () => {
      jest.spyOn(prisma.queue, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.queue, 'create').mockResolvedValue({ id: 'new-q' } as any);
      const result = await service.getLiveQueue(mockOrgId, mockBranchId);
      expect(result.id).toBe('new-q');
      expect(prisma.queue.create).toHaveBeenCalled();
    });
  });

  describe('checkIn', () => {
    it('should create queue entry with incremented token', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst').mockResolvedValue({ tokenNumber: 5 } as any);
      jest.spyOn(prisma.queueEntry, 'create').mockResolvedValue({ id: 'entry-1', tokenNumber: 6 } as any);

      const result = await service.checkIn('appt-1', mockOrgId, mockBranchId);
      expect(result.tokenNumber).toBe(6);
      expect(prisma.queueEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tokenNumber: 6, status: 'WAITING' })
      }));
    });

    it('should start with token 1 if queue is empty', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      jest.spyOn(prisma.queueEntry, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.queueEntry, 'create').mockResolvedValue({ id: 'entry-1', tokenNumber: 1 } as any);

      const result = await service.checkIn('appt-1', mockOrgId, mockBranchId);
      expect(result.tokenNumber).toBe(1);
    });
  });

  describe('updateEntryStatus', () => {
    it('should update status to IN_PROGRESS', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockResolvedValue({ id: 'entry-1', status: 'IN_PROGRESS' } as any);
      const result = await service.updateEntryStatus('entry-1', 'IN_PROGRESS');
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('should add calledTime when status is CALLED', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockImplementation(async (args) => args.data as any);
      const result = await service.updateEntryStatus('entry-1', 'CALLED');
      expect(result.calledTime).toBeDefined();
    });

    it('should add completedTime when status is COMPLETED', async () => {
      jest.spyOn(prisma.queueEntry, 'update').mockImplementation(async (args) => args.data as any);
      const result = await service.updateEntryStatus('entry-1', 'COMPLETED');
      expect(result.completedTime).toBeDefined();
    });
  });
});
