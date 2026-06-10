import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationsService } from './consultations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('ConsultationsService', () => {
  let service: ConsultationsService;
  let prisma: PrismaService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn().mockImplementation((cb) => cb({
              consultation: { update: jest.fn().mockResolvedValue({ id: 'cons-1', organizationId: mockOrgId, branchId: mockBranchId }) },
              vital: { upsert: jest.fn() },
              diagnosis: { deleteMany: jest.fn(), createMany: jest.fn() },
            })),
            consultation: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ConsultationsService>(ConsultationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a consultation', async () => {
      const data = { chiefComplaint: 'Fever' } as any;
      jest.spyOn(prisma.consultation, 'create').mockResolvedValue({ id: 'cons-1', ...data } as any);
      const result = await service.create(data);
      expect(result.id).toBe('cons-1');
      expect(prisma.consultation.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('findAll', () => {
    it('should query with patientId if provided', async () => {
      jest.spyOn(prisma.consultation, 'findMany').mockResolvedValue([]);
      await service.findAll(mockOrgId, mockBranchId, 'pat-1');
      expect(prisma.consultation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ patientId: 'pat-1' })
      }));
    });
  });

  describe('findOne', () => {
    it('should return consultation if found', async () => {
      jest.spyOn(prisma.consultation, 'findUnique').mockResolvedValue({ id: 'cons-1' } as any);
      const result = await service.findOne('cons-1', mockOrgId, mockBranchId);
      expect(result.id).toBe('cons-1');
    });

    it('should throw NotFoundException if not found', async () => {
      jest.spyOn(prisma.consultation, 'findUnique').mockResolvedValue(null);
      await expect(service.findOne('cons-1', mockOrgId, mockBranchId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should process transaction with vitals and diagnoses', async () => {
      const updateData = {
        vitals: { id: 'v-1', weight: 70 },
        diagnoses: [{ code: 'A00', name: 'Cholera' }]
      };
      
      // Mock findOne to pass verification
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cons-1' } as any);
      
      const result = await service.update('cons-1', updateData, mockOrgId, mockBranchId);
      expect(result.id).toBe('cons-1');
    });
  });

  describe('complete', () => {
    it('should update status to COMPLETED', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cons-1' } as any);
      jest.spyOn(prisma.consultation, 'update').mockResolvedValue({ id: 'cons-1', status: 'COMPLETED' } as any);

      const result = await service.complete('cons-1', mockOrgId, mockBranchId);
      expect(result.status).toBe('COMPLETED');
      expect(prisma.consultation.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: 'COMPLETED' }
      }));
    });
  });
});
