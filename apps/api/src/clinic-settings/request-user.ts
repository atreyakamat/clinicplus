import { normalizePermission, normalizeRoleName } from '../auth/access.utils';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

export type ReqUser = AuthenticatedUser;

/** True when the authenticated user holds the permission (same normalisation as PermissionsGuard). */
export function can(user: Pick<ReqUser, 'permissions'>, permission: string): boolean {
  const wanted = normalizePermission(permission);
  return (user.permissions ?? []).some((p) => normalizePermission(p) === wanted);
}

export function hasRole(user: Pick<ReqUser, 'roles'>, role: string): boolean {
  const wanted = normalizeRoleName(role);
  return (user.roles ?? []).some((r) => normalizeRoleName(r) === wanted);
}

export const DOCTOR_ROLE = 'Doctor';
