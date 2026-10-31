import { normalizePermission } from '../auth/access.utils';

export interface RequestUser {
  id: string;
  organizationId: string;
  branchId: string;
  orgWide?: boolean;
  roles?: string[];
  permissions?: string[];
}

/** True when the caller holds ANY of the given permission keys (permissions come from the DB via JwtStrategy). */
export function userCan(user: RequestUser | undefined, ...keys: string[]): boolean {
  if (!user || !Array.isArray(user.permissions)) return false;
  const granted = new Set(user.permissions.map(normalizePermission));
  return keys.some((k) => granted.has(normalizePermission(k)));
}

/** Clinical content (consultation notes, vitals, allergies, diagnoses) is only for clinical staff. */
export function hasClinicalAccess(user: RequestUser | undefined): boolean {
  return userCan(user, 'clinical.view', 'consultations.view');
}
