import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TaskSchedulerService } from './tasks/task-scheduler.service';
import { BackupSchedulerService } from './backup/backup-scheduler.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: TaskSchedulerService,
          useValue: { start: jest.fn(), stop: jest.fn() },
        },
        {
          provide: BackupSchedulerService,
          useValue: { start: jest.fn(), stop: jest.fn() },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
