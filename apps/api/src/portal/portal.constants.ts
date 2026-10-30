/**
 * Patient portal auth constants.
 *
 * SECURITY: patient tokens are deliberately shaped so that the staff JwtStrategy
 * rejects them (it requires `payload.sub` to resolve to an active User, and a
 * patient token carries NO `sub`), while the PortalAuthGuard rejects any token
 * that is not marked `typ: 'patient'` (so staff tokens never reach the portal).
 */
export const PORTAL_TOKEN_TYPE = 'patient' as const;

/** Short-lived access token: patients re-authenticate silently via the refresh token. */
export const PORTAL_ACCESS_TTL = '15m';

/** Refresh token / session lifetime. */
export const PORTAL_REFRESH_TTL_DAYS = 30;

/** OTP (one-time login code) lifetime and verification budget. */
export const PORTAL_OTP_TTL_MINUTES = 10;
export const PORTAL_OTP_MAX_ATTEMPTS = 5;
export const PORTAL_OTP_LENGTH = 6;

export const PORTAL_OTP_PURPOSE_LOGIN = 'LOGIN';

/** Claims carried by a patient access token (never trusted for authorization beyond identity + tenant). */
export interface PortalTokenClaims {
  typ: typeof PORTAL_TOKEN_TYPE;
  patientId: string;
  organizationId: string;
  branchId: string;
  /** PatientPortalSession id, so logout / disable can revoke the live session. */
  sid: string;
}

/** Populated on the request by PortalAuthGuard. There is NO staff `req.user` on portal routes. */
export interface PortalPatientContext {
  patientId: string;
  organizationId: string;
  branchId: string;
  sessionId: string;
}
