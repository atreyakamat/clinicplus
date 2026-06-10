import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  const mockRequest = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
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

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  describe('create', () => {
    it('should call service create with context', async () => {
      const data = { title: 'Task' };
      jest.spyOn(service, 'create').mockResolvedValue({ id: 'task-1' } as any);
      await controller.create(data, mockRequest);
      expect(service.create).toHaveBeenCalledWith(data, 'org-1', 'branch-1', 'user-1');
    });
  });

  describe('findAll', () => {
    it('should call service findAll with context', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([]);
      await controller.findAll(mockRequest);
      expect(service.findAll).toHaveBeenCalledWith('org-1', 'branch-1');
    });
  });

  describe('findOne', () => {
    it('should call service findOne with context', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'task-1' } as any);
      await controller.findOne('task-1', mockRequest);
      expect(service.findOne).toHaveBeenCalledWith('task-1', 'org-1', 'branch-1');
    });
  });

  describe('update', () => {
    it('should call service update with updatedBy', async () => {
      jest.spyOn(service, 'update').mockResolvedValue({ id: 'task-1' } as any);
      await controller.update('task-1', { status: 'COMPLETED' }, mockRequest);
      expect(service.update).toHaveBeenCalledWith('task-1', { status: 'COMPLETED', updatedBy: 'user-1' }, 'org-1', 'branch-1');
    });
  });

  describe('remove', () => {
    it('should call service remove with context', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({ id: 'task-1' } as any);
      await controller.remove('task-1', mockRequest);
      expect(service.remove).toHaveBeenCalledWith('task-1', 'org-1', 'branch-1');
    });
  });
});
