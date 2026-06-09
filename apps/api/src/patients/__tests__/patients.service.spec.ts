import { Test, TestingModule } from '@nestjs/testing';
import { PatientsService } from '../patients.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { AuditService } from '../../common/services/audit.service';

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
            $transaction: jest.fn().mockImplementation((cb) => cb({
              patient: { create: jest.fn().mockResolvedValue({ id: VALID_UUID, organizationId: VALID_ORG_UUID }) }
            })),
            patient: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            patientAddress: {
              create: jest.fn(),
            },
            patientEmergencyContact: {
              create: jest.fn(),
            },
            patientTag: {
              create: jest.fn(),
            },
            patientNote: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: TimelineService,
          useValue: {
            createEvent: jest.fn(),
            record: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            logAction: jest.fn(),
            log: jest.fn(),
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
      };
      const expectedPatient = {
        id: VALID_UUID,
        ...createPatientDto,
        organizationId: VALID_ORG_UUID,
        branchId: VALID_BRANCH_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.spyOn(prisma.patient, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.patient, 'create').mockResolvedValue(expectedPatient);

      const result = await service.create({
        ...createPatientDto,
        organizationId: VALID_ORG_UUID,
        branchId: VALID_BRANCH_UUID,
        createdBy: VALID_UUID,
      });
      expect(result).toEqual(expectedPatient);
      expect(prisma.patient.findFirst).toHaveBeenCalled();
      expect(prisma.patient.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return an array of patients', async () => {
      const expectedPatients = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          organizationId: 'org1',
          branchId: 'branch1',
          status: 'ACTIVE',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          organizationId: 'org1',
          branchId: 'branch1',
          status: 'ACTIVE',
        },
      ];
      jest
        .spyOn(prisma.patient, 'findMany')
        .mockResolvedValue(expectedPatients);

      const result = await service.findAll('org1', 'branch1');
      expect(result).toEqual(expectedPatients);
      expect(prisma.patient.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org1',
          branchId: 'branch1',
          status: 'ACTIVE',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
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
        .spyOn(prisma.patient, 'findUnique')
        .mockResolvedValue(expectedPatient);

      const result = await service.findOne(VALID_UUID);
      expect(result).toEqual(expectedPatient);
      expect(prisma.patient.findUnique).toHaveBeenCalledWith({
        where: { id: VALID_UUID },
        include: {
          addresses: true,
          emergencyContacts: true,
        },
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      jest.spyOn(prisma.patient, 'findUnique').mockResolvedValue(null);

      await expect(service.findOne(VALID_UUID)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update a patient', async () => {
      const updatePatientDto = {
        firstName: 'Johnny',
      };
      const existingPatient = {
        id: VALID_UUID,
        firstName: 'John',
        lastName: 'Doe',
        organizationId: VALID_ORG_UUID,
        branchId: VALID_BRANCH_UUID,
      };
      const updatedPatient = {
        ...existingPatient,
        ...updatePatientDto,
      };
      jest
        .spyOn(prisma.patient, 'findUnique')
        .mockResolvedValue(existingPatient);
      jest.spyOn(prisma.patient, 'update').mockResolvedValue(updatedPatient);

      const result = await service.update(VALID_UUID, updatePatientDto);
      expect(result).toEqual(updatedPatient);
      expect(prisma.patient.findUnique).toHaveBeenCalledWith({
        where: { id: VALID_UUID },
      });
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: VALID_UUID },
        data: updatePatientDto,
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      jest.spyOn(prisma.patient, 'findUnique').mockResolvedValue(null);

      await expect(
        service.update(VALID_UUID, { firstName: 'Johnny' }),
      ).rejects.toThrow();
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
      jest.spyOn(prisma.patient, 'update').mockResolvedValue(deletedPatient);

      const result = await service.remove(VALID_UUID);
      expect(result).toEqual(deletedPatient);
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: VALID_UUID },
        data: {
          status: 'INACTIVE',
          deletedAt: expect.any(Date),
        },
      });
    });
  });
});
