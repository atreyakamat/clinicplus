import { Test, TestingModule } from '@nestjs/testing';
import { PatientsService } from '../patients.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { AuditService } from '../../common/services/audit.service';
import { NotFoundException } from '@nestjs/common';

// Valid UUIDs for testing
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_ORG_UUID = '110e8400-e29b-41d4-a716-446655440000';
const VALID_BRANCH_UUID = '220e8400-e29b-41d4-a716-446655440000';

describe('PatientsService', () => {
  let service: PatientsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn().mockImplementation((cb) =>
              cb({
                patient: {
                  create: jest.fn().mockImplementation((args) =>
                    Promise.resolve({
                      id: VALID_UUID,
                      ...args.data,
                      patientCode: args.data.patientCode || 'PAT-000001',
                      organizationId: VALID_ORG_UUID,
                      branchId: VALID_BRANCH_UUID,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    }),
                  ),
                },
              }),
            ),
            patient: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            patientAddress: { create: jest.fn() },
            patientEmergencyContact: { create: jest.fn() },
            patientTag: { create: jest.fn() },
            patientNote: { create: jest.fn() },
            timelineEvent: { create: jest.fn() },
            auditLog: { create: jest.fn() },
          },
        },
        {
          provide: TimelineService,
          useValue: {
            record: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a patient', async () => {
      const createPatientDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '1234567890',
      };

      jest.spyOn(prisma.patient, 'findFirst').mockResolvedValue(null);

      const result = await service.create({
        ...createPatientDto,
        organizationId: VALID_ORG_UUID,
        branchId: VALID_BRANCH_UUID,
        createdBy: VALID_UUID,
      });

      expect(result.firstName).toBe(createPatientDto.firstName);
      expect(result.id).toBe(VALID_UUID);
      expect(prisma.patient.findFirst).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a patient by ID', async () => {
      const expectedPatient = {
        id: VALID_UUID,
        firstName: 'John',
        lastName: 'Doe',
        organizationId: VALID_ORG_UUID,
        branchId: VALID_BRANCH_UUID,
        addresses: [],
        emergencyContacts: [],
      };

      jest
        .spyOn(prisma.patient, 'findFirst')
        .mockResolvedValue(expectedPatient as any);

      const result = await service.findOne(
        VALID_UUID,
        VALID_ORG_UUID,
        VALID_BRANCH_UUID,
      );
      expect(result).toEqual(expectedPatient);
      expect(prisma.patient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: VALID_UUID,
            organizationId: VALID_ORG_UUID,
            branchId: VALID_BRANCH_UUID,
          },
        }),
      );
    });

    it('should throw NotFoundException if patient not found', async () => {
      jest.spyOn(prisma.patient, 'findFirst').mockResolvedValue(null);

      await expect(
        service.findOne(VALID_UUID, VALID_ORG_UUID, VALID_BRANCH_UUID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a patient', async () => {
      const updatePatientDto = { firstName: 'Johnny' };
      const existingPatient = {
        id: VALID_UUID,
        firstName: 'John',
        lastName: 'Doe',
        organizationId: VALID_ORG_UUID,
        branchId: VALID_BRANCH_UUID,
      };
      const updatedPatient = { ...existingPatient, ...updatePatientDto };

      jest.spyOn(service, 'findOne').mockResolvedValue(existingPatient as any);
      jest
        .spyOn(prisma.patient, 'update')
        .mockResolvedValue(updatedPatient as any);

      const result = await service.update(
        VALID_UUID,
        updatePatientDto,
        VALID_ORG_UUID,
        VALID_BRANCH_UUID,
      );
      expect(result.firstName).toBe('Johnny');
      expect(prisma.patient.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete a patient', async () => {
      const existingPatient = {
        id: VALID_UUID,
        firstName: 'John',
        lastName: 'Doe',
        organizationId: VALID_ORG_UUID,
        branchId: VALID_BRANCH_UUID,
        status: 'ACTIVE',
      };
      const deletedPatient = {
        ...existingPatient,
        status: 'INACTIVE',
        deletedAt: new Date(),
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(existingPatient as any);
      jest
        .spyOn(prisma.patient, 'update')
        .mockResolvedValue(deletedPatient as any);

      const result = await service.remove(
        VALID_UUID,
        VALID_ORG_UUID,
        VALID_BRANCH_UUID,
        VALID_UUID,
      );
      expect(result.status).toBe('INACTIVE');
    });
  });
});
