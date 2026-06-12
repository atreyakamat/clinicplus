import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TaskSchedulerService } from './tasks/task-scheduler.service';
export declare class AppService implements OnModuleInit, OnModuleDestroy {
    private readonly taskSchedulerService;
    constructor(taskSchedulerService: TaskSchedulerService);
    getHello(): string;
    onModuleInit(): void;
    onModuleDestroy(): void;
}
