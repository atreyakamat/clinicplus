import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TaskSchedulerService } from './tasks/task-scheduler.service';
import { BackupSchedulerService } from './backup/backup-scheduler.service';

@Injectable()
export class AppService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly taskSchedulerService: TaskSchedulerService,
    private readonly backupSchedulerService: BackupSchedulerService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  onModuleInit() {
    this.taskSchedulerService.start();
    this.backupSchedulerService.start();
  }

  onModuleDestroy() {
    this.taskSchedulerService.stop();
    this.backupSchedulerService.stop();
  }
}
