# Database Testing Report

## Integrity Checks
- **Foreign Keys:** ✅ Verified. Attempting to delete a branch with active queues triggers `P2003 Foreign key constraint violated`.
- **Audit Fields:** ✅ Verified. `createdAt`, `updatedAt`, `createdBy` present on all critical tables.
- **Soft Deletes:** ✅ Verified. Deleting a patient sets `status: 'INACTIVE'` and populates `deletedAt`.
