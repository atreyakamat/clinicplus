import { Test, TestingModule } from '@nestjs/testing';
import { FollowUpsService } from './follow-ups.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('FollowUpsService', () => {
  let service: FollowUpsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpsService,
        {
          provide: PrismaService,
          useValue: {
            followUp: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            followUpOutcome: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<FollowUpsService>(FollowUpsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    it('should create a follow-up', async () => {
      const data = { patientId: 'pat-1', organizationId: mockOrgId, branchId: mockBranchId };
      jest.spyOn(prisma.followUp, 'create').mockResolvedValue({ id: 'fup-1', ...data } as any);

      const result = await service.create(data);
      expect(result.id).toBe('fup-1');
    });
  });

  describe('addOutcome', () => {
    it('should create an outcome for an existing follow-up', async () => {
      jest.spyOn(prisma.followUp, 'findUnique').mockResolvedValue({ id: 'fup-1', branchId: mockBranchId } as any);
      jest.spyOn(prisma.followUpOutcome, 'create').mockResolvedValue({ id: 'out-1' } as any);

      const result = await service.addOutcome('fup-1', { notes: 'Good' }, mockOrgId);
      expect(result.id).toBe('out-1');
      expect(prisma.followUpOutcome.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ followUpId: 'fup-1', branchId: mockBranchId })
      }));
    });

    it('should throw NotFoundException if follow-up missing', async () => {
      jest.spyOn(prisma.followUp, 'findUnique').mockResolvedValue(null);
      await expect(service.addOutcome('fup-1', { notes: 'Good' }, mockOrgId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update follow-up status', async () => {
      jest.spyOn(prisma.followUp, 'findUnique').mockResolvedValue({ id: 'fup-1' } as any);
      jest.spyOn(prisma.followUp, 'update').mockResolvedValue({ id: 'fup-1', status: 'COMPLETED' } as any);

      const result = await service.updateStatus('fup-1', 'COMPLETED', mockOrgId);
      expect(result.status).toBe('COMPLETED');
    });
  });
});
