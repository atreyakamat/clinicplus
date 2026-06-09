# RBAC Testing Report

## Matrix Verification
Executed via `evidence.e2e-spec.ts`:

- **Super Admin:** Global read/write.
- **Organization Owner:** Scoped global read/write.
- **Doctor:** Write access to consultations, read access to patients.
- **Receptionist:** Write access to appointments, no access to medical records.

**Verdict:** `PermissionsGuard` accurately evaluates normalized permissions dynamically per request.
