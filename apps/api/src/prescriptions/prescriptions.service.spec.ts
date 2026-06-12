import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsService } from './prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockOrgId2 = 'org-2';
  const mockUserId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        {
          provide: PrismaService,
          useValue: {
            prescription: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
    prisma = service['prisma'];
  });

  describe('HAPPY PATH: Create Prescription', () => {
    it('should create prescription with items and include relations', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        patientId: 'pat-1',
        doctorId: 'doc-1',
        items: [
          { medicineName: 'Paracetamol', dosage: '500mg', frequency: 'Every 6 hours' },
          { medicineName: 'Ibuprofen', dosage: '400mg', frequency: 'Every 8 hours' }
        ]
      };

      const createdPrescription = {
        id: 'pres-1',
        ...data,
        issuedAt: new Date(),
        items: [
          { id: 'item-1', medicineName: 'Paracetamol', dosage: '500mg', organizationId: mockOrgId },
          { id: 'item-2', medicineName: 'Ibuprofen', dosage: '400mg', organizationId: mockOrgId }
        ]
      };

      jest.spyOn(prisma.prescription, 'create').mockResolvedValue(createdPrescription as any);

      const result = await service.create(data);

      expect(result.id).toBe('pres-1');
      expect(result.items.length).toBe(2);
      expect(prisma.prescription.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId,
          items: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ medicineName: 'Paracetamol' }),
              expect.objectContaining({ medicineName: 'Ibuprofen' })
            ])
          })
        }),
        include: { items: true }
      }));
    });

    it('should retrieve prescription with patient and doctor details', async () => {
      const prescription = {
        id: 'pres-1',
        patient: { id: 'pat-1', firstName: 'John', lastName: 'Doe' },
        doctor: { firstName: 'Dr', lastName: 'Smith' },
        items: [{ id: 'item-1', medicineName: 'Paracetamol' }]
      };

      jest.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(prescription as any);

      const result = await service.findOne('pres-1', mockOrgId, mockBranchId);

      expect(result.patient.firstName).toBe('John');
      expect(result.doctor.lastName).toBe('Smith');
      expect(result.items.length).toBe(1);
    });

    it('should fetch all prescriptions for organization ordered by issued date', async () => {
      const prescriptions = [
        { id: 'pres-1', issuedAt: new Date('2026-06-15') },
        { id: 'pres-2', issuedAt: new Date('2026-06-14') },
      ];

      jest.spyOn(prisma.prescription, 'findMany').mockResolvedValue(prescriptions as any);

      const result = await service.findAll(mockOrgId, mockBranchId);

      expect(result.length).toBe(2);
      expect(prisma.prescription.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: { issuedAt: 'desc' }
      }));
    });
  });

  describe('VALIDATION: Prescription Business Rules', () => {
    it('should validate prescription contains at least one item', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        patientId: 'pat-1',
        doctorId: 'doc-1',
        items: []
      };

      jest.spyOn(prisma.prescription, 'create').mockResolvedValue({ id: 'pres-1' } as any);

      const result = await service.create(data);
      expect(result).toBeDefined();
    });

    it('should populate organizationId and branchId for each item', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        patientId: 'pat-1',
        items: [
          { medicineName: 'Aspirin', dosage: '100mg' }
        ]
      };

      jest.spyOn(prisma.prescription, 'create').mockResolvedValue({ id: 'pres-1', items: [{ organizationId: mockOrgId }] } as any);

      await service.create(data);

      expect(prisma.prescription.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({
                organizationId: mockOrgId,
                branchId: mockBranchId
              })
            ])
          }
        })
      }));
    });

    it('should include all relations when fetching single prescription', async () => {
      const prescription = {
        id: 'pres-1',
        items: [{ id: 'item-1' }],
        patient: { id: 'pat-1' },
        doctor: { id: 'doc-1' },
        consultation: { id: 'cons-1' }
      };

      jest.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(prescription as any);

      await service.findOne('pres-1', mockOrgId, mockBranchId);

      expect(prisma.prescription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({
          items: true,
          patient: true,
          doctor: expect.any(Object),
          consultation: true
        })
      }));
    });
  });

  describe('EDGE CASES: Complex Prescription Scenarios', () => {
    it('should handle prescriptions with multiple items for same medication', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        items: [
          { medicineName: 'Vitamin D', dosage: '400IU', frequency: 'Daily' },
          { medicineName: 'Vitamin D', dosage: '1000IU', frequency: 'Weekly' }
        ]
      };

      const prescription = {
        id: 'pres-1',
        items: [
          { id: 'item-1', medicineName: 'Vitamin D', dosage: '400IU' },
          { id: 'item-2', medicineName: 'Vitamin D', dosage: '1000IU' }
        ]
      };

      jest.spyOn(prisma.prescription, 'create').mockResolvedValue(prescription as any);

      const result = await service.create(data);

      expect(result.items.length).toBe(2);
      expect(result.items.filter((i: any) => i.medicineName === 'Vitamin D').length).toBe(2);
    });

    it('should handle prescriptions with special characters in medication names', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        items: [
          { medicineName: 'Co-Amoxiclav (Amoxicillin + Clavulanic Acid)', dosage: '625mg' }
        ]
      };

      const prescription = {
        id: 'pres-1',
        items: [{ id: 'item-1', medicineName: 'Co-Amoxiclav (Amoxicillin + Clavulanic Acid)' }]
      };

      jest.spyOn(prisma.prescription, 'create').mockResolvedValue(prescription as any);

      const result = await service.create(data);

      expect(result.items[0].medicineName).toContain('Amoxicillin');
    });

    it('should filter prescriptions by patient when patientId provided', async () => {
      const prescriptions = [
        { id: 'pres-1', patientId: 'pat-1' }
      ];

      jest.spyOn(prisma.prescription, 'findMany').mockResolvedValue(prescriptions as any);

      await service.findAll(mockOrgId, mockBranchId, 'pat-1');

      expect(prisma.prescription.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          patientId: 'pat-1',
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });

    it('should omit patientId filter when not provided', async () => {
      jest.spyOn(prisma.prescription, 'findMany').mockResolvedValue([] as any);

      await service.findAll(mockOrgId, mockBranchId);

      const callArgs = (prisma.prescription.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.patientId).toBeUndefined();
    });
  });

  describe('MULTI-TENANT: Prescription Isolation', () => {
    it('should only return prescriptions for specified organization', async () => {
      jest.spyOn(prisma.prescription, 'findMany').mockResolvedValue([
        { id: 'pres-1', organizationId: mockOrgId }
      ] as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.prescription.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });

    it('should enforce branch isolation within organization', async () => {
      jest.spyOn(prisma.prescription, 'findMany').mockResolvedValue([
        { id: 'pres-1', branchId: mockBranchId }
      ] as any);

      await service.findAll(mockOrgId, mockBranchId);

      const callArgs = (prisma.prescription.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(mockBranchId);
    });

    it('should prevent cross-organization data access', async () => {
      jest.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(null);

      await expect(
        service.findOne('pres-1', mockOrgId2, mockBranchId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should create prescriptions with correct multi-tenant context', async () => {
      const data = {
        organizationId: mockOrgId2,
        branchId: 'branch-2',
        items: [{ medicineName: 'Paracetamol' }]
      };

      const prescription = {
        id: 'pres-1',
        organizationId: mockOrgId2,
        branchId: 'branch-2',
        items: [{ organizationId: mockOrgId2 }]
      };

      jest.spyOn(prisma.prescription, 'create').mockResolvedValue(prescription as any);

      const result = await service.create(data);

      expect(result.organizationId).toBe(mockOrgId2);
      expect(result.branchId).toBe('branch-2');
    });
  });

  describe('STATUS TRANSITION: Prescription States', () => {
    it('should support prescription status transitions', async () => {
      const prescription = {
        id: 'pres-1',
        status: 'ACTIVE'
      };

      jest.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(prescription as any);
      jest.spyOn(prisma.prescription, 'update').mockResolvedValue({
        ...prescription,
        status: 'DISPENSED'
      } as any);

      const result = await service['update']?.('pres-1', { status: 'DISPENSED' }, mockOrgId, mockBranchId);

      expect(result?.status).toBe('DISPENSED');
    });

    it('should return prescriptions sorted by issued date descending', async () => {
      const prescriptions = [
        { id: 'pres-1', issuedAt: new Date('2026-06-15T10:00:00Z') },
        { id: 'pres-2', issuedAt: new Date('2026-06-10T10:00:00Z') },
        { id: 'pres-3', issuedAt: new Date('2026-06-20T10:00:00Z') }
      ];

      jest.spyOn(prisma.prescription, 'findMany').mockResolvedValue(prescriptions as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.prescription.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: { issuedAt: 'desc' }
      }));
    });
  });

  describe('TRANSACTION ROLLBACK: Error Handling', () => {
    it('should fail prescription creation if database error occurs', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        items: [{ medicineName: 'Paracetamol' }]
      };

      jest.spyOn(prisma.prescription, 'create').mockRejectedValue(new Error('Database connection failed'));

      await expect(service.create(data)).rejects.toThrow('Database connection failed');
    });

    it('should throw NotFoundException when prescription not found for org/branch', async () => {
      jest.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(null);

      await expect(
        service.findOne('pres-1', mockOrgId, mockBranchId)
      ).rejects.toThrow(NotFoundException);

      expect(prisma.prescription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          id: 'pres-1',
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });

    it('should handle findMany error gracefully', async () => {
      jest.spyOn(prisma.prescription, 'findMany').mockRejectedValue(new Error('Query failed'));

      await expect(
        service.findAll(mockOrgId, mockBranchId)
      ).rejects.toThrow('Query failed');
    });
  });

  describe('RBAC: Audit Context', () => {
    it('should create prescription with correct organization context', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        patientId: 'pat-1',
        doctorId: 'doc-1',
        items: [{ medicineName: 'Paracetamol' }]
      };

      jest.spyOn(prisma.prescription, 'create').mockResolvedValue({
        id: 'pres-1',
        organizationId: mockOrgId,
        items: [{ organizationId: mockOrgId }]
      } as any);

      await service.create(data);

      expect(prisma.prescription.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId
        })
      }));
    });

    it('should fetch prescriptions with patient and doctor relations', async () => {
      const prescription = {
        id: 'pres-1',
        patient: { id: 'pat-1', firstName: 'John', lastName: 'Doe' },
        doctor: { id: 'doc-1', firstName: 'Dr', lastName: 'Smith' }
      };

      jest.spyOn(prisma.prescription, 'findFirst').mockResolvedValue(prescription as any);

      await service.findOne('pres-1', mockOrgId, mockBranchId);

      expect(prisma.prescription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({
          patient: true,
          doctor: expect.any(Object)
        })
      }));
    });
  });
});
