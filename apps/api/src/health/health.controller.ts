import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheckService, HealthCheck, PrismaHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const READY_TIMEOUT_MS = 3_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), READY_TIMEOUT_MS)),
  ]);
}

/**
 * Probes for load balancers / Kubernetes. Unauthenticated, unthrottled and cheap.
 * - GET /health/live  : the process is up (no dependencies touched).
 * - GET /health/ready : database `SELECT 1` and object storage reachable; 503 otherwise.
 * - GET /health       : legacy combined check (database ping + heap), kept for compatibility.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaIndicator: PrismaHealthIndicator,
    private prisma: PrismaService,
    private memory: MemoryHealthIndicator,
    private storage: StorageService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.memory.checkHeap('memory_heap', 1024 * 1024 * 1024),
    ]);
  }

  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, { status: 'up' | 'down'; error?: string }> = {};
    await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, 'database')
        .then(() => (checks.database = { status: 'up' }))
        .catch((err) => (checks.database = { status: 'down', error: (err as Error).message })),
      withTimeout(this.storage.check(), 'storage')
        .then(() => (checks.storage = { status: 'up' }))
        .catch((err) => (checks.storage = { status: 'down', error: (err as Error).message })),
    ]);
    const failed = Object.entries(checks).filter(([, c]) => c.status === 'down');
    if (failed.length) {
      throw new ServiceUnavailableException(
        `Service not ready: ${failed.map(([name, c]) => `${name} (${c.error})`).join('; ')}`,
      );
    }
    return { status: 'ok', checks };
  }
}
