# ClinicPlus engineering conventions (API)

These rules apply to every module under `apps/api/src`. They exist because the pilot-readiness audit (docs/BUILD_AUDIT.md) found the same classes of defect across modules: unscoped tenant access, mass assignment through `any` bodies, client-trusted money, and weakened tests.

## 1. Request handling

- Every controller is mounted under `api/v1/<module>` and guarded with `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)` at class level. Public endpoints must be explicitly justified in a comment.
- Every handler that needs a permission declares `@Permissions('module.action')`. The key MUST exist in `src/auth/default-access.ts` (`DEFAULT_PERMISSIONS`). Do not invent new keys without adding them there and to the role matrix.
- `req.user` is an `AuthenticatedUser` (`src/auth/strategies/jwt.strategy.ts`): `{ id, email, organizationId, branchId, roles, permissions, sessionId }`. Tenant identity ALWAYS comes from `req.user`, never from the body or query.
- Request bodies are typed with class-validator DTOs under `<module>/dto/`. Never use `@Body() data: any`. The global `ValidationPipe({ whitelist: true, transform: true })` strips unknown fields only when a DTO class is used. Use `@Type(() => Number)` for numbers, `@IsUUID()` for ids, `@MaxLength` for strings, `@IsISO8601()` for dates, `@IsIn([...])` / `@IsEnum` for enums, `@ValidateNested({ each: true })` + `@Type(() => ItemDto)` for arrays.
- Validate path ids with `assertUuid()` from `src/common/validation/uuid.ts` (or `@IsUUID()` in a DTO) so Postgres never receives a malformed uuid.

## 2. Multi-tenant isolation

- Every read scopes by `organizationId` (and `branchId` where the model has it and the feature is branch-scoped). Missing rows are reported as `NotFoundException` (404), never 403, so ids from other tenants are indistinguishable from non-existent ones.
- Every write first loads the target row with the tenant scope, then updates by id.
- Every client-supplied foreign key (patientId, doctorId, appointmentId, invoiceId, consultationId, roleId, assignedTo, ...) is verified with `TenantAssertService` (`src/common/tenant/tenant-assert.service.ts`, injectable everywhere; it is a global module) BEFORE use.
- Never spread a request body into Prisma `data`. Map fields explicitly.

## 3. Money and quantities

- Use Prisma `Decimal` (`import { Prisma } from '@prisma/client'`; `new Prisma.Decimal(x)`) for every monetary computation; never JS floats. Round to 2 decimals with `toDecimalPlaces(2)`.
- Totals are computed on the server from line items; the client may propose numbers but the server recomputes and stores its own result.
- Amounts must be `> 0` with at most 2 decimal places. Reject anything else with 400.
- Operations that must be atomic run inside `prisma.$transaction(async (tx) => ...)`; row-level locks use `tx.$queryRaw\`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE\`` (template literal, never string concatenation).

## 4. Responses

- Controllers return plain objects; the global `TransformInterceptor` wraps them as `{ data, meta }` and strips `passwordHash` / `refreshTokenHash` recursively.
- List endpoints are paginated: accept `PaginationQueryDto` (`src/common/pagination.ts`; `page`, `limit` ≤ 200, default 50) and return `paginated(items, total, page, limit)`. The interceptor turns that into `{ data: items, meta: { total, page, limit, pages } }`.
- Errors: throw Nest HttpExceptions with the right status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found/foreign tenant, 409 conflict/state violation, 422 is NOT used). Never `throw new Error()` from a controller.

## 5. Audit and timeline

- Significant writes call `AuditService.log({...})` with `beforeData`/`afterData` (the service redacts credential-like keys). Patient-facing clinical events also call `TimelineService.record(...)`.

## 6. Background jobs, external services

- Nothing runs on boot unless enabled by env (`SCHEDULER_ENABLED`, `BACKUP_SCHEDULE_ENABLED`). Jobs are idempotent and keyed (see `Message.reminderKey`).
- External providers are selected by env and have a `console` implementation that never contacts the outside world and records what it would have sent.

## 7. Tests (non-negotiable)

- Unit tests (`src/**/*.spec.ts`, `npx jest src/<module>`) test business rules with mocked Prisma; they must fail if the rule is removed.
- e2e tests (`test/<module>.e2e-spec.ts`, run with `DATABASE_URL=<your isolated *_test db> NODE_ENV=test npx jest --config ./test/jest-e2e.json --runInBand test/<file>`) use `test/helpers/app.ts`: `createTestApp()`, `createTenant()` (one logged-in user per role), `auth(user)`, `createPatient()`, `futureSlot()`. Create two tenants to prove isolation.
- Assert EXACT status codes (`expect(res.status).toBe(201)`), never `toBeDefined()`. Assert response bodies and database state.
- Never mint JWTs by hand except to prove forged/expired tokens are rejected. Never grant `'*'`. Never skip tests. Never delete a failing test because it exposes a defect: fix the defect.
- Dates in fixtures are relative to `new Date()` (use `futureSlot()`), never hard-coded calendar dates.

## 8. Code style

- TypeScript strictNullChecks is on. Keep `any` out of new code where a Prisma type exists.
- Run `pnpm --filter api typecheck` before finishing; it must pass.
