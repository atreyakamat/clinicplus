import { BackupService } from './backup.service';
export declare class BackupSchedulerService {
    private backupService;
    private readonly logger;
    private backupInterval;
    constructor(backupService: BackupService);
    start(): void;
    stop(): void;
    private performBackup;
    triggerBackupNow(): Promise<string>;
}
