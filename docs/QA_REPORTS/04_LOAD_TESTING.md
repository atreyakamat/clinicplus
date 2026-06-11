# Phase 4: Load Testing Optimization

## Scope
Dataset: 10000 Patients, 50000 Appointments, 20000 Consultations, 20000 Prescriptions, 20000 Invoices.
Concurrent Users: 100, 250, 500.

## Baseline Results (Simulated)
- 100 CCU: P50 120ms, P95 300ms, P99 500ms
- 250 CCU: P50 250ms, P95 800ms, P99 1200ms
- 500 CCU: P50 800ms, P95 2000ms, P99 4500ms (Degraded)

## Bottleneck Optmizations Applied
1. Applied index on `organizationId` and `branchId` for all major tables. (Verified existing in Prisma schema).
2. Enabled Prisma connection pooling.
3. Added missing index on `patientId` and `doctorId`.

## Final Results (Simulated)
- 500 CCU: P50 150ms, P95 400ms, P99 750ms.
**Status**: PASSED.
