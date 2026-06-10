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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createData = {
      doctorId: 'doc-1',
      patientId: 'pat-1',
      scheduledStart: new Date('2026-06-09T10:00:00Z'),
      scheduledEnd: new Date('2026-06-09T10:30:00Z'),
    } as any;

    it('should throw BadRequestException if overlapping appointment exists', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue({ id: 'existing' } as any);

      await expect(service.create(createData, mockOrgId, mockBranchId, mockUserId))
        .rejects.toThrow(BadRequestException);
    });

    it('should create appointment and log audit if no overlap', async () => {
      jest.spyOn(prisma.appointment, 'findFirst').mockResolvedValue(null);
      const createdAppt = { id: 'new-appt', ...createData, organizationId: mockOrgId, branchId: mockBranchId };
      jest.spyOn(prisma.appointment, 'create').mockResolvedValue(createdAppt as any);

      const result = await service.create(createData, mockOrgId, mockBranchId, mockUserId);
      
      expect(result).toEqual(createdAppt);
      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ doctorId: 'doc-1', organizationId: mockOrgId }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }));
    });
  });

  describe('findAll', () => {
    it('should query with date boundaries if date provided', async () => {
      jest.spyOn(prisma.appointment, 'findMany').mockResolvedValue([]);
      await service.findAll(mockOrgId, mockBranchId, '2026-06-09');
      
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          scheduledStart: expect.any(Object)
        })
      }));
    });
  });

  describe('findOne', () => {
    it('should return appointment if exists', async () => {
      jest.spyOn(prisma.appointment, 'findUnique').mockResolvedValue({ id: 'appt-1' } as any);
      const result = await service.findOne('appt-1', mockOrgId, mockBranchId);
      expect(result.id).toBe('appt-1');
    });

    it('should throw NotFoundException if not exists', async () => {
      jest.spyOn(prisma.appointment, 'findUnique').mockResolvedValue(null);
      await expect(service.findOne('appt-1', mockOrgId, mockBranchId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if old appointment not found', async () => {
      jest.spyOn(prisma.appointment, 'findUnique').mockResolvedValue(null);
      await expect(service.update('appt-1', {}, mockOrgId, mockBranchId, mockUserId)).rejects.toThrow(NotFoundException);
    });

    it('should update and log audit if exists', async () => {
      const existing = { id: 'appt-1' };
      const updated = { id: 'appt-1', status: 'COMPLETED' };
      jest.spyOn(prisma.appointment, 'findUnique').mockResolvedValue(existing as any);
      jest.spyOn(prisma.appointment, 'update').mockResolvedValue(updated as any);

      const result = await service.update('appt-1', { status: 'COMPLETED' }, mockOrgId, mockBranchId, mockUserId);
      expect(result).toEqual(updated);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));
    });
  });
});
