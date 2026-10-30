import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const REDACT_RE = /password|token|secret|hash|authorization|cookie/i;
const MAX_AUDIT_STRING = 2000;

/** Removes credentials and trims oversized strings before anything is persisted in audit rows. */
export function redactForAudit<T>(value: T, depth = 0): T {
  if (value === null || value === undefined || depth > 8) return value;
  if (typeof value === 'string') return (value.length > MAX_AUDIT_STRING ? value.slice(0, MAX_AUDIT_STRING) + '…' : value) as T;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redactForAudit(v, depth + 1)) as T;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto && proto !== Object.prototype && typeof (value as any).toJSON === 'function') {
      return (value as any).toJSON();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_RE.test(k) ? '[REDACTED]' : redactForAudit(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

export interface AuditEntry {
  organizationId: string;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(data: AuditEntry) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          organizationId: data.organizationId,
          actorId: data.userId ?? null,
          action: data.action,
          entityType: data.resource,
          entityId: data.resourceId ?? null,
          beforeData: data.beforeData === undefined ? undefined : (redactForAudit(data.beforeData) as any),
          afterData: data.afterData === undefined ? undefined : (redactForAudit(data.afterData) as any),
          ipAddress: data.ipAddress?.slice(0, 64),
          userAgent: data.userAgent?.slice(0, 300),
        },
      });
    } catch (err) {
      // Audit must never break the business operation, but failures are visible in logs.
      this.logger.error(`Audit write failed for ${data.action} ${data.resource}: ${(err as Error).message}`);
      return null;
    }
  }
}
