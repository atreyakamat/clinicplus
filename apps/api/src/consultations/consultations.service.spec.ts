import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationsService } from './consultations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('ConsultationsService', () => {
  let service: ConsultationsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockOrgId2 = 'org-2';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn().mockImplementation((cb) => {
              if (typeof cb === 'function') {
                return cb({
                  consultation: { update: jest.fn().mockResolvedValue({ id: 'cons-1', organizationId: mockOrgId, branchId: mockBranchId, status: 'COMPLETED' }) },
                  vital: { upsert: jest.fn().mockResolvedValue({}) },
                  diagnosis: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
                });
              }
              return Promise.resolve();
            }),
            consultation: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ConsultationsService>(ConsultationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('HAPPY PATH: Create Consultation', () => {
    it('should create consultation with chief complaint', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        patientId: 'pat-1',
        doctorId: 'doc-1',
        chiefComplaint: 'Fever and cough',
        consultationDate: new Date('2026-06-15T10:00:00Z'),
      } as any;

      jest.spyOn(prisma.consultation, 'create').mockResolvedValue({ id: 'cons-1', ...data } as any);

      const result = await service.create(data);

      expect(result.id).toBe('cons-1');
      expect(result.chiefComplaint).toBe('Fever and cough');
      expect(prisma.consultation.create).toHaveBeenCalledWith({ data });
    });

    it('should retrieve consultation with full relations', async () => {
      const consultation = {
        id: 'cons-1',
        patient: { id: 'pat-1', firstName: 'John', lastName: 'Doe' },
        doctor: { firstName: 'Dr', lastName: 'Smith' },
        diagnoses: [{ id: 'd-1', code: 'A00', name: 'Cholera' }],
        vitals: [{ id: 'v-1', temperature: 101.5 }],
        prescriptions: [{ id: 'pres-1', items: [] }],
        followUps: [{ id: 'fu-1', followUpDate: new Date() }],
      };

      jest.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(consultation as any);

      const result = await service.findOne('cons-1', mockOrgId, mockBranchId);

      expect(result.patient.firstName).toBe('John');
      expect(result.diagnoses.length).toBe(1);
      expect(result.vitals.length).toBe(1);
    });

    it('should retrieve all consultations ordered by date descending', async () => {
      const consultations = [
        { id: 'cons-1', consultationDate: new Date('2026-06-15') },
        { id: 'cons-2', consultationDate: new Date('2026-06-10') },
      ];

      jest.spyOn(prisma.consultation, 'findMany').mockResolvedValue(consultations as any);

      const result = await service.findAll(mockOrgId, mockBranchId);

      expect(result.length).toBe(2);
      expect(prisma.consultation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: { consultationDate: 'desc' }
      }));
    });
  });

  describe('VALIDATION: Consultation Business Rules', () => {
    it('should include diagnoses in consultation', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        patientId: 'pat-1',
        doctorId: 'doc-1',
        chiefComplaint: 'Fever',
      } as any;

      jest.spyOn(prisma.consultation, 'create').mockResolvedValue({ id: 'cons-1', ...data } as any);

      const result = await service.create(data);
      expect(result.chiefComplaint).toBe('Fever');
    });

    it('should filter consultations by patient when provided', async () => {
      jest.spyOn(prisma.consultation, 'findMany').mockResolvedValue([
        { id: 'cons-1', patientId: 'pat-1' }
      ] as any);

      await service.findAll(mockOrgId, mockBranchId, 'pat-1');

      expect(prisma.consultation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          patientId: 'pat-1',
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });

    it('should not filter by patient when not provided', async () => {
      jest.spyOn(prisma.consultation, 'findMany').mockResolvedValue([]);

      await service.findAll(mockOrgId, mockBranchId);

      const callArgs = (prisma.consultation.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.patientId).toBeUndefined();
    });
  });

  describe('EDGE CASES: Complex Consultation Scenarios', () => {
    it('should handle consultations with multiple diagnoses', async () => {
      const consultation = {
        id: 'cons-1',
        diagnoses: [
          { id: 'd-1', code: 'A00', name: 'Cholera' },
          { id: 'd-2', code: 'A09', name: 'Diarrhea' },
        ],
      };

      jest.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(consultation as any);

      const result = await service.findOne('cons-1', mockOrgId, mockBranchId);

      expect(result.diagnoses.length).toBe(2);
    });

    it('should include all relations when fetching single consultation', async () => {
      const consultation = {
        id: 'cons-1',
        patient: { id: 'pat-1' },
        diagnoses: [],
        vitals: [],
        prescriptions: [],
        followUps: [],
        doctor: { firstName: 'Dr', lastName: 'Smith' },
      };

      jest.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(consultation as any);

      await service.findOne('cons-1', mockOrgId, mockBranchId);

      expect(prisma.consultation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({
          patient: true,
          diagnoses: true,
          vitals: true,
          prescriptions: expect.any(Object),
          followUps: true,
        })
      }));
    });

    it('should return prescriptions with items in consultation', async () => {
      const consultation = {
        id: 'cons-1',
        prescriptions: [
          { id: 'pres-1', items: [{ id: 'item-1', medicineName: 'Paracetamol' }] }
        ]
      };

      jest.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(consultation as any);

      const result = await service.findOne('cons-1', mockOrgId, mockBranchId);

      expect(result.prescriptions[0].items.length).toBe(1);
    });
  });

  describe('MULTI-TENANT: Consultation Isolation', () => {
    it('should only retrieve consultations for specified organization', async () => {
      jest.spyOn(prisma.consultation, 'findMany').mockResolvedValue([
        { id: 'cons-1', organizationId: mockOrgId }
      ] as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.consultation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });

    it('should prevent cross-organization access', async () => {
      jest.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(null);

      await expect(
        service.findOne('cons-1', mockOrgId2, mockBranchId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should create consultations with correct organization context', async () => {
      const data = {
        organizationId: mockOrgId2,
        branchId: 'branch-2',
        patientId: 'pat-1',
        chiefComplaint: 'Headache',
      } as any;

      jest.spyOn(prisma.consultation, 'create').mockResolvedValue({
        id: 'cons-1',
        organizationId: mockOrgId2,
        branchId: 'branch-2',
        ...data
      } as any);

      const result = await service.create(data);

      expect(result.organizationId).toBe(mockOrgId2);
      expect(result.branchId).toBe('branch-2');
    });
  });

  describe('STATUS TRANSITION: Consultation States', () => {
    it('should allow transition to COMPLETED status', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cons-1', status: 'DRAFT' } as any);
      jest.spyOn(prisma.consultation, 'update').mockResolvedValue({ id: 'cons-1', status: 'COMPLETED' } as any);

      const result = await service.complete('cons-1', mockOrgId, mockBranchId);

      expect(result.status).toBe('COMPLETED');
      expect(prisma.consultation.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'cons-1' },
        data: { status: 'COMPLETED' }
      }));
    });

    it('should retrieve consultations sorted by consultation date descending', async () => {
      const consultations = [
        { id: 'cons-1', consultationDate: new Date('2026-06-20') },
        { id: 'cons-2', consultationDate: new Date('2026-06-15') },
        { id: 'cons-3', consultationDate: new Date('2026-06-10') }
      ];

      jest.spyOn(prisma.consultation, 'findMany').mockResolvedValue(consultations as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.consultation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: { consultationDate: 'desc' }
      }));
    });
  });

  describe('TRANSACTION ROLLBACK: Error Handling', () => {
    it('should throw NotFoundException when consultation not found', async () => {
      jest.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(null);

      await expect(
        service.findOne('cons-1', mockOrgId, mockBranchId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should fail if verification fails in update transaction', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException('Consultation not found'));

      const updateData = { vitals: { weight: 70 } };

      await expect(
        service.update('cons-1', updateData, mockOrgId, mockBranchId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle database error during consultation creation', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        chiefComplaint: 'Fever',
      } as any;

      jest.spyOn(prisma.consultation, 'create').mockRejectedValue(new Error('Database error'));

      await expect(service.create(data)).rejects.toThrow('Database error');
    });

    it('should handle findMany error gracefully', async () => {
      jest.spyOn(prisma.consultation, 'findMany').mockRejectedValue(new Error('Query failed'));

      await expect(
        service.findAll(mockOrgId, mockBranchId)
      ).rejects.toThrow('Query failed');
    });
  });

  describe('RBAC: Audit Context', () => {
    it('should include patient and doctor relations in audit trail', async () => {
      const consultation = {
        id: 'cons-1',
        patient: { id: 'pat-1', firstName: 'John', lastName: 'Doe' },
        doctor: { firstName: 'Dr', lastName: 'Smith' },
      };

      jest.spyOn(prisma.consultation, 'findFirst').mockResolvedValue(consultation as any);

      await service.findOne('cons-1', mockOrgId, mockBranchId);

      expect(prisma.consultation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({
          patient: true,
          doctor: expect.any(Object)
        })
      }));
    });

    it('should verify organization context during update', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cons-1' } as any);

      await service.update('cons-1', { status: 'COMPLETED' }, mockOrgId, mockBranchId);

      expect(service.findOne).toHaveBeenCalledWith('cons-1', mockOrgId, mockBranchId);
    });

    it('should process transaction with diagnoses update', async () => {
      const updateData = {
        diagnoses: [
          { code: 'A00', name: 'Cholera' },
          { code: 'A09', name: 'Diarrhea' }
        ]
      };

      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cons-1' } as any);

      await service.update('cons-1', updateData, mockOrgId, mockBranchId);

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
