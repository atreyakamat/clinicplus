import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePermission } from '../auth/access.utils';
import { resolveTimezone } from './date-range.util';

export interface ReqUser {
  id: string;
  organizationId: string;
  branchId: string;
  orgWide?: boolean;
  permissions?: string[];
}

export interface Scope {
  organizationId: string;
  /** null = consolidated across every branch of the organization. */
  branchId: string | null;
  tz: string;
}

export function userCan(user: ReqUser, permission: string): boolean {
  const want = normalizePermission(permission);
  return (user.permissions ?? []).some((p) => normalizePermission(p) === want);
}

/**
 * Branch scope for a report/analytics request. `scope=org` aggregates every branch
 * and is only allowed for org-wide users (Owner / Clinic Admin / Super Admin).
 */
export async function resolveScope(
  prisma: PrismaService,
  user: ReqUser,
  q: { scope?: string; tz?: string },
  defaultTz?: string,
): Promise<Scope> {
  const consolidated = q.scope === 'org';
  if (consolidated && !user.orgWide) {
    throw new ForbiddenException('Organization-wide reports require an organization-level role');
  }
  const branch = await prisma.branch.findFirst({
    where: { id: user.branchId, organizationId: user.organizationId },
    select: { timezone: true },
  });
  return {
    organizationId: user.organizationId,
    branchId: consolidated ? null : user.branchId,
    tz: resolveTimezone(q.tz, branch?.timezone, defaultTz, process.env.DEFAULT_TIMEZONE),
  };
}

/** SQL fragment `AND <alias>.branch_id = $x` when the scope is a single branch. */
export function branchSql(scope: Scope, alias: string): Prisma.Sql {
  return scope.branchId
    ? Prisma.sql`AND ${Prisma.raw(`${alias}.branch_id`)} = ${scope.branchId}::uuid`
    : Prisma.empty;
}

/** Prisma `where` fragment for the scope. */
export function scopeWhere(scope: Scope): { organizationId: string; branchId?: string } {
  return scope.branchId
    ? { organizationId: scope.organizationId, branchId: scope.branchId }
    : { organizationId: scope.organizationId };
}

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const money = (v: unknown): string => num(v).toFixed(2);
