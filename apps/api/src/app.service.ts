import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskSchedulerService } from './tasks/task-scheduler.service';
import { BackupSchedulerService } from './backup/backup-scheduler.service';

/**
 * Starts background schedulers only when explicitly enabled by configuration
 * (SCHEDULER_ENABLED / BACKUP_SCHEDULE_ENABLED) and stops them on shutdown.
 * They are never started in tests.
 */
@Injectable()
export class AppService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly taskSchedulerService: TaskSchedulerService,
    private readonly backupSchedulerService: BackupSchedulerService,
  ) {}

  getHello(): string {
    return 'ClinicPlus API';
  }

  onApplicationBootstrap() {
    if (this.config.get('NODE_ENV') === 'test') return;
    if (this.config.get<boolean>('SCHEDULER_ENABLED')) {
      this.taskSchedulerService.start();
    } else {
      this.logger.log('Reminder scheduler disabled (SCHEDULER_ENABLED=false)');
    }
    if (this.config.get<boolean>('BACKUP_SCHEDULE_ENABLED')) {
      this.backupSchedulerService.start();
    } else {
      this.logger.log('Backup scheduler disabled (BACKUP_SCHEDULE_ENABLED=false)');
    }
  }

  onApplicationShutdown() {
    this.taskSchedulerService.stop();
    this.backupSchedulerService.stop();
  }
}
