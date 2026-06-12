import {
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Param,
  Res,
  HttpCode,
  Header,
} from '@nestjs/common';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Response } from 'express';

@Controller('api/v1/backup')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class BackupController {
  constructor(
    private backupService: BackupService,
    private backupSchedulerService: BackupSchedulerService,
  ) {}

  @Post('create')
  @Permissions('backup:create')
  @HttpCode(200)
  async createBackup(@Request() req) {
    const backupPath = await this.backupService.createBackup();
    return {
      message: 'Backup created successfully',
      backupPath: backupPath,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('restore/:filename')
  @Permissions('backup:restore')
  async restoreBackup(
    @Request() req,
    @Param('filename') filename: string,
  ) {
    // Validate filename to prevent directory traversal
    if (!filename.match(/^clinicos-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/)) {
      throw new Error('Invalid backup filename');
    }

    const backupPath = `/app/backups/${filename}`;
    await this.backupService.restoreBackup(backupPath);

    return {
      message: 'Backup restored successfully',
      backupFile: filename,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('list')
  @Permissions('backup:read')
  async listBackups(@Request() req) {
    const backups = await this.backupService.listBackups();
    return {
      backups: backups.map(backup => ({
        name: backup.name,
        size: backup.size,
        date: backup.date.toISOString(),
      })),
      count: backups.length,
    };
  }

  @Get('stats')
  @Permissions('backup:read')
  async getBackupStats(@Request() req) {
    const stats = await this.backupService.getBackupStats();
    return stats;
  }

  @Post('scheduler/start')
  @Permissions('backup:manage')
  async startScheduler(@Request() req) {
    this.backupSchedulerService.start();
    return { message: 'Backup scheduler started' };
  }

  @Post('scheduler/stop')
  @Permissions('backup:manage')
  async stopScheduler(@Request() req) {
    this.backupSchedulerService.stop();
    return { message: 'Backup scheduler stopped' };
  }

  @Get('download/:filename')
  @Permissions('backup:read')
  async downloadBackup(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    // Validate filename to prevent directory traversal
    if (!filename.match(/^clinicos-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/)) {
      throw new Error('Invalid backup filename');
    }

    const backupPath = `/app/backups/${filename}`;
    try {
      await this.backupService.backupDir; // Ensure directory exists
      return res.download(backupPath, filename);
    } catch (error) {
      throw new Error(`Backup file not found: ${filename}`);
    }
  }
}