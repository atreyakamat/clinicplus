# ClinicPlus — Security Overview

This records the security model and the findings of an internal review of the
`feat/sellable-core` branch. It is not a substitute for an external penetration
test before production (see `FINAL_ASSESSMENT_AND_NEXT_STEPS.md`).

## Model

- **Authentication.** Staff use JWT access tokens + rotating refresh sessions
  (hashed, single-use, reuse-revoking). Optional staff TOTP 2FA with hashed
  recovery codes. Patients use a *separate* portal token (`typ:"patient"`, no
  `sub`) that staff endpoints reject, and a separate refresh session table.
- **Authorization.** Every request re-derives roles/permissions/tenant from the
  database; token claims are never trusted for authz. Endpoints declare a
  `module.action` permission enforced by a guard. The role matrix
  (`apps/api/src/auth/default-access.ts`) is the single source of truth and is
  re-synced to every clinic at boot.
- **Tenancy.** All data is scoped by `organizationId`; branch-scoped data is
  additionally scoped by branch. Branch-level staff are pinned to their branch;
  only Owner/Clinic Admin/Super Admin may switch via `X-Branch-Id` (validated to
  belong to the org). Anti-escalation: nobody can grant a permission they don't
  hold, change their own roles, or remove the last Owner.
- **Secrets & transport.** `JWT_SECRET` must be ≥32 chars in production; secrets
  come from env/secret stores, never the repo. CORS is origin-restricted. Helmet
  headers are set. Object storage is private (reads go through the audited API).
- **Integrations.** Stripe and Twilio webhooks verify signatures against the raw
  body and are idempotent (`WebhookEvent`). Uploads are type-sniffed, size-capped
  and (optionally) malware-scanned fail-closed. CSV exports neutralise formula
  injection; backups shell out via `execFile` with validated arguments.

## Internal review (2026-10-30) — resolved in this branch

- **MEDIUM — Portal enable/disable branch bypass.** Branch-level staff could
  enable a portal login for a patient in another branch of the same clinic. Fixed:
  the lookup is now branch-scoped for non-org-wide staff (regression test added).
- **MEDIUM — CSV formula injection** in the appointments and reports exports
  (patient-controllable fields). Fixed: a shared `csvSafe` helper neutralises
  every exported cell; unit test added.
- **LOW — Portal not subject to the subscription gate.** Suspended clinics could
  still take new portal bookings/payments. Fixed: portal self-booking and
  pay-link creation now require an active subscription; read access stays open.
- **LOW — Login timing oracle.** A dummy bcrypt compare now runs on the
  account-missing path for staff and portal login.
- **LOW — Missing `X-Content-Type-Options: nosniff`** on portal downloads, and an
  **unthrottled public payment-status endpoint.** Both fixed.

## Known hardening backlog (not blocking; tracked)

- **TOTP secret at rest.** `User.twoFactorSecret` is stored in plaintext
  (recovery codes are hashed). Encrypt it at rest with a managed key (e.g. KMS or
  a dedicated `TWO_FACTOR_ENC_KEY`) so a database read alone cannot bypass 2FA.
- **Portal refresh-token reuse detection.** Staff refresh revokes the session on
  a reuse mismatch; the portal should do the same (currently a reused rotated
  token simply fails without revoking the session).
- **Subscription `adminSet`** relies solely on `admin.view` being un-grantable.
  That holds today; add a defense-in-depth platform-org check if the Super Admin
  seeding model changes.
- **Portal OTP identifier match** uses a loose phone `contains`; consider exact
  normalised-E.164 matching to avoid routing a code to the wrong patient (not a
  takeover — the code is still required).

## Before production

External pen test; live-provider secrets; TLS; backup restore drill; monitoring
and alerting; and the legal/compliance documents (privacy policy, terms,
BAA/DPA) for the target market.
