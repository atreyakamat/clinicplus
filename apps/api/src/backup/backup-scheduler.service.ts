import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from './backup.service';

// Shared by all replicas; only the lock holder performs the nightly dump.
const BACKUP_LOCK_ID = 7_301_2027;

/**
 * Nightly backup at BACKUP_HOUR_LOCAL (server local time). Started by AppService
 * only when BACKUP_SCHEDULE_ENABLED=true. Safe with several API replicas: a
 * Postgres advisory lock ensures a single dump per run.
 */
@Injectable()
export class BackupSchedulerService {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private backupService: BackupService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  get isRunning() {
    return !!this.timer;
  }

  private msUntilNextRun(now = new Date()) {
    const hour = this.config.get<number>('BACKUP_HOUR_LOCAL') ?? 2;
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  start() {
    if (this.timer) return;
    const scheduleNext = () => {
      const delay = this.msUntilNextRun();
      this.logger.log(`Next scheduled backup in ${Math.round(delay / 60_000)} minutes`);
      this.timer = setTimeout(async () => {
        await this.performBackup();
        if (this.timer) scheduleNext();
      }, delay);
      this.timer.unref?.();
    };
    scheduleNext();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.logger.log('Backup scheduler stopped');
    }
  }

  private async performBackup() {
    if (this.running) return;
    this.running = true;
    try {
      const [{ locked }] = await this.prisma.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_lock(${BACKUP_LOCK_ID}) AS locked`;
      if (!locked) {
        this.logger.log('Another replica is running the scheduled backup; skipping');
        return;
      }
      try {
        const result = await this.backupService.createBackup();
        this.logger.log(`Scheduled backup completed: ${result.name}`);
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${BACKUP_LOCK_ID})`;
      }
    } catch (error) {
      this.logger.error(`Scheduled backup failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
