import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TaskSchedulerService } from './tasks/task-scheduler.service';
import { BackupSchedulerService } from './backup/backup-scheduler.service';
export declare class AppService implements OnModuleInit, OnModuleDestroy {
    private readonly taskSchedulerService;
    private readonly backupSchedulerService;
    constructor(taskSchedulerService: TaskSchedulerService, backupSchedulerService: BackupSchedulerService);
    getHello(): string;
    onModuleInit(): void;
    onModuleDestroy(): void;
}
