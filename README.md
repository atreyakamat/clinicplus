# ClinicPlus

Multi-tenant clinic management SaaS: patients, scheduling, queue, consultations,
prescriptions, documents, billing with online payments, patient messaging,
follow-ups, reviews, tasks and analytics — with role-based access for every
member of a clinic team.

| | |
|---|---|
| API | NestJS 11 · Prisma 6 · PostgreSQL 16 (`apps/api`) |
| Web | React 19 · Vite · Tailwind · TanStack Query (`apps/web`) |
| Integrations | Stripe (payments) · Twilio (SMS + WhatsApp) · Resend/SendGrid (e-mail) · S3-compatible storage · ClamAV |
| Deploy | Docker Compose, Kubernetes (Kustomize: dev / staging / production) |

## What's in the product

- **Clinic setup** — branches, departments, service & price catalog, working hours, holidays, onboarding wizard.
- **Doctors & scheduling** — doctor profiles, weekly availability, leave, computed open slots, double-booking prevention, reschedule/cancel/no-show, waitlist.
- **Front desk** — patient registration with duplicate detection, enriched global search, daily token queue with priorities/rooms and a waiting-room TV display.
- **Clinical** — consultation workspace (vitals, ICD diagnoses, allergies, conditions), prescriptions with allergy/duplicate safety checks and PDF, document vault (real storage, type sniffing, malware scan, audited downloads), patient timeline.
- **Billing** — invoices from the service catalog, payments, refunds, Stripe payment links with signed webhooks, outstanding/ageing/daily-close/revenue reports with CSV export.
- **Engagement** — Twilio SMS/WhatsApp with delivery tracking and inbox, templates, campaigns with audience filters and opt-out, automatic confirmations/reminders, follow-up compliance, review requests with public NPS page, referrals.
- **Operations** — tasks with comments, workflow templates, automatic tasks (missed follow-ups, overdue invoices), role-specific dashboards and analytics.
- **Patient portal** — patients log in (password or OTP) to see only their own appointments, prescriptions, invoices and documents, self-book, and pay online; fully isolated from staff auth.
- **Administration** — staff invitations, staff 2FA (TOTP + recovery codes), custom roles with anti-escalation rules, sessions, audit log viewer, bulk patient CSV import, encrypted backups (local + S3), platform operator panel.
- **Billing plans** — Starter/Growth/Enterprise with per-plan branch/staff/patient limits, trial handling, and automatic suspension of non-paying clinics.

## Access control

Nine built-in roles (Super Admin, Organization Owner, Clinic Admin, Branch Manager, Doctor,
Receptionist, Nurse, Accountant, Patient) follow `docs/roleandpermissionrbac.md`. The matrix lives
in `apps/api/src/auth/default-access.ts` and is re-applied to every clinic at boot.

- Every endpoint declares a `module.action` permission; permissions are loaded from the database on each request, never trusted from the token.
- All data is scoped to the organization; branch-level staff are pinned to their branch, while Owner / Clinic Admin can switch branches (`X-Branch-Id`).
- Clinics can create custom roles, but nobody can grant a permission they don't hold or change their own roles.
- `apps/api/test/rbac-matrix.e2e-spec.ts` asserts the matrix role-by-role.

## Quick start (local development)

Requirements: Node 22+, pnpm 10 (`corepack enable`), PostgreSQL 16.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # set DATABASE_URL and JWT_SECRET
pnpm db:migrate
pnpm db:seed:demo                           # optional demo clinic (prints logins)
pnpm dev:api                                # API on :3000
pnpm dev                                    # web on :5173 (proxies /api)
```

The demo seed creates **Sunrise Family Clinic** with one login per role
(`organization.owner@sunrise.demo`, `doctor@sunrise.demo`, `receptionist@sunrise.demo`, …;
password `Demo@Clinic2026` unless `SEED_PASSWORD` is set). For production, create the platform
operator account with `SUPERADMIN_EMAIL=… SUPERADMIN_PASSWORD=… pnpm --filter api seed`;
clinics then sign themselves up from the web app.

## Run with Docker

```bash
cp .env.example .env        # set POSTGRES_PASSWORD, JWT_SECRET, APP_BASE_URL, CORS_ORIGINS
docker compose up -d --build
docker compose --profile demo run --rm seed   # optional demo data
```

Kubernetes: `sh deploy/k8s/deploy.sh <dev|staging|production>`. See
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the production checklist, secrets, TLS,
Stripe/Twilio webhook URLs, migrations, backups, scaling and the security model.

## Quality gates

```bash
pnpm typecheck                     # api + web
pnpm test                          # API unit tests
DATABASE_URL=postgresql://…/clinicos_test pnpm test:e2e   # e2e (needs a *_test database)
pnpm --filter web build
```

CI (`.github/workflows/ci.yml`) runs all of the above against a Postgres service, builds and
pushes images, and validates the Kubernetes manifests.

## Repository layout

```
apps/api        NestJS API, Prisma schema + migrations, e2e tests
apps/web        React SPA
packages/*      shared UI, types and validators
deploy/         container scripts and Kubernetes manifests (Kustomize)
docs/           product specs (feature1-30, RBAC, architecture) and deployment guide
```

## Not yet built

Roadmap items from the specs that are intentionally out of this release: AI copilot and AI
receptionist (features 21-22), a native patient mobile app (23 — the web patient portal ships;
native iOS/Android does not), telemedicine (24), partner marketplace (25), ABHA/ABDM
integration (26) and the data warehouse (28). Selling the platform itself still needs live
provider credentials (Stripe, Twilio with approved WhatsApp templates, S3, mail) and the
legal/compliance documents (privacy policy, terms, BAA/DPA) for your market.
