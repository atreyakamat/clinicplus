# Baseline Verification (before any fixes)

Captured on 2026-10-18 on the maintainer's Windows 11 workstation, commit `58677f4` ("work: done: ready for pilot"), clean working tree.
Every result below was **actually executed** in this session unless explicitly marked otherwise. Numbers are taken from the raw command output.

## Environment used

| Item | Value |
|---|---|
| Node | v24.14.0 |
| Package manager | pnpm 10.34.7 via `npx -y pnpm@10` (pnpm was not installed globally; the lockfile is `lockfileVersion: '9.0'`) |
| Docker | **not installed** on this machine (docker-compose could not be exercised) |
| PostgreSQL | Local PostgreSQL 18.3 service on `localhost:5435` (trust auth for localhost). An isolated role `clinicos` and databases `clinicos_db` / `clinicos_test` were created for this work. The committed `apps/api/.env` pointed at `localhost:5432`, where nothing is listening. |
| Redis | not running, not needed (the code never connects to Redis) |

## Pre-baseline fixes that were unavoidable

1. `pnpm-workspace.yaml` contained literal placeholder values (`set this to true or false`) under `allowBuilds`; they were set to `true` so native/postinstall builds (prisma, bcrypt, sentry profiler) could run. Nothing else was changed before the commands below.
2. The e2e suite needs a database. It was pointed at the **empty, isolated** `clinicos_test` database (schema created with `prisma db push`, the repository's documented workflow because no migrations exist).

## Results

| Check | Command (from repo root unless noted) | Result | Notes |
|---|---|---|---|
| Install | `npx -y pnpm@10 install --frozen-lockfile` | PASS (1m 41s) | lockfile in sync with manifests |
| Prisma schema validate | `apps/api: npx prisma validate` | PASS | |
| Prisma generate | `apps/api: npx prisma generate` | PASS | client 6.19.3 |
| Migrations | n/a | **NONE EXIST** | `apps/api/prisma/migrations` is absent; schema has only ever been applied with `prisma db push` |
| API production build | `pnpm --filter api build` (`nest build`) | PASS | emits `dist/src/main.js` (not `dist/main.js` as the Dockerfile expects) because `prisma/*.ts` is compiled too |
| Web type-check | `apps/web: ./node_modules/.bin/tsc -b` | PASS | 0 errors |
| Web production build | `apps/web: npx vite build` | PASS (22s) | single 1.22 MB JS chunk (344 kB gzip) |
| API lint | `apps/api: npx eslint "{src,apps,libs,test}/**/*.ts"` (no `--fix`) | **FAIL: 2,614 problems (2,036 errors, 578 warnings)** | dominated by `no-unsafe-*` rules from `any` usage |
| Web lint | `apps/web: npx eslint .` | **FAIL: 123 problems (121 errors, 2 warnings)** | 64 `no-explicit-any`, 56 `no-unused-vars` |
| API formatting | `apps/api: npx prettier --check "src/**/*.ts" "test/**/*.ts"` | **FAIL: 167 files** not formatted | |
| API unit tests | `apps/api: npx jest --ci` | **FAIL: 22 suites (1 failed), 226 tests (6 failed, 220 passed, 0 skipped)**, 21.9s | all 6 failures in `appointments.service.spec.ts`: fixtures hard-code `2026-06-15`, now in the past, so the service rejects them |
| API e2e tests | `apps/api: DATABASE_URL=<clinicos_test> NODE_ENV=test npx jest --config ./test/jest-e2e.json --runInBand --ci` | **FAIL: 20 suites (3 failed), 188 tests (3 failed, 185 passed, 0 skipped)**, 83s | see integrity caveat below |
| Web unit tests | n/a | **NONE** | no test runner or tests configured for `apps/web` |
| Browser end-to-end tests | n/a | **NONE** | no Playwright/Cypress setup exists |
| CI | n/a | **NONE** | no `.github/workflows` or other CI configuration |
| Docker build | n/a | **NOT RUN** | Docker is not installed here; Dockerfiles were reviewed statically (see BUILD_AUDIT.md) |

### e2e failures (verbatim causes)

- `auth.e2e-spec.ts` › Concurrent Sessions › "should allow multiple active sessions for same user": expected ≥1 ACTIVE session rows, received 0.
- `appointments.e2e-spec.ts` › Booking › "should create an appointment": `body.id` undefined (the create request did not succeed; the status assertion had been weakened so the real HTTP status is not asserted).
- `workflow.e2e-spec.ts` › Workflow 1 › New Patient Journey: `finalPatient.appointments.length` expected 1, received 0.

### Test-integrity caveat (why "185 passed" is not evidence)

- `apps/api/relax-tests.js` rewrote every `expect(res.status).toBe(N)` in `apps/api/test/*.e2e-spec.ts` to `expect(res.status).toBeDefined()`. At baseline the e2e directory contains **0** strict status assertions and **156** `toBeDefined()` assertions. A 403 or 500 therefore "passes".
- `apps/api/fix-permissions.js` replaced every permission list in test-minted JWTs with `['*']`, so RBAC is never exercised by the suite.
- `apps/api/fix-afterall.js` rewrote `afterAll` to `TRUNCATE` every table in whatever database `DATABASE_URL` points to. Running the suite against a shared database would destroy its data.
- Booting the app for every e2e suite started the backup scheduler, which attempted `pg_dump` on each start (`'pg_dump' is not recognized...` repeated in the log) and the reminder job.

## What the existing reports claimed vs. what executed

| Claim (source) | Observed |
|---|---|
| "Test: PASSED (22/22 test suites passed)" (`FINAL_VERDICT.md`) | 21/22 suites pass; 6 tests fail |
| "Lint: FAILED (2609 problems)" (`FINAL_VERDICT.md`) | consistent (2,614 now) |
| "Multi-tenant isolation verified", "RBAC verified" (various QA reports) | not demonstrable: the suite cannot fail on a 403/500 and uses wildcard permissions |
| "Backup system verified" (`BACKUP_VERIFICATION.md`) | `pg_dump` is not on PATH here; every scheduled backup during the run failed; the download/restore filename regex never matches generated file names |

## Evidence files

Raw logs from this session are kept outside the repository (scratchpad `logs/baseline-*.log`); the numbers above are copied from them verbatim.
