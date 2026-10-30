import { Controller, Get, Post, UseGuards, Request, Param, Res, HttpCode } from '@nestjs/common';
import { pipeline } from 'stream/promises';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { AuditService } from '../common/services/audit.service';

/**
 * Database backups contain EVERY tenant's data, so each endpoint also requires
 * the platform permission admin.view (Super Admin only). A clinic owner holding
 * backup.* alone can never read another clinic's data through a dump.
 */
@Controller('api/v1/backup')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class BackupController {
  constructor(
    private backupService: BackupService,
    private backupSchedulerService: BackupSchedulerService,
    private audit: AuditService,
  ) {}

  @Post('create')
  @Permissions('backup.create', 'admin.view')
  @HttpCode(200)
  async createBackup(@Request() req) {
    const result = await this.backupService.createBackup();
    await this.audit.log({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      action: 'BACKUP_CREATE',
      resource: 'backup',
      resourceId: result.name,
      afterData: { size: result.size, encrypted: result.encrypted, remote: result.remote },
    });
    return {
      message: 'Backup created successfully',
      backup: { name: result.name, size: result.size, encrypted: result.encrypted },
      remote: result.remote,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('restore/:filename')
  @HttpCode(200)
  @Permissions('backup.manage', 'admin.view')
  async restoreBackup(@Request() req, @Param('filename') filename: string) {
    await this.backupService.restoreBackup(filename);
    await this.audit.log({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      action: 'BACKUP_RESTORE',
      resource: 'backup',
      resourceId: filename,
    });
    return { message: 'Backup restored successfully', backupFile: filename, timestamp: new Date().toISOString() };
  }

  @Get('list')
  @Permissions('backup.view', 'admin.view')
  async listBackups() {
    const backups = await this.backupService.listBackups();
    return {
      backups: backups.map((b) => ({
        name: b.name,
        size: b.size,
        date: b.date.toISOString(),
        encrypted: b.encrypted,
        local: b.local,
        remote: b.remote,
      })),
      count: backups.length,
      remoteStorage: this.backupService.remoteEnabled,
    };
  }

  @Get('stats')
  @Permissions('backup.view', 'admin.view')
  async getBackupStats() {
    return { ...(await this.backupService.getBackupStats()), schedulerRunning: this.backupSchedulerService.isRunning };
  }

  @Post('scheduler/start')
  @HttpCode(200)
  @Permissions('backup.manage', 'admin.view')
  startScheduler() {
    this.backupSchedulerService.start();
    return { message: 'Backup scheduler started' };
  }

  @Post('scheduler/stop')
  @HttpCode(200)
  @Permissions('backup.manage', 'admin.view')
  stopScheduler() {
    this.backupSchedulerService.stop();
    return { message: 'Backup scheduler stopped' };
  }

  @Get('download/:filename')
  @Permissions('backup.view', 'admin.view')
  async downloadBackup(@Request() req, @Param('filename') filename: string, @Res() res: Response) {
    const stream = await this.backupService.openBackup(filename);
    await this.audit.log({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      action: 'BACKUP_DOWNLOAD',
      resource: 'backup',
      resourceId: filename,
    });
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    // Streamed directly (bypasses the JSON response envelope).
    await pipeline(stream, res);
  }
}
