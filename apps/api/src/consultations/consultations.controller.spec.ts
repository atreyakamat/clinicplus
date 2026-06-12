import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';

describe('ConsultationsController', () => {
  let controller: ConsultationsController;
  let service: ConsultationsService;

  const mockRequest = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsultationsController],
      providers: [
        {
          provide: ConsultationsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            complete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ConsultationsController>(ConsultationsController);
    service = module.get<ConsultationsService>(ConsultationsService);
  });

  describe('create', () => {
    it('should inject context and call service create', async () => {
      jest.spyOn(service, 'create').mockResolvedValue({ id: 'cons-1' } as any);
      await controller.create({ chiefComplaint: 'Fever' }, mockRequest);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          doctorId: 'user-1',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should pass query params to service', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([]);
      await controller.findAll('pat-1', mockRequest);
      expect(service.findAll).toHaveBeenCalledWith(
        'org-1',
        'branch-1',
        'pat-1',
      );
    });
  });

  describe('findOne', () => {
    it('should call service findOne', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cons-1' } as any);
      await controller.findOne('cons-1', mockRequest);
      expect(service.findOne).toHaveBeenCalledWith(
        'cons-1',
        'org-1',
        'branch-1',
      );
    });
  });

  describe('update', () => {
    it('should call service update with updatedBy', async () => {
      jest.spyOn(service, 'update').mockResolvedValue({ id: 'cons-1' } as any);
      await controller.update('cons-1', { notes: 'Updated' }, mockRequest);
      expect(service.update).toHaveBeenCalledWith(
        'cons-1',
        expect.objectContaining({ updatedBy: 'user-1' }),
        'org-1',
        'branch-1',
      );
    });
  });

  describe('complete', () => {
    it('should call service complete', async () => {
      jest
        .spyOn(service, 'complete')
        .mockResolvedValue({ id: 'cons-1' } as any);
      await controller.complete('cons-1', mockRequest);
      expect(service.complete).toHaveBeenCalledWith(
        'cons-1',
        'org-1',
        'branch-1',
      );
    });
  });
});
