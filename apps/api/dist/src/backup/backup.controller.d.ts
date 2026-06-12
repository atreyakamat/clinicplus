import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
export declare class BackupController {
    private backupService;
    private backupSchedulerService;
    constructor(backupService: BackupService, backupSchedulerService: BackupSchedulerService);
    createBackup(req: any): Promise<{
        message: string;
        backupPath: string;
        timestamp: string;
    }>;
    restoreBackup(req: any, filename: string): Promise<{
        message: string;
        backupFile: string;
        timestamp: string;
    }>;
    listBackups(req: any): Promise<{
        backups: {
            name: string;
            size: number;
            date: string;
        }[];
        count: number;
    }>;
    getBackupStats(req: any): Promise<{
        totalBackups: number;
        totalSize: number;
        oldestBackup: Date | null;
        newestBackup: Date | null;
    }>;
    startScheduler(req: any): Promise<{
        message: string;
    }>;
    stopScheduler(req: any): Promise<{
        message: string;
    }>;
    downloadBackup(filename: string, res: any): Promise<any>;
}
