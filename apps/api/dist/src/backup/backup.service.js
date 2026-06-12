"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BackupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupService = void 0;
const common_1 = require("@nestjs/common");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
let BackupService = BackupService_1 = class BackupService {
    logger = new common_1.Logger(BackupService_1.name);
    backupDir = (0, path_1.join)(process.cwd(), 'backups');
    retentionDays = 7;
    constructor() {
        this.ensureBackupDirectory();
    }
    async ensureBackupDirectory() {
        try {
            await fs_1.promises.access(this.backupDir);
        }
        catch {
            await fs_1.promises.mkdir(this.backupDir, { recursive: true });
            this.logger.log(`Backup directory created: ${this.backupDir}`);
        }
    }
    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `clinicos-backup-${timestamp}.sql`;
        const backupPath = (0, path_1.join)(this.backupDir, backupFileName);
        this.logger.log(`Starting database backup: ${backupFileName}`);
        try {
            const databaseUrl = process.env.DATABASE_URL;
            if (!databaseUrl) {
                throw new Error('DATABASE_URL environment variable is not set');
            }
            const url = new URL(databaseUrl);
            const env = {
                ...process.env,
                PGPASSWORD: url.password || '',
            };
            const command = `pg_dump -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.substring(1)} -F p -f "${backupPath}"`;
            await new Promise((resolve, reject) => {
                (0, child_process_1.exec)(command, { env, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
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
                });
            });
            await fs_1.promises.access(backupPath);
            await this.cleanupOldBackups();
            return backupPath;
        }
        catch (error) {
            this.logger.error(`Failed to create backup: ${error.message}`);
            throw error;
        }
    }
    async restoreBackup(backupPath) {
        this.logger.log(`Starting database restore from: ${backupPath}`);
        try {
            await fs_1.promises.access(backupPath);
            const databaseUrl = process.env.DATABASE_URL;
            if (!databaseUrl) {
                throw new Error('DATABASE_URL environment variable is not set');
            }
            const url = new URL(databaseUrl);
            const env = {
                ...process.env,
                PGPASSWORD: url.password || '',
            };
            const command = `psql -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.substring(1)} -f "${backupPath}"`;
            await new Promise((resolve, reject) => {
                (0, child_process_1.exec)(command, { env, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                    if (error) {
                        this.logger.error(`Restore failed: ${error.message}`);
                        reject(error);
                        return;
                    }
                    if (stderr) {
                        this.logger.warn(`Restore stderr: ${stderr}`);
                    }
                    this.logger.log(`Restore completed successfully from: ${backupPath}`);
                    resolve(true);
                });
            });
        }
        catch (error) {
            this.logger.error(`Failed to restore backup: ${error.message}`);
            throw error;
        }
    }
    async listBackups() {
        try {
            const files = await fs_1.promises.readdir(this.backupDir);
            const backupFiles = files.filter((file) => file.startsWith('clinicos-backup-') && file.endsWith('.sql'));
            const backups = await Promise.all(backupFiles.map(async (fileName) => {
                const filePath = (0, path_1.join)(this.backupDir, fileName);
                const stats = await fs_1.promises.stat(filePath);
                return {
                    name: fileName,
                    path: filePath,
                    size: stats.size,
                    date: stats.mtime,
                };
            }));
            return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
        }
        catch (error) {
            this.logger.error(`Failed to list backups: ${error.message}`);
            return [];
        }
    }
    async cleanupOldBackups() {
        try {
            const backups = await this.listBackups();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
            const oldBackups = backups.filter((backup) => backup.date < cutoffDate);
            for (const backup of oldBackups) {
                try {
                    await fs_1.promises.unlink(backup.path);
                    this.logger.log(`Removed old backup: ${backup.name}`);
                }
                catch (error) {
                    this.logger.error(`Failed to remove old backup ${backup.name}: ${error.message}`);
                }
            }
            if (oldBackups.length > 0) {
                this.logger.log(`Cleaned up ${oldBackups.length} old backups (retention: ${this.retentionDays} days)`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to cleanup old backups: ${error.message}`);
        }
    }
    async getBackupStats() {
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
        }
        catch (error) {
            this.logger.error(`Failed to get backup stats: ${error.message}`);
            return {
                totalBackups: 0,
                totalSize: 0,
                oldestBackup: null,
                newestBackup: null,
            };
        }
    }
    getBackupPath(filename) {
        return (0, path_1.join)(this.backupDir, filename);
    }
};
exports.BackupService = BackupService;
exports.BackupService = BackupService = BackupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], BackupService);
//# sourceMappingURL=backup.service.js.map