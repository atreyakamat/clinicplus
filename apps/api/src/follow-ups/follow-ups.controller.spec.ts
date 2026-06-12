import { Test, TestingModule } from '@nestjs/testing';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';

describe('FollowUpsController', () => {
  let controller: FollowUpsController;
  let service: FollowUpsService;

  const mockRequest = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FollowUpsController],
      providers: [
        {
          provide: FollowUpsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            addOutcome: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FollowUpsController>(FollowUpsController);
    service = module.get<FollowUpsService>(FollowUpsService);
  });

  describe('create', () => {
    it('should call service create with context', async () => {
      const data = { notes: 'Checkup' };
      jest.spyOn(service, 'create').mockResolvedValue({ id: 'fup-1' } as any);
      await controller.create(data, mockRequest);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });
  });

  describe('findAll', () => {
    it('should call service findAll with context', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([]);
      await controller.findAll(mockRequest);
      expect(service.findAll).toHaveBeenCalledWith('org-1', 'branch-1');
    });
  });

  describe('addOutcome', () => {
    it('should call service addOutcome with context', async () => {
      jest
        .spyOn(service, 'addOutcome')
        .mockResolvedValue({ id: 'out-1' } as any);
      await controller.addOutcome('fup-1', { notes: 'Better' }, mockRequest);
      expect(service.addOutcome).toHaveBeenCalledWith(
        'fup-1',
        expect.objectContaining({ notes: 'Better' }),
        'org-1',
      );
    });
  });

  describe('updateStatus', () => {
    it('should call service updateStatus with context', async () => {
      jest
        .spyOn(service, 'updateStatus')
        .mockResolvedValue({ id: 'fup-1' } as any);
      await controller.updateStatus(
        'fup-1',
        { status: 'COMPLETED' },
        mockRequest,
      );
      expect(service.updateStatus).toHaveBeenCalledWith(
        'fup-1',
        { status: 'COMPLETED' },
        'org-1',
      );
    });
  });
});
