import { NotificationService } from '../notifications/notification.service';
export declare class TaskSchedulerService {
    private notificationService;
    private readonly logger;
    private notificationInterval;
    constructor(notificationService: NotificationService);
    start(): void;
    stop(): void;
    private runNotificationJob;
}
