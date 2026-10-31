import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigService } from '@nestjs/config';
import { TaskSchedulerService } from './tasks/task-scheduler.service';
import { BackupSchedulerService } from './backup/backup-scheduler.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
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
    it('returns the API banner', () => {
      expect(appController.getHello()).toBe('ClinicPlus API');
    });
  });
});
