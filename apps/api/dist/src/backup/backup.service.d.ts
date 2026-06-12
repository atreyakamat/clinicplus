export declare class BackupService {
    private readonly logger;
    private readonly backupDir;
    private readonly retentionDays;
    constructor();
    private ensureBackupDirectory;
    createBackup(): Promise<string>;
    restoreBackup(backupPath: string): Promise<void>;
    listBackups(): Promise<Array<{
        name: string;
        path: string;
        size: number;
        date: Date;
    }>>;
    private cleanupOldBackups;
    getBackupStats(): Promise<{
        totalBackups: number;
        totalSize: number;
        oldestBackup: Date | null;
        newestBackup: Date | null;
    }>;
    getBackupPath(filename: string): string;
}
