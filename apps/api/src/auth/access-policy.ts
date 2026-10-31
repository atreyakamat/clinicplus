import { ForbiddenException } from '@nestjs/common';
import { normalizePermission, normalizeRoleName } from './access.utils';
import { ALL_PERMISSION_KEYS } from './default-access';

/** Minimal shape of `req.user` needed for access-administration checks. */
export interface Actor {
  id: string;
  organizationId: string;
  branchId: string;
  homeBranchId?: string;
  orgWide?: boolean;
  roles: string[];
  permissions: string[];
}

/** Permissions that only an actor who already holds them may ever grant (platform level). */
const NEVER_DELEGATED_WITHOUT_HOLDING = new Set(['admin.view']);

export const OWNER_ROLE = 'Organization Owner';
export const SUPER_ADMIN_ROLE = 'Super Admin';

const VALID_KEYS = new Set(ALL_PERMISSION_KEYS.map(normalizePermission));

export function isValidPermissionKey(key: string) {
  return VALID_KEYS.has(normalizePermission(key));
}

/** Owner and Super Admin are exempt from the subset rule (they administer the clinic). */
export function isPrivilegedActor(actor: Actor) {
  const roles = new Set((actor.roles ?? []).map(normalizeRoleName));
  return roles.has(normalizeRoleName(OWNER_ROLE)) || roles.has(normalizeRoleName(SUPER_ADMIN_ROLE));
}

export function actorPermissionSet(actor: Actor) {
  return new Set((actor.permissions ?? []).map(normalizePermission));
}

/**
 * Returns the keys in `keys` that `actor` may NOT grant. Anti-escalation rule:
 * a user may only grant permissions they hold themselves (Owner / Super Admin
 * exempt), and platform permissions (admin.view) are never granted by someone
 * who does not hold them, whoever they are.
 */
export function ungrantablePermissions(actor: Actor, keys: Iterable<string>): string[] {
  const held = actorPermissionSet(actor);
  const privileged = isPrivilegedActor(actor);
  const denied: string[] = [];
  for (const raw of keys) {
    const key = normalizePermission(raw);
    if (held.has(key)) continue;
    if (privileged && !NEVER_DELEGATED_WITHOUT_HOLDING.has(key)) continue;
    denied.push(key);
  }
  return denied;
}

export function assertCanGrant(actor: Actor, keys: Iterable<string>, what = 'grant') {
  const denied = ungrantablePermissions(actor, keys);
  if (denied.length) {
    throw new ForbiddenException(
      `You cannot ${what} permissions you do not hold yourself: ${denied.slice(0, 10).join(', ')}${denied.length > 10 ? '…' : ''}`,
    );
  }
}

/** Serializes the permission keys of a role loaded with rolePermissions.permission. */
export function rolePermissionKeys(role: { rolePermissions?: { permission?: { module: string; action: string } | null }[] }) {
  return (role.rolePermissions ?? [])
    .map((rp) => rp.permission)
    .filter((p): p is { module: string; action: string } => !!p)
    .map((p) => normalizePermission(`${p.module}.${p.action}`));
}
