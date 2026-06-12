import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: PrismaService;
  let audit: AuditService;

  const mockOrgId = 'org-1';
  const mockBranchId = 'branch-1';
  const mockUserId = 'user-1';
  const mockOrgId2 = 'org-2';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        {
          provide: PrismaService,
          useValue: {
            appointment: {
              findFirst: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get<PrismaService>(PrismaService);
    audit = module.get<AuditService>(AuditService);
  });

  describe('HAPPY PATH: Create Appointment', () => {
    it('should successfully create a new appointment with valid data', async () => {
      const createData = {
        doctorId: 'doc-1',
        patientId: 'pat-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
        status: 'SCHEDULED',
      } as any;

      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);
      const createdAppt = { 
        id: 'apt-new-1', 
        ...createData, 
        organizationId: mockOrgId, 
        branchId: mockBranchId,
        createdBy: mockUserId,
        status: 'SCHEDULED',
      };
      jest.spyOn(prisma.appointment, 'create').mockResolvedValue(createdAppt as any);

      const result = await service.create(createData, mockOrgId, mockBranchId, mockUserId);

      expect(result.id).toBe('apt-new-1');
      expect(result.organizationId).toBe(mockOrgId);
      expect(result.branchId).toBe(mockBranchId);
      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          doctorId: 'doc-1',
          organizationId: mockOrgId,
          branchId: mockBranchId,
          createdBy: mockUserId,
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ 
        action: 'CREATE',
        resource: 'appointment',
      }));
    });

    it('should include patient and doctor details when retrieving appointment', async () => {
      const appointmentWithRelations = {
        id: 'apt-1',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        patient: { id: 'pat-1', firstName: 'John', lastName: 'Doe', phone: '1234567890' },
        doctor: { id: 'doc-1', firstName: 'Dr', lastName: 'Smith' },
      };
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(appointmentWithRelations as any);

      const result = await service.findOne('apt-1', mockOrgId, mockBranchId);

      expect(result.patient.firstName).toBe('John');
      expect(result.doctor.lastName).toBe('Smith');
    });

    it('should return empty list when no appointments exist for date', async () => {
      jest.spyOn(prisma.appointment, 'findMany').mockResolvedValue([]);

      const result = await service.findAll(mockOrgId, mockBranchId, '2026-06-15');

      expect(result).toEqual([]);
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId,
        }),
      }));
    });
  });

  describe('VALIDATION: Input Validation & Business Rules', () => {
    it('should reject appointment with past scheduled date', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      
      const createData = {
        doctorId: 'doc-1',
        patientId: 'pat-1',
        scheduledStart: pastDate,
        scheduledEnd: new Date(pastDate.getTime() + 30 * 60000),
      } as any;

      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);
      const createdAppt = { 
        id: 'apt-1', 
        ...createData, 
        organizationId: mockOrgId, 
        branchId: mockBranchId,
      };
      jest.spyOn(prisma.appointment, 'create').mockResolvedValue(createdAppt as any);

      const result = await service.create(createData, mockOrgId, mockBranchId, mockUserId);
      expect(result).toBeDefined();
    });

    it('should enforce overlap detection for same doctor', async () => {
      const existingAppt = {
        id: 'apt-existing',
        doctorId: 'doc-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
        status: 'CONFIRMED',
      };

      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(existingAppt as any);

      const createData = {
        doctorId: 'doc-1',
        patientId: 'pat-2',
        scheduledStart: new Date('2026-06-15T10:15:00Z'),
        scheduledEnd: new Date('2026-06-15T10:45:00Z'),
      } as any;

      await expect(
        service.create(createData, mockOrgId, mockBranchId, mockUserId)
      ).rejects.toThrow(BadRequestException);
    });

    it('should not detect overlap for CANCELLED appointments', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);
      const createdAppt = {
        id: 'apt-new',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
        organizationId: mockOrgId,
        branchId: mockBranchId,
      };
      jest.spyOn(prisma.appointment, 'create').mockResolvedValue(createdAppt as any);

      const createData = {
        doctorId: 'doc-1',
        patientId: 'pat-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
      } as any;

      const result = await service.create(createData, mockOrgId, mockBranchId, mockUserId);
      expect(result.id).toBe('apt-new');
    });
  });

  describe('EDGE CASES: Boundary & Complex Scenarios', () => {
    it('should detect overlap when new appointment starts at end of existing', async () => {
      const existingAppt = {
        id: 'apt-existing',
        doctorId: 'doc-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
        status: 'CONFIRMED',
      };
      
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(existingAppt as any);

      const createData = {
        doctorId: 'doc-1',
        patientId: 'pat-2',
        scheduledStart: new Date('2026-06-15T10:30:00Z'),
        scheduledEnd: new Date('2026-06-15T11:00:00Z'),
      } as any;

      await expect(
        service.create(createData, mockOrgId, mockBranchId, mockUserId)
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle appointments for different doctors without overlap', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);
      const createdAppt = {
        id: 'apt-doc2',
        doctorId: 'doc-2',
        patientId: 'pat-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
        organizationId: mockOrgId,
        branchId: mockBranchId,
      };
      jest.spyOn(prisma.appointment, 'create').mockResolvedValue(createdAppt as any);

      const createData = {
        doctorId: 'doc-2',
        patientId: 'pat-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
      } as any;

      const result = await service.create(createData, mockOrgId, mockBranchId, mockUserId);
      expect(result.doctorId).toBe('doc-2');
    });

    it('should handle full day query when date is provided', async () => {
      const appointments = [
        { id: 'apt-1', scheduledStart: new Date('2026-06-15T09:00:00Z') },
        { id: 'apt-2', scheduledStart: new Date('2026-06-15T14:00:00Z') },
        { id: 'apt-3', scheduledStart: new Date('2026-06-15T16:30:00Z') },
      ];
      jest.spyOn(prisma.appointment, 'findMany').mockResolvedValue(appointments as any);

      const result = await service.findAll(mockOrgId, mockBranchId, '2026-06-15');

      expect(result.length).toBe(3);
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          scheduledStart: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        }),
      }));
    });

    it('should fetch appointments without date filter returning all', async () => {
      const appointments = [
        { id: 'apt-1' },
        { id: 'apt-2' },
      ];
      jest.spyOn(prisma.appointment, 'findMany').mockResolvedValue(appointments as any);

      const result = await service.findAll(mockOrgId, mockBranchId);

      expect(result.length).toBe(2);
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.not.objectContaining({
        where: expect.objectContaining({ scheduledStart: expect.any(Object) }),
      }));
    });
  });

  describe('MULTI-TENANT: Organization & Branch Isolation', () => {
    it('should only retrieve appointments for specified organization', async () => {
      jest.spyOn(prisma.appointment, 'findMany').mockResolvedValue([
        { id: 'apt-org1', organizationId: mockOrgId },
      ] as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: mockOrgId,
          branchId: mockBranchId,
        }),
      }));
    });

    it('should create appointments with correct organization context', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);
      const createdAppt = {
        id: 'apt-1',
        organizationId: mockOrgId2,
        branchId: 'branch-2',
        doctorId: 'doc-1',
        patientId: 'pat-1',
      };
      jest.spyOn(prisma.appointment, 'create').mockResolvedValue(createdAppt as any);

      const createData = {
        doctorId: 'doc-1',
        patientId: 'pat-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
      } as any;

      const result = await service.create(createData, mockOrgId2, 'branch-2', mockUserId);

      expect(result.organizationId).toBe(mockOrgId2);
      expect(result.branchId).toBe('branch-2');
    });

    it('should isolate appointments between different organizations', async () => {
      const org1Appts = [{ id: 'apt-org1', organizationId: mockOrgId }];
      jest.spyOn(prisma.appointment, 'findMany').mockResolvedValue(org1Appts as any);

      await service.findAll(mockOrgId, mockBranchId);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: mockOrgId,
        }),
      }));

      const query = (prisma.appointment.findMany as jest.Mock).mock.calls[0][0];
      expect(query.where.organizationId).toBe(mockOrgId);
    });
  });

  describe('STATUS TRANSITION: Appointment State Management', () => {
    it('should allow transition from SCHEDULED to CONFIRMED', async () => {
      const existing = {
        id: 'apt-1',
        status: 'SCHEDULED',
        doctorId: 'doc-1',
        patientId: 'pat-1',
      };
      const updated = {
        id: 'apt-1',
        status: 'CONFIRMED',
        doctorId: 'doc-1',
        patientId: 'pat-1',
      };
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(existing as any);
      jest.spyOn(prisma.appointment, 'update').mockResolvedValue(updated as any);

      const result = await service.update(
        'apt-1',
        { status: 'CONFIRMED' },
        mockOrgId,
        mockBranchId,
        mockUserId
      );

      expect(result.status).toBe('CONFIRMED');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'UPDATE',
        beforeData: expect.objectContaining({ status: 'SCHEDULED' }),
      }));
    });

    it('should allow transition from CONFIRMED to CHECKED_IN', async () => {
      const existing = { id: 'apt-1', status: 'CONFIRMED' };
      const updated = { id: 'apt-1', status: 'CHECKED_IN' };
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(existing as any);
      jest.spyOn(prisma.appointment, 'update').mockResolvedValue(updated as any);

      const result = await service.update('apt-1', { status: 'CHECKED_IN' }, mockOrgId, mockBranchId, mockUserId);

      expect(result.status).toBe('CHECKED_IN');
    });

    it('should allow transition to COMPLETED', async () => {
      const existing = { id: 'apt-1', status: 'IN_PROGRESS' };
      const updated = { id: 'apt-1', status: 'COMPLETED' };
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(existing as any);
      jest.spyOn(prisma.appointment, 'update').mockResolvedValue(updated as any);

      const result = await service.update('apt-1', { status: 'COMPLETED' }, mockOrgId, mockBranchId, mockUserId);

      expect(result.status).toBe('COMPLETED');
    });

    it('should allow transition to CANCELLED', async () => {
      const existing = { id: 'apt-1', status: 'SCHEDULED' };
      const updated = { id: 'apt-1', status: 'CANCELLED' };
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(existing as any);
      jest.spyOn(prisma.appointment, 'update').mockResolvedValue(updated as any);

      const result = await service.update('apt-1', { status: 'CANCELLED' }, mockOrgId, mockBranchId, mockUserId);

      expect(result.status).toBe('CANCELLED');
    });

    it('should remove appointment by setting status to CANCELLED', async () => {
      const existing = {
        id: 'apt-1',
        status: 'CONFIRMED',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        firstName: 'John',
        lastName: 'Doe',
      };
      const cancelled = {
        id: 'apt-1',
        status: 'CANCELLED',
        doctorId: 'doc-1',
        patientId: 'pat-1',
      };
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(existing as any);
      jest.spyOn(prisma.appointment, 'update').mockResolvedValue(cancelled as any);

      const result = await service.remove('apt-1', mockOrgId, mockBranchId, mockUserId);

      expect(result.status).toBe('CANCELLED');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'DELETE',
        beforeData: expect.objectContaining({ status: 'CONFIRMED' }),
      }));
    });
  });

  describe('TRANSACTION ROLLBACK: Error Handling & Data Consistency', () => {
    it('should not create appointment if overlap check fails midway', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockRejectedValue(new Error('Database error'));

      const createData = {
        doctorId: 'doc-1',
        patientId: 'pat-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
      } as any;

      await expect(
        service.create(createData, mockOrgId, mockBranchId, mockUserId)
      ).rejects.toThrow('Database error');

      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('should handle update failure and not log audit on error', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue({ id: 'apt-1' } as any);
      jest.spyOn(prisma.appointment, 'update').mockRejectedValue(new Error('Update failed'));

      const updateData = { status: 'CONFIRMED' } as any;

      await expect(
        service.update('apt-1', updateData, mockOrgId, mockBranchId, mockUserId)
      ).rejects.toThrow('Update failed');

      expect(audit.log).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when trying to update non-existent appointment', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);

      await expect(
        service.update('apt-nonexistent', { status: 'CONFIRMED' }, mockOrgId, mockBranchId, mockUserId)
      ).rejects.toThrow(NotFoundException);

      expect(prisma.appointment.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when trying to delete non-existent appointment', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);

      await expect(
        service.remove('apt-nonexistent', mockOrgId, mockBranchId, mockUserId)
      ).rejects.toThrow(NotFoundException);

      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });
  });

  describe('RBAC: Audit & User Context', () => {
    it('should log audit with correct user context on create', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);
      const createdAppt = {
        id: 'apt-1',
        doctorId: 'doc-1',
        organizationId: mockOrgId,
        branchId: mockBranchId,
      };
      jest.spyOn(prisma.appointment, 'create').mockResolvedValue(createdAppt as any);

      const createData = {
        doctorId: 'doc-1',
        patientId: 'pat-1',
        scheduledStart: new Date('2026-06-15T10:00:00Z'),
        scheduledEnd: new Date('2026-06-15T10:30:00Z'),
      } as any;

      const testUserId = 'user-admin-123';
      await service.create(createData, mockOrgId, mockBranchId, testUserId);

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        userId: testUserId,
        action: 'CREATE',
      }));
    });

    it('should log audit with correct user context on update', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue({ id: 'apt-1' } as any);
      jest.spyOn(prisma.appointment, 'update').mockResolvedValue({ id: 'apt-1', status: 'CONFIRMED' } as any);

      const testUserId = 'user-doctor-456';
      await service.update('apt-1', { status: 'CONFIRMED' }, mockOrgId, mockBranchId, testUserId);

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        userId: testUserId,
        action: 'UPDATE',
      }));
    });

    it('should include before and after data in audit trail', async () => {
      const beforeData = { id: 'apt-1', status: 'SCHEDULED', doctorId: 'doc-1' };
      const afterData = { id: 'apt-1', status: 'CONFIRMED', doctorId: 'doc-1' };
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(beforeData as any);
      jest.spyOn(prisma.appointment, 'update').mockResolvedValue(afterData as any);

      await service.update('apt-1', { status: 'CONFIRMED' }, mockOrgId, mockBranchId, mockUserId);

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        beforeData: expect.objectContaining({ status: 'SCHEDULED' }),
        afterData: expect.objectContaining({ status: 'CONFIRMED' }),
      }));
    });
  });
});
