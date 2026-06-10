import { Test, TestingModule } from '@nestjs/testing';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';

describe('QueuesController', () => {
  let controller: QueuesController;
  let service: QueuesService;

  const mockRequest = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueuesController],
      providers: [
        {
          provide: QueuesService,
          useValue: {
            getLiveQueue: jest.fn(),
            checkIn: jest.fn(),
            updateEntryStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<QueuesController>(QueuesController);
    service = module.get<QueuesService>(QueuesService);
  });

  describe('getLiveQueue', () => {
    it('should call service getLiveQueue with context', async () => {
      jest.spyOn(service, 'getLiveQueue').mockResolvedValue({ id: 'q-1' } as any);
      await controller.getLiveQueue(mockRequest);
      expect(service.getLiveQueue).toHaveBeenCalledWith('org-1', 'branch-1');
    });
  });

  describe('checkIn', () => {
    it('should call service checkIn with context', async () => {
      jest.spyOn(service, 'checkIn').mockResolvedValue({ id: 'entry-1' } as any);
      await controller.checkIn({ appointmentId: 'appt-1' }, mockRequest);
      expect(service.checkIn).toHaveBeenCalledWith('appt-1', 'org-1', 'branch-1');
    });
  });

  describe('updateEntryStatus', () => {
    it('should call service updateEntryStatus', async () => {
      jest.spyOn(service, 'updateEntryStatus').mockResolvedValue({ id: 'entry-1' } as any);
      await controller.updateStatus('entry-1', { status: 'IN_PROGRESS' });
      expect(service.updateEntryStatus).toHaveBeenCalledWith('entry-1', 'IN_PROGRESS');
    });
  });
});
