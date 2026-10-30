import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { syncAllOrganizationsAccess } from './access.bootstrap';

// Arbitrary constant shared by all replicas; only the lock holder runs the sync.
const ACCESS_SYNC_LOCK_ID = 7_301_2026;

/**
 * Keeps built-in roles in every tenant aligned with default-access.ts after a
 * deploy. Safe with many replicas: a Postgres advisory lock lets one pod run it.
 */
@Injectable()
export class AccessSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccessSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    if (!this.config.get<boolean>('ACCESS_SYNC_ON_BOOT')) return;
    try {
      const [{ locked }] = await this.prisma.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_lock(${ACCESS_SYNC_LOCK_ID}) AS locked`;
      if (!locked) return;
      try {
        const count = await syncAllOrganizationsAccess(this.prisma);
        this.logger.log(`Synced built-in role permissions for ${count} organization(s)`);
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${ACCESS_SYNC_LOCK_ID})`;
      }
    } catch (err) {
      this.logger.error(`Role permission sync failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
