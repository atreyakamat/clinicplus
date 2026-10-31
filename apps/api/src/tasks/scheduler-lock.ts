import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Advisory-lock ids for the continuity-of-care background jobs (distinct from other jobs). */
export const LOCK_IDS = {
  followUpCompliance: 7_302_2026,
  reviewRequests: 7_303_2026,
  taskAutomation: 7_304_2026,
} as const;

/**
 * Runs `fn` inside a transaction that holds a transaction-scoped Postgres
 * advisory lock. With several API replicas only one runs a given job at a time;
 * the lock is released automatically on commit/rollback (no leaked session locks
 * on pooled connections). Returns null when another replica holds the lock.
 */
export async function withJobLock<T>(
  prisma: PrismaService,
  lockId: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  timeoutMs = 120_000,
): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${lockId}::bigint) AS locked`;
      if (!locked) return null;
      return fn(tx);
    },
    { timeout: timeoutMs, maxWait: 10_000 },
  );
}

/** Whether background jobs may start in this process (never in tests). */
export function schedulerEnabled(config: ConfigService): boolean {
  if (config.get('NODE_ENV') === 'test') return false;
  return !!config.get<boolean>('SCHEDULER_ENABLED');
}

/**
 * Small interval runner: runs `job` shortly after boot and then every
 * `intervalMs`, never overlapping itself, logging (not throwing) failures.
 */
export class IntervalJob {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly name: string,
    private readonly intervalMs: number,
    private readonly job: () => Promise<unknown>,
    private readonly logger = new Logger(name),
  ) {}

  start() {
    if (this.timer) return;
    this.logger.log(`Starting ${this.name} (every ${Math.round(this.intervalMs / 60000)} min)`);
    setTimeout(() => void this.tick(), 30_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.job();
    } catch (err) {
      this.logger.error(`${this.name} failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }
}
