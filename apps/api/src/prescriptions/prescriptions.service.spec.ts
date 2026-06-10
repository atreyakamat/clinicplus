import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsService } from './prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';

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
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create prescription with items', async () => {
      const data = {
        organizationId: mockOrgId,
        branchId: mockBranchId,
        items: [{ medicineName: 'Paracetamol' }]
      };
      jest.spyOn(prisma.prescription, 'create').mockResolvedValue({ id: 'pres-1' } as any);

      const result = await service.create(data);
      expect(result.id).toBe('pres-1');
      expect(prisma.prescription.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          items: expect.objectContaining({
            create: expect.arrayContaining([expect.objectContaining({ medicineName: 'Paracetamol', organizationId: mockOrgId })])
          })
        })
      }));
    });
  });

  describe('findAll', () => {
    it('should include patient filter if provided', async () => {
      jest.spyOn(prisma.prescription, 'findMany').mockResolvedValue([]);
      await service.findAll(mockOrgId, mockBranchId, 'pat-1');
      expect(prisma.prescription.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ patientId: 'pat-1' })
      }));
    });
  });

  describe('findOne', () => {
    it('should return prescription if found', async () => {
      jest.spyOn(prisma.prescription, 'findUnique').mockResolvedValue({ id: 'pres-1' } as any);
      const result = await service.findOne('pres-1', mockOrgId, mockBranchId);
      expect(result.id).toBe('pres-1');
    });

    it('should throw NotFoundException if not found', async () => {
      jest.spyOn(prisma.prescription, 'findUnique').mockResolvedValue(null);
      await expect(service.findOne('pres-1', mockOrgId, mockBranchId)).rejects.toThrow(NotFoundException);
    });
  });
});
