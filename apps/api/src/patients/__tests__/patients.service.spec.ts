import { Test, TestingModule } from '@nestjs/testing';
import { PatientsService } from '../patients.service';
import { PrismaService } from '../prisma/prisma.service';

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
            patient: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
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
        id: '1',
        ...createPatientDto,
        organizationId: 'default-org-id',
        branchId: 'default-branch-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.spyOn(prisma.patient, 'create').mockResolvedValue(expectedPatient);

      const result = await service.create(createPatientDto);
      expect(result).toEqual(expectedPatient);
      expect(prisma.patient.create).toHaveBeenCalledWith({
        data: {
          ...createPatientDto,
          organizationId: 'default-org-id',
          branchId: 'default-branch-id',
        },
      });
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
      jest.spyOn(prisma.patient, 'findMany').mockResolvedValue(expectedPatients);

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
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        organizationId: 'org1',
        branchId: 'branch1',
        addresses: [],
        emergencyContacts: [],
      };
      jest.spyOn(prisma.patient, 'findUnique').mockResolvedValue(expectedPatient);

      const result = await service.findOne('1');
      expect(result).toEqual(expectedPatient);
      expect(prisma.patient.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: {
          addresses: true,
          emergencyContacts: true,
        },
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      jest.spyOn(prisma.patient, 'findUnique').mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(
        'Patient with ID 999 not found',
      );
    });
  });

  describe('update', () => {
    it('should update a patient', async () => {
      const updatePatientDto = {
        firstName: 'Johnny',
      };
      const existingPatient = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        organizationId: 'org1',
        branchId: 'branch1',
      };
      const updatedPatient = {
        ...existingPatient,
        ...updatePatientDto,
      };
      jest.spyOn(prisma.patient, 'findUnique').mockResolvedValue(existingPatient);
      jest.spyOn(prisma.patient, 'update').mockResolvedValue(updatedPatient);

      const result = await service.update('1', updatePatientDto);
      expect(result).toEqual(updatedPatient);
      expect(prisma.patient.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      });
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: updatePatientDto,
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      jest.spyOn(prisma.patient, 'findUnique').mockResolvedValue(null);

      await expect(
        service.update('999', { firstName: 'Johnny' }),
      ).rejects.toThrow('Patient with ID 999 not found');
    });
  });

  describe('remove', () => {
    it('should soft delete a patient', async () => {
      const existingPatient = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        organizationId: 'org1',
        branchId: 'branch1',
        status: 'ACTIVE',
      };
      const deletedPatient = {
        ...existingPatient,
        status: 'INACTIVE',
        deletedAt: new Date(),
      };
      jest.spyOn(prisma.patient, 'update').mockResolvedValue(deletedPatient);

      const result = await service.remove('1');
      expect(result).toEqual(deletedPatient);
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          status: 'INACTIVE',
          deletedAt: expect.any(Date),
        },
      });
    });
  });

  describe('addAddress', () => {
    it('should add an address to a patient', async () => {
      const addressData = {
        addressLine1: '123 Main St',
        city: 'Anytown',
      };
      const expectedAddress = {
        id: '1',
        ...addressData,
        patientId: '1',
        organizationId: 'default-org-id',
        branchId: 'default-branch-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.spyOn(prisma.patientAddress, 'create').mockResolvedValue(expectedAddress);

      const result = await service.addAddress('1', addressData);
      expect(result).toEqual(expectedAddress);
      expect(prisma.patientAddress.create).toHaveBeenCalledWith({
        data: {
          ...addressData,
          patientId: '1',
          organizationId: 'default-org-id',
          branchId: 'default-branch-id',
        },
      });
    });
  });

  describe('addEmergencyContact', () => {
    it('should add an emergency contact to a patient', async () => {
      const emergencyContactData = {
        name: 'Jane Doe',
        phone: '555-1234',
        relationship: 'Spouse',
      };
      const expectedEmergencyContact = {
        id: '1',
        ...emergencyContactData,
        patientId: '1',
        organizationId: 'default-org-id',
        branchId: 'default-branch-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.spyOn(prisma.patientEmergencyContact, 'create').mockResolvedValue(expectedEmergencyContact);

      const result = await service.addEmergencyContact('1', emergencyContactData);
      expect(result).toEqual(expectedEmergencyContact);
      expect(prisma.patientEmergencyContact.create).toHaveBeenCalledWith({
        data: {
          ...emergencyContactData,
          patientId: '1',
          organizationId: 'default-org-id',
          branchId: 'default-branch-id',
        },
      });
    });
  });

  describe('addTag', () => {
    it('should add a tag to a patient', async () => {
      const tagData = {
        tagName: 'VIP',
        tagColor: '#FFD700',
      };
      const expectedTag = {
        id: '1',
        ...tagData,
        patientId: '1',
        organizationId: 'default-org-id',
        branchId: 'default-branch-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.spyOn(prisma.patientTag, 'create').mockResolvedValue(expectedTag);

      const result = await service.addTag('1', tagData);
      expect(result).toEqual(expectedTag);
      expect(prisma.patientTag.create).toHaveBeenCalledWith({
        data: {
          ...tagData,
          patientId: '1',
          organizationId: 'default-org-id',
          branchId: 'default-branch-id',
        },
      });
    });
  });

  describe('addNote', () => {
    it('should add a note to a patient', async () => {
      const noteData = {
        note: 'Patient is allergic to penicillin.',
        createdBy: 'user1',
      };
      const expectedNote = {
        id: '1',
        ...noteData,
        patientId: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.spyOn(prisma.patientNote, 'create').mockResolvedValue(expectedNote);

      const result = await service.addNote('1', noteData);
      expect(result).toEqual(expectedNote);
      expect(prisma.patientNote.create).toHaveBeenCalledWith({
        data: {
          ...noteData,
          patientId: '1',
          createdBy: 'user1',
        },
      });
    });
  });
});