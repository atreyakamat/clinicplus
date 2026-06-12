import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let service: AppointmentsService;

  const mockUser = {
    id: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
  };

  const mockRequest = { user: mockUser };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
    service = module.get<AppointmentsService>(AppointmentsService);
  });

  describe('create', () => {
    it('should inject context and call service create', async () => {
      const data = { doctorId: 'doc-1' };
      jest.spyOn(service, 'create').mockResolvedValue({ id: 'appt-1' } as any);

      const result = await controller.create(data, mockRequest);
      expect(result.id).toBe('appt-1');
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'org-1',
        'branch-1',
        'user-1',
      );
    });
  });

  describe('findAll', () => {
    it('should call service findAll with context', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([]);
      await controller.findAll(mockRequest, '2026-06-09');
      expect(service.findAll).toHaveBeenCalledWith(
        'org-1',
        'branch-1',
        '2026-06-09',
      );
    });
  });

  describe('findOne', () => {
    it('should call service findOne with context', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'appt-1' } as any);
      await controller.findOne('appt-1', mockRequest);
      expect(service.findOne).toHaveBeenCalledWith(
        'appt-1',
        'org-1',
        'branch-1',
      );
    });
  });

  describe('update', () => {
    it('should call service update with context', async () => {
      jest.spyOn(service, 'update').mockResolvedValue({ id: 'appt-1' } as any);
      await controller.update('appt-1', { status: 'COMPLETED' }, mockRequest);
      expect(service.update).toHaveBeenCalledWith(
        'appt-1',
        { status: 'COMPLETED' },
        'org-1',
        'branch-1',
        'user-1',
      );
    });
  });

  describe('remove', () => {
    it('should call service remove with context', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({ id: 'appt-1' } as any);
      await controller.remove('appt-1', mockRequest);
      expect(service.remove).toHaveBeenCalledWith(
        'appt-1',
        'org-1',
        'branch-1',
        'user-1',
      );
    });
  });

  describe('exportCsv', () => {
    it('should fetch appointments and generate CSV response', async () => {
      const mockRes = {
        set: jest.fn(),
        send: jest.fn().mockReturnValue('csv-content'),
      };

      jest.spyOn(service, 'findAll').mockResolvedValue([
        {
          id: '1',
          scheduledStart: new Date(),
          patient: { firstName: 'John' },
          doctor: { lastName: 'Smith' },
        },
      ] as any);

      await controller.exportCsv(mockRequest, mockRes);
      expect(service.findAll).toHaveBeenCalledWith('org-1', 'branch-1');
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv',
        }),
      );
      expect(mockRes.send).toHaveBeenCalled();
    });
  });
});
