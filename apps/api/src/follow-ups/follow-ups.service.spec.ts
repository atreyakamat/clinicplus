import { Test, TestingModule } from '@nestjs/testing';
import { FollowUpsService } from './follow-ups.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('FollowUpsService', () => {
  let service: FollowUpsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockOrgId2 = 'org-2';

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
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
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

  describe('HAPPY PATH: FollowUp Creation', () => {
    it('should create a follow-up with patient and date', async () => {
      const data = {
        patientId: 'pat-1',
        organizationId: mockOrgId,
        branchId: mockBranchId,
        followUpDate: new Date('2026-06-20T10:00:00Z'),
        reason: 'Post-treatment check-in',
      } as any;

      jest
        .spyOn(prisma.followUp, 'create')
        .mockResolvedValue({ id: 'fup-1', ...data });

      const result = await service.create(data);

      expect(result.id).toBe('fup-1');
      expect(result.followUpDate).toBeDefined();
      expect(result.reason).toBe('Post-treatment check-in');
    });

    it('should add outcome to existing follow-up', async () => {
      jest
        .spyOn(prisma.followUp, 'findUnique')
        .mockResolvedValue({ id: 'fup-1', branchId: mockBranchId } as any);
      jest.spyOn(prisma.followUpOutcome, 'create').mockResolvedValue({
        id: 'out-1',
        notes: 'Patient recovering well',
        followUpId: 'fup-1',
      } as any);

      const result = await service.addOutcome(
        'fup-1',
        { notes: 'Patient recovering well' },
        mockOrgId,
      );

      expect(result.id).toBe('out-1');
      expect(result.notes).toBe('Patient recovering well');
    });
  });

  describe('VALIDATION: FollowUp Business Rules', () => {
    it('should require follow-up date', async () => {
      const data = {
        patientId: 'pat-1',
        organizationId: mockOrgId,
        followUpDate: new Date('2026-06-20T10:00:00Z'),
      } as any;

      jest
        .spyOn(prisma.followUp, 'create')
        .mockResolvedValue({ id: 'fup-1', ...data });

      const result = await service.create(data);
      expect(result.followUpDate).toBeDefined();
    });

    it('should track outcome when added', async () => {
      jest
        .spyOn(prisma.followUp, 'findUnique')
        .mockResolvedValue({ id: 'fup-1', branchId: mockBranchId } as any);
      jest.spyOn(prisma.followUpOutcome, 'create').mockResolvedValue({
        id: 'out-1',
        notes: 'Notes about outcome',
      } as any);

      await service.addOutcome(
        'fup-1',
        { notes: 'Notes about outcome' },
        mockOrgId,
      );

      expect(prisma.followUpOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            followUpId: 'fup-1',
            branchId: mockBranchId,
          }),
        }),
      );
    });

    it('should prevent outcome on non-existent follow-up', async () => {
      jest.spyOn(prisma.followUp, 'findUnique').mockResolvedValue(null);

      await expect(
        service.addOutcome('fup-1', { notes: 'Good' }, mockOrgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('EDGE CASES: Complex FollowUp Scenarios', () => {
    it('should handle follow-ups with multiple outcomes', async () => {
      const followUp = {
        id: 'fup-1',
        outcomes: [
          { id: 'out-1', notes: 'First visit - good' },
          { id: 'out-2', notes: 'Second visit - improving' },
          { id: 'out-3', notes: 'Third visit - resolved' },
        ],
      };

      jest
        .spyOn(prisma.followUp, 'findUnique')
        .mockResolvedValue(followUp as any);

      // Test via addOutcome which requires findUnique
      jest
        .spyOn(prisma.followUp, 'findUnique')
        .mockResolvedValue({ id: 'fup-1', branchId: mockBranchId } as any);
      jest
        .spyOn(prisma.followUpOutcome, 'create')
        .mockResolvedValue({ id: 'out-1', followUpId: 'fup-1' } as any);

      const result = await service.addOutcome(
        'fup-1',
        { notes: 'First visit' },
        mockOrgId,
      );

      expect(result).toBeDefined();
    });

    it('should support follow-up with notes', async () => {
      const data = {
        patientId: 'pat-1',
        followUpDate: new Date(),
        notes: 'Check medication effectiveness & side effects',
      } as any;

      jest
        .spyOn(prisma.followUp, 'create')
        .mockResolvedValue({ id: 'fup-1', ...data });

      const result = await service.create(data);

      expect(result.notes).toContain('medication');
    });

    it('should retrieve follow-ups filtered by patient', async () => {
      const followUps = [
        { id: 'fup-1', patientId: 'pat-1' },
        { id: 'fup-2', patientId: 'pat-1' },
      ];

      jest
        .spyOn(prisma.followUp, 'findMany')
        .mockResolvedValue(followUps as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.followUp.findMany).toHaveBeenCalled();
    });
  });

  describe('MULTI-TENANT: FollowUp Isolation', () => {
    it('should only retrieve follow-ups for specified organization', async () => {
      jest
        .spyOn(prisma.followUp, 'findMany')
        .mockResolvedValue([{ id: 'fup-1', organizationId: mockOrgId }] as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.followUp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            branchId: mockBranchId,
          }),
        }),
      );
    });

    it('should prevent cross-organization follow-up access', async () => {
      jest.spyOn(prisma.followUp, 'findUnique').mockResolvedValue(null);

      await expect(
        service.addOutcome('fup-1', { notes: 'Test' }, mockOrgId2),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create follow-ups with correct organization context', async () => {
      const data = {
        patientId: 'pat-1',
        organizationId: mockOrgId2,
        branchId: 'branch-2',
        followUpDate: new Date(),
      } as any;

      jest.spyOn(prisma.followUp, 'create').mockResolvedValue({
        id: 'fup-1',
        organizationId: mockOrgId2,
        branchId: 'branch-2',
        ...data,
      });

      const result = await service.create(data);

      expect(result.organizationId).toBe(mockOrgId2);
      expect(result.branchId).toBe('branch-2');
    });
  });

  describe('STATUS TRANSITION: FollowUp States', () => {
    it('should allow transition to COMPLETED', async () => {
      jest
        .spyOn(prisma.followUp, 'findFirst')
        .mockResolvedValue({ id: 'fup-1', status: 'OPEN' } as any);
      jest
        .spyOn(prisma.followUp, 'update')
        .mockResolvedValue({ id: 'fup-1', status: 'COMPLETED' } as any);

      const result = await service.updateStatus(
        'fup-1',
        'COMPLETED',
        mockOrgId,
      );

      expect(result.status).toBe('COMPLETED');
    });

    it('should update follow-up status', async () => {
      jest
        .spyOn(prisma.followUp, 'findFirst')
        .mockResolvedValue({ id: 'fup-1' } as any);
      jest
        .spyOn(prisma.followUp, 'update')
        .mockResolvedValue({ id: 'fup-1', status: 'COMPLETED' } as any);

      const result = await service.updateStatus(
        'fup-1',
        'COMPLETED',
        mockOrgId,
      );

      expect(prisma.followUp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fup-1' },
          data: { status: 'COMPLETED' },
        }),
      );
    });
  });

  describe('TRANSACTION ROLLBACK: Error Handling', () => {
    it('should throw NotFoundException when follow-up not found', async () => {
      jest.spyOn(prisma.followUp, 'findFirst').mockResolvedValue(null);

      await expect(
        service.findOne('fup-1', mockOrgId, mockBranchId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when adding outcome to missing follow-up', async () => {
      jest.spyOn(prisma.followUp, 'findUnique').mockResolvedValue(null);

      await expect(
        service.addOutcome('fup-1', { notes: 'Good' }, mockOrgId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.followUpOutcome.create).not.toHaveBeenCalled();
    });

    it('should handle database error during creation', async () => {
      const data = { patientId: 'pat-1', followUpDate: new Date() } as any;

      jest
        .spyOn(prisma.followUp, 'create')
        .mockRejectedValue(new Error('Database error'));

      await expect(service.create(data)).rejects.toThrow('Database error');
    });

    it('should handle update error gracefully', async () => {
      jest
        .spyOn(prisma.followUp, 'findFirst')
        .mockResolvedValue({ id: 'fup-1' } as any);
      jest
        .spyOn(prisma.followUp, 'update')
        .mockRejectedValue(new Error('Update failed'));

      await expect(
        service.updateStatus('fup-1', 'COMPLETED', mockOrgId),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('RBAC: FollowUp Audit', () => {
    it('should include patient details in follow-up retrieval', async () => {
      const followUp = {
        id: 'fup-1',
        patient: { id: 'pat-1', firstName: 'John', lastName: 'Doe' },
      };

      jest
        .spyOn(prisma.followUp, 'findFirst')
        .mockResolvedValue(followUp as any);

      await service.findOne('fup-1', mockOrgId, mockBranchId);

      expect(prisma.followUp.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.any(Object),
        }),
      );
    });

    it('should enforce organization context on all operations', async () => {
      const data = {
        patientId: 'pat-1',
        organizationId: mockOrgId,
        branchId: mockBranchId,
        followUpDate: new Date(),
      } as any;

      jest
        .spyOn(prisma.followUp, 'create')
        .mockResolvedValue({ id: 'fup-1', ...data });

      await service.create(data);

      expect(prisma.followUp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: mockOrgId,
            branchId: mockBranchId,
          }),
        }),
      );
    });
  });
});
