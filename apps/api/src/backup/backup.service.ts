import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir = join(process.cwd(), 'backups');
  private readonly retentionDays = 7; // Keep backups for 7 days

  constructor() {
    // Ensure backup directory exists
    this.ensureBackupDirectory();
  }

  private async ensureBackupDirectory() {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
      this.logger.log(`Backup directory created: ${this.backupDir}`);
    }
  }

  /**
   * Create a database backup
   * @returns Promise with backup file path
   */
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `clinicos-backup-${timestamp}.sql`;
    const backupPath = join(this.backupDir, backupFileName);

    this.logger.log(`Starting database backup: ${backupFileName}`);

    try {
      // Get database URL from environment
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL environment variable is not set');
      }

      // Extract connection details from DATABASE_URL
      // Format: postgresql://username:password@host:port/database
      const url = new URL(databaseUrl);

      // Set environment variables for pg_dump
      const env = {
        ...process.env,
        PGPASSWORD: url.password || '',
      };

      // Build pg_dump command
      const command = `pg_dump -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.substring(1)} -F p -f "${backupPath}"`;

      // Execute backup
      await new Promise((resolve, reject) => {
        exec(
          command,
          { env, maxBuffer: 1024 * 1024 * 10 },
          (error, stdout, stderr) => {
            if (error) {
              this.logger.error(`Backup failed: ${error.message}`);
              reject(error);
              return;
            }
            if (stderr) {
              this.logger.warn(`Backup stderr: ${stderr}`);
            }
            this.logger.log(`Backup completed successfully: ${backupPath}`);
            resolve(true);
          },
        );
      });

      // Verify backup file was created
      await fs.access(backupPath);

      // Clean up old backups
      await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      this.logger.error(`Failed to create backup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Restore database from backup file
   * @param backupPath Path to the backup file
   */
  async restoreBackup(backupPath: string): Promise<void> {
    this.logger.log(`Starting database restore from: ${backupPath}`);

    try {
      // Verify backup file exists
      await fs.access(backupPath);

      // Get database URL from environment
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL environment variable is not set');
      }

      // Extract connection details from DATABASE_URL
      const url = new URL(databaseUrl);

      // Set environment variables for pg_restore
      const env = {
        ...process.env,
        PGPASSWORD: url.password || '',
      };

      // Build psql command for restore
      const command = `psql -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.substring(1)} -f "${backupPath}"`;

      // Execute restore
      await new Promise((resolve, reject) => {
        exec(
          command,
          { env, maxBuffer: 1024 * 1024 * 10 },
          (error, stdout, stderr) => {
            if (error) {
              this.logger.error(`Restore failed: ${error.message}`);
              reject(error);
              return;
            }
            if (stderr) {
              this.logger.warn(`Restore stderr: ${stderr}`);
            }
            this.logger.log(
              `Restore completed successfully from: ${backupPath}`,
            );
            resolve(true);
          },
        );
      });
    } catch (error) {
      this.logger.error(`Failed to restore backup: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all available backups
   * @returns Promise with array of backup file information
   */
  async listBackups(): Promise<
    Array<{ name: string; path: string; size: number; date: Date }>
  > {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(
        (file) => file.startsWith('clinicos-backup-') && file.endsWith('.sql'),
      );

      const backups = await Promise.all(
        backupFiles.map(async (fileName) => {
          const filePath = join(this.backupDir, fileName);
          const stats = await fs.stat(filePath);
          return {
            name: fileName,
            path: filePath,
            size: stats.size,
            date: stats.mtime,
          };
        }),
      );

      // Sort by date descending (newest first)
      return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      this.logger.error(`Failed to list backups: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  private async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      const oldBackups = backups.filter((backup) => backup.date < cutoffDate);

      for (const backup of oldBackups) {
        try {
          await fs.unlink(backup.path);
          this.logger.log(`Removed old backup: ${backup.name}`);
        } catch (error) {
          this.logger.error(
            `Failed to remove old backup ${backup.name}: ${error.message}`,
          );
        }
      }

      if (oldBackups.length > 0) {
        this.logger.log(
          `Cleaned up ${oldBackups.length} old backups (retention: ${this.retentionDays} days)`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup old backups: ${error.message}`);
    }
  }

  /**
   * Get backup storage statistics
   */
  async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    oldestBackup: Date | null;
    newestBackup: Date | null;
  }> {
    try {
      const backups = await this.listBackups();

      if (backups.length === 0) {
        return {
          totalBackups: 0,
          totalSize: 0,
          oldestBackup: null,
          newestBackup: null,
        };
      }

      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      const oldestBackup = backups[backups.length - 1].date;
      const newestBackup = backups[0].date;

      return {
        totalBackups: backups.length,
        totalSize,
        oldestBackup,
        newestBackup,
      };
    } catch (error) {
      this.logger.error(`Failed to get backup stats: ${error.message}`);
      return {
        totalBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null,
      };
    }
  }

  getBackupPath(filename: string): string {
    return join(this.backupDir, filename);
  }
}
