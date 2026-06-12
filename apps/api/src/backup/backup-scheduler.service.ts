import { Injectable, Logger } from '@nestjs/common';
import { BackupService } from './backup.service';

@Injectable()
export class BackupSchedulerService {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private backupInterval: NodeJS.Timeout;

  constructor(private backupService: BackupService) {}

  /**
   * Start the backup scheduler
   * Runs backups daily at 2:00 AM
   */
  start() {
    this.logger.log('Starting backup scheduler');

    // Run backup immediately on start (for testing)
    this.performBackup();

    // Calculate time until next 2:00 AM
    const now = new Date();
    const nextRun = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1, // Tomorrow
      2, // 2:00 AM
      0, // 0 minutes
      0  // 0 seconds
    );

    const msUntilNextRun = nextRun.getTime() - now.getTime();

    // Set interval to run daily at 2:00 AM
    this.backupInterval = setInterval(() => {
      this.performBackup();
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Actually, let's set a timeout for the first run, then interval
    clearInterval(this.backupInterval);
    this.backupInterval = setTimeout(() => {
      this.performBackup();
      // Then set up recurring interval
      this.backupInterval = setInterval(() => {
        this.performBackup();
      }, 24 * 60 * 60 * 1000);
    }, msUntilNextRun);
  }

  /**
   * Stop the backup scheduler
   */
  stop() {
    this.logger.log('Stopping backup scheduler');
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }
  }

  /**
   * Perform a backup operation
   */
  private async performBackup() {
    try {
      this.logger.log('Starting scheduled backup');
      const backupPath = await this.backupService.createBackup();
      this.logger.log(`Scheduled backup completed: ${backupPath}`);
    } catch (error) {
      this.logger.error(`Failed to perform scheduled backup: ${error.message}`);
    }
  }

  /**
   * Trigger a backup immediately (for manual initiation)
   */
  async triggerBackupNow(): Promise<string> {
    this.logger.log('Manual backup triggered');
    return this.backupService.createBackup();
  }
}