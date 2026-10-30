# ClinicPlus — Deployment Guide

ClinicPlus ships as two container images built from this monorepo:

| Image | Dockerfile | What it runs |
|---|---|---|
| `clinicplus-api` | `apps/api/Dockerfile` | NestJS API (`node dist/main.js`) on :3000 as uid 1000, `tini` as PID 1. Also contains the Prisma CLI (`migrate` command) and `pg_dump`/`pg_restore` 16 for backups. |
| `clinicplus-web` | `apps/web/Dockerfile` | Vite SPA on unprivileged nginx :8080 (uid 101). nginx also reverse-proxies `/api/*` to the API, so the browser only ever talks to one origin. |

Request path: `browser → (TLS: ingress / LB) → web nginx :8080 → /api/* → api :3000 → PostgreSQL 16`.

Supporting pieces:

* **PostgreSQL 16** (in-compose container, or a managed database in Kubernetes).
* **Object storage** (S3 / MinIO) for patient documents — required in Kubernetes, optional in Compose.
* **ClamAV** (optional) for malware-scanning uploads.

Contents: [Docker Compose](#1-docker-compose-single-server) · [Production checklist](#2-production-checklist) · [Kubernetes](#3-kubernetes) · [Migrations & rollback](#4-migrations--rollback) · [Backups & restore](#5-backups--restore) · [Scaling](#6-scaling-notes) · [Security model](#7-security-model) · [CI/CD](#8-cicd) · [Troubleshooting](#9-troubleshooting)

---

## 1. Docker Compose (single server)

Requirements: Docker Engine 24+ with Compose v2.20+, 2 vCPU / 4 GB RAM, a DNS name if you want TLS.

```bash
git clone https://github.com/atreyakamat/clinicplus.git && cd clinicplus
cp .env.example .env
# Edit .env — at minimum:
#   POSTGRES_PASSWORD=$(openssl rand -hex 24)
#   JWT_SECRET=$(openssl rand -hex 32)
#   APP_BASE_URL / CORS_ORIGINS = the URL users will open (e.g. https://clinic.example.com)
docker compose up -d --build
docker compose ps            # postgres healthy, migrate exited 0, api healthy, web healthy
```

Open `http://<server>` (or `WEB_PORT`). Compose refuses to start if `POSTGRES_PASSWORD` or `JWT_SECRET` is empty.

What happens on `up`:

1. `postgres` starts (volume `postgres_data`, **no published port**, internal network only).
2. `migrate` (API image, `migrate` command) runs `prisma migrate deploy` once and exits 0.
3. `api` starts only after the migration succeeded (`service_completed_successfully`), with a read-only root filesystem; uploads → volume `api_storage`, in-app backups → volume `api_backups`.
4. `web` starts once the API is healthy and publishes `${WEB_BIND:-0.0.0.0}:${WEB_PORT:-80} → 8080`.

The API is not published to the host. `postgres`, `minio`, `clamav` sit on an `internal` network with no route to the internet.

Optional profiles:

```bash
# S3-compatible storage (MinIO) — then set in .env:
#   STORAGE_DRIVER=s3 S3_ENDPOINT=http://minio:9000 S3_FORCE_PATH_STYLE=true S3_BUCKET=clinicplus
#   S3_ACCESS_KEY_ID=$MINIO_ROOT_USER S3_SECRET_ACCESS_KEY=$MINIO_ROOT_PASSWORD
docker compose --profile storage up -d

# Malware scanning — set MALWARE_SCAN=clamav CLAMAV_HOST=clamav (first start downloads signatures)
docker compose --profile av up -d

# Demo data (sales demos / trials only — never on a real clinic database).
# Builds the `tools` target (dev dependencies + ts-node) and runs prisma/demo-seed.ts.
docker compose --profile demo run --rm seed
```

Local debugging (binds Postgres on 127.0.0.1:5432 and the API on 127.0.0.1:3000):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Running released images instead of building: set `API_IMAGE=ghcr.io/atreyakamat/clinicplus-api:<sha>` and `WEB_IMAGE=ghcr.io/atreyakamat/clinicplus-web:<sha>` in `.env`, then `docker compose pull && docker compose up -d --no-build`.

### TLS with Compose

The web container speaks plain HTTP. Put a TLS terminator in front (Caddy, Traefik, nginx, a cloud load balancer) that forwards to `WEB_PORT` and sets `X-Forwarded-Proto: https` and `X-Forwarded-For`. Then:

* set `REAL_IP_FROM` to the proxy's address/CIDR (so login throttling sees real client IPs), and
* bind the web port to localhost if the proxy runs on the same host: `WEB_BIND=127.0.0.1`.

HSTS is sent automatically when the request arrived over HTTPS (`X-Forwarded-Proto: https`).

### Updating

```bash
git pull
docker compose up -d --build     # migrate runs again before the new api starts
docker image prune -f
```

Helper scripts in the root `package.json`: `pnpm docker:up`, `docker:logs`, `docker:migrate`, `docker:seed:demo`, `docker:down`.

---

## 2. Production checklist

Secrets & config

- [ ] `JWT_SECRET` — 32+ random chars (`openssl rand -hex 32`). The API refuses weak values when `NODE_ENV=production`.
- [ ] Database: a dedicated role (not superuser); managed Postgres with `sslmode=require` in `DATABASE_URL`; automated snapshots / PITR enabled at the provider.
- [ ] Database password URL-safe (it is embedded in `DATABASE_URL`).
- [ ] `APP_BASE_URL`, `CORS_ORIGINS` and `API_PUBLIC_URL` all equal the public origin, e.g. `https://clinic.example.com` (single origin; nginx proxies `/api`). `API_PUBLIC_URL` must be a valid URL or unset — an empty string fails validation.
- [ ] Secrets never in git or in images: `.env` (Compose) / `clinicplus-secrets` Secret via External Secrets or Sealed Secrets (Kubernetes). `.dockerignore` excludes every `.env*` except examples.

TLS & network

- [ ] HTTPS only (cert-manager / LB certificate). HSTS is enabled automatically behind TLS.
- [ ] Only the web entry point is public; Postgres is never exposed.
- [ ] `REAL_IP_FROM` (web) matches your proxy/ingress CIDR; `TRUST_PROXY=true` on the API (already set by Compose and the K8s config).

Storage & backups

- [ ] Kubernetes: `STORAGE_DRIVER=s3`, a **private** bucket with default encryption + versioning; bucket lifecycle rule for `backups/` (e.g. expire after 35 days).
- [ ] Backups verified by an actual restore drill (see §5). Alert when the backup CronJob fails.
- [ ] Compose: back up the `postgres_data`, `api_storage` and `api_backups` volumes off-host.

Payments (Stripe) — `PAYMENTS_PROVIDER=stripe`

- [ ] `STRIPE_SECRET_KEY` (sk_live_…) and `STRIPE_WEBHOOK_SECRET` (whsec_…).
- [ ] Stripe Dashboard → Developers → Webhooks → endpoint **`https://<host>/api/v1/webhooks/stripe`**; select the events the API handles — `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.refund.updated` — and copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Messaging (Twilio SMS / WhatsApp) — `MESSAGING_PROVIDER=twilio`

- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_SMS_FROM` and/or `TWILIO_WHATSAPP_FROM`.
- [ ] `API_PUBLIC_URL=https://<host>` — status callbacks are sent per message to **`https://<host>/api/v1/webhooks/twilio/status`**.
- [ ] Twilio number / WhatsApp sender → "A message comes in" webhook: **`https://<host>/api/v1/webhooks/twilio/inbound`** (HTTP POST). Requests are verified with the Twilio signature against `API_PUBLIC_URL`, so it must match the URL configured in Twilio exactly.
- [ ] With `MESSAGING_PROVIDER=console` nothing is sent; messages are only logged and recorded — say so to the clinic.

Observability

- [ ] `SENTRY_DSN` (API) and optionally `VITE_SENTRY_DSN` (web build arg) + `CSP_CONNECT_EXTRA=https://<org>.ingest.sentry.io`.
- [ ] Log shipping from stdout (JSON-less Nest logs; `LOG_LEVEL=log`).
- [ ] Uptime check on `https://<host>/` and alerting on pod restarts / failed Jobs.

Malware scanning (optional) — `MALWARE_SCAN=clamav`, `CLAMAV_HOST`, `CLAMAV_PORT`.

---

## 3. Kubernetes

Layout (`deploy/k8s`, plain Kustomize — `kubectl apply -k`, kubectl ≥ 1.27):

```
base/                  namespace (PSA restricted), ServiceAccount clinicplus-app (no RBAC, no token),
                       ConfigMap (configMapGenerator: config.env), api + web Deployments/Services/HPA/PDB,
                       Ingress, NetworkPolicies, backup CronJob + PVC, secret.example.yaml (NOT applied)
migrate/               the migration Job (applied separately, before each rollout)
overlays/dev/          single replicas, in-cluster Postgres 16 StatefulSet + MinIO, no HPA/PDB, HTTP ingress
overlays/staging/      production topology, staging host
overlays/production/   managed Postgres (CIDR NetworkPolicy), 3–12 API replicas, hard zone spread
overlays/<env>/images/ Kustomize Component holding the image tags (shared by the app and migrate builds)
overlays/<env>/migrate/ migrate Job for that environment
rbac/                  CI deployer Role + read-only support Role (applied once by an admin)
deploy.sh              ordered rollout: config → migrate (must succeed) → app → wait
```

Cluster prerequisites: an ingress-nginx controller (namespace `ingress-nginx`), cert-manager with a `letsencrypt-prod` ClusterIssuer (production/staging), metrics-server (HPA), a CNI that enforces NetworkPolicy, a default StorageClass.

Routing decision: the Ingress sends **everything** to the web Service; web nginx proxies `/api/*` to `clinicplus-api:3000`. One origin, so `APP_BASE_URL == API_PUBLIC_URL == CORS_ORIGINS == https://<host>` and provider webhooks hit `https://<host>/api/v1/webhooks/...`. The API health endpoints are not reachable from outside (probes call pods directly).

Storage decision: Kubernetes defaults to `STORAGE_DRIVER=s3`. Pods are replicated and their filesystems are ephemeral; `local` storage would need a ReadWriteMany volume shared by every API replica.

### 3.1 Dev / demo cluster (kind, minikube, k3d)

```bash
# ingress-nginx must be installed; clinicplus.localtest.me resolves to 127.0.0.1
cp deploy/k8s/overlays/dev/secrets.env.example deploy/k8s/overlays/dev/secrets.env   # edit values
sh deploy/k8s/deploy.sh dev --admin
# open http://clinicplus.localtest.me
```

Uses `ghcr.io/atreyakamat/clinicplus-{api,web}:latest`. For local images see the comment in `overlays/dev/images/kustomization.yaml` (`kind load docker-image ...`). Demo data: `kubectl -n clinicplus port-forward svc/clinicplus-postgres 5432` and run `pnpm db:seed:demo` locally with `DATABASE_URL` pointing at the forwarded port.

### 3.2 Staging / production

One-time (cluster admin):

```bash
# 1. Namespace (PSA restricted) and RBAC
kubectl apply -k deploy/k8s/overlays/production -l clinicplus.io/admin-only=true
kubectl apply -k deploy/k8s/rbac        # edit the on-call group in rbac/support.yaml first

# 2. Application secret (pick one; keys listed in deploy/k8s/base/secret.example.yaml)
kubectl -n clinicplus create secret generic clinicplus-secrets --from-env-file=prod-secrets.env
#    or an ExternalSecret / SealedSecret producing a Secret named clinicplus-secrets
```

Edit before the first deploy:

* `overlays/production/config.env` — public URL, S3 bucket/region, providers.
* `overlays/production/kustomization.yaml` — Ingress host.
* `overlays/production/networkpolicy-db.yaml` — CIDR of the managed database.
* `overlays/production/images/kustomization.yaml` — image tags (git SHA from CI):

  ```bash
  cd deploy/k8s/overlays/production/images
  kustomize edit set image clinicplus-api=ghcr.io/atreyakamat/clinicplus-api:<sha> \
                           clinicplus-web=ghcr.io/atreyakamat/clinicplus-web:<sha>
  ```

* Cloud IAM for S3 (recommended over static keys): annotate the `clinicplus-app` ServiceAccount (EKS IRSA `eks.amazonaws.com/role-arn`, GKE `iam.gke.io/gcp-service-account`) and omit `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`.

Every release (CI with the deployer ServiceAccount, or an operator):

```bash
sh deploy/k8s/deploy.sh production       # or staging
```

`deploy.sh` applies the `clinicplus.io/phase=pre` objects (ServiceAccount, ConfigMap, NetworkPolicies), deletes and re-creates the `clinicplus-migrate` Job, waits for it to succeed (aborts the release and prints logs if it fails), applies the rest, and waits for both rollouts. Changing `config.env` changes the ConfigMap's hashed name, so the API rolls automatically.

Inspect: `kubectl kustomize deploy/k8s/overlays/production` (or `pnpm k8s:render`).

---

## 4. Migrations & rollback

* Migrations are Prisma migrations in `apps/api/prisma/migrations`, applied with `prisma migrate deploy` (only pending migrations; never resets data). Prisma serialises concurrent runs with a Postgres advisory lock.
* Compose: the `migrate` service runs on every `up`. Manually: `docker compose run --rm migrate`. Status: `docker compose run --rm migrate prisma migrate status`.
* Kubernetes: the `clinicplus-migrate` Job (see `deploy.sh`). Status: `kubectl -n clinicplus logs job/clinicplus-migrate`.
* **Write backward-compatible migrations** (expand → deploy → contract): during a rolling update old and new API pods run against the new schema at the same time.

Rollback:

1. Application only (schema compatible): redeploy the previous image tag — `kubectl -n clinicplus rollout undo deployment/clinicplus-api deployment/clinicplus-web` or set the previous SHA in `images/` and run `deploy.sh`. Compose: set `API_IMAGE`/`WEB_IMAGE` to the previous tag and `docker compose up -d`.
2. Schema: Prisma has no automatic down-migrations. Either ship a new forward migration that reverts the change, or restore the pre-release backup (§5). Take a manual backup before risky releases:
   `kubectl -n clinicplus create job --from=cronjob/clinicplus-backup pre-release-$(date +%s)`.
3. A failed migration leaves the migration marked failed: fix forward, then `prisma migrate resolve --rolled-back <migration>` (run it with `kubectl run`/`docker compose run --rm migrate prisma migrate resolve ...`) before re-running.

---

## 5. Backups & restore

| Where | How | Location |
|---|---|---|
| Compose | in-app scheduler (`BACKUP_SCHEDULE_ENABLED=true`, daily at `BACKUP_HOUR_LOCAL`) + UI/API-triggered backups, `pg_dump` inside the API container | volume `api_backups` → copy off-host |
| Kubernetes | `clinicplus-backup` CronJob, 02:00 Asia/Kolkata (`deploy/docker/api/backup.js`): `pg_dump -Fc`, verified with `pg_restore --list`, uploaded to `s3://$S3_BUCKET/backups/` (SSE-AES256) | PVC `clinicplus-backups` + S3 |

In Kubernetes the in-app scheduler is disabled (`BACKUP_SCHEDULE_ENABLED=false`); UI-triggered backups land in an `emptyDir` and are lost when the pod restarts — rely on the CronJob. Managed databases should additionally have provider snapshots / PITR enabled.

Restore (custom-format dump):

```bash
# Kubernetes: scale the API down to stop writes
kubectl -n clinicplus scale deployment/clinicplus-api --replicas=0
aws s3 cp s3://<bucket>/backups/clinicplus-<timestamp>.dump .
pg_restore --clean --if-exists --no-owner --no-privileges -d "postgresql://USER:PASS@HOST:5432/clinicplus?sslmode=require" clinicplus-<timestamp>.dump
kubectl -n clinicplus scale deployment/clinicplus-api --replicas=3
```

Compose: `docker compose stop api`, restore the plain SQL dump from the `api_backups` volume with `psql` (or the in-app restore), `docker compose start api`. Run a restore drill into a scratch database at least quarterly.

---

## 6. Scaling notes

* The API is stateless (JWT + DB sessions; files in S3). Scale horizontally; HPA targets 70 % CPU (api 2–6, production 3–12; web 2–4/6).
* Background jobs (reminders, follow-ups, campaigns) and the boot-time role/permission sync run on every replica but take **Postgres advisory locks**, so only one replica executes a given run. `SCHEDULER_ENABLED=true` is safe with N replicas.
* Each API pod opens a Prisma connection pool (default `num_cpus*2+1`). Size Postgres `max_connections` for `maxReplicas × pool` + migrations/backups, or add `connection_limit=` to `DATABASE_URL`. If you put PgBouncer (transaction mode) in front, add `pgbouncer=true` and run migrations against the direct database URL.
* Uploads are capped by `MAX_UPLOAD_MB` (API) — keep nginx `CLIENT_MAX_BODY_SIZE` and the ingress `proxy-body-size` annotation at or above it (+ multipart overhead).
* `/health/ready` checks the database **and** object storage; an S3 outage takes API pods out of rotation.

---

## 7. Security model

Containers

* Non-root (api uid 1000, web uid 101, dev Postgres uid 70), read-only root filesystem, all Linux capabilities dropped, no privilege escalation, `RuntimeDefault` seccomp; writable paths are explicit `emptyDir`/volumes (`/tmp`, `/app/storage`, `/app/backups`, nginx `conf.d`). The same flags are applied in Compose (`read_only`, `cap_drop: [ALL]`, `no-new-privileges`).
* The namespace enforces Pod Security Admission **restricted** (`pod-security.kubernetes.io/enforce: restricted`).
* Images contain no secrets; runtime configuration only via env (ConfigMap + Secret).

Network (Kubernetes NetworkPolicies)

* `default-deny-all` for ingress and egress in the namespace, then allow only:
  ingress-nginx → web:8080; web → api:3000; api/migrate/backup (`clinicplus.io/db-client=true`) → Postgres:5432 (in-namespace pod in dev, database CIDR in staging/production); api/backup (`clinicplus.io/egress-https=true`) → TCP 443 anywhere except cloud metadata endpoints (S3, Stripe, Twilio, Sentry); all pods → kube-dns:53.
* Adjust if your ingress controller is not in namespace `ingress-nginx`, if DNS runs elsewhere (NodeLocal DNSCache → allow `169.254.20.10`), or if you run ClamAV in-cluster (allow api → clamav:3310).
* Kubelet health probes come from the node and are allowed by common CNIs (Calico, Cilium) regardless of these policies.

Kubernetes RBAC

* `clinicplus-app` (all workloads): **no Role or RoleBinding**, `automountServiceAccountToken: false` — a compromised pod gets no Kubernetes API credentials.
* `clinicplus-deployer` (CI): namespaced Role; create/update/patch workloads, Services, ConfigMaps, PVCs, Jobs/CronJobs, Ingresses, HPAs, PDBs, NetworkPolicies; delete only Jobs (migration re-run); read pods/logs/events. No Secrets, no exec/port-forward, no RBAC, nothing cluster-scoped (the Namespace is admin-applied; `deploy.sh` without `--admin` skips it).
* `clinicplus-support` (on-call group): read-only pods, logs, events, workloads, HPA, Ingress, NetworkPolicies. No Secrets, no exec.
* For the CI deployer prefer short-lived tokens (`kubectl create token clinicplus-deployer -n clinicplus --duration=1h`) or cloud OIDC federation over long-lived token Secrets.

Application edge

* nginx: CSP (`script-src 'self'`, no inline scripts — Vite emits external modules only), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS behind TLS, `server_tokens off`. Hashed assets cached for a year, `index.html` always revalidated.
* The API keeps helmet, CORS allow-list, throttling (real client IP via `set_real_ip_from` + `TRUST_PROXY`), and signature verification on Stripe/Twilio webhooks (raw body passes through nginx unchanged).

---

## 8. CI/CD

`.github/workflows/ci.yml` on every PR and push to `main`:

1. **Test & build** — `pnpm install --frozen-lockfile`, `prisma generate`, typecheck api + web, lint (**non-blocking**: the existing codebase has ~3,600 lint findings), unit tests, `prisma migrate deploy` + e2e tests against a `postgres:16` service (`clinicos_test`), build api + web.
2. **Validate deployment config** — renders every overlay (+ migrate + rbac) with `kubectl kustomize`, validates with `kubeconform -strict` against Kubernetes 1.30 schemas, `docker compose config` for all files/profiles, `shellcheck` on scripts.
3. **Images** — builds both images with Buildx + GitHub Actions cache on every run; on `main` pushes to `ghcr.io/<owner>/clinicplus-api|web` tagged with the full commit SHA and `latest`.

Deploying from CI: give the job a kubeconfig for the `clinicplus-deployer` ServiceAccount, set the SHA in `overlays/<env>/images`, run `sh deploy/k8s/deploy.sh <env>`.

---

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose up` → `required variable POSTGRES_PASSWORD/JWT_SECRET` | Fill them in `.env` (next to `docker-compose.yml`). |
| `migrate` exits non-zero | `docker compose logs migrate` / `kubectl -n clinicplus logs job/clinicplus-migrate`. `P1001` = DB unreachable (NetworkPolicy CIDR, security group, `sslmode`); `P3009` = a previous migration failed → see §4.3. |
| API crash-loops with `Invalid environment configuration` | The message lists the bad keys. Common: weak `JWT_SECRET`, `API_PUBLIC_URL=""` (unset it instead), `PAYMENTS_PROVIDER=stripe` without both Stripe keys, `STORAGE_DRIVER=s3` without `S3_BUCKET`. |
| API `Cannot find module 'express'` | Fixed in the image via `NODE_PATH`; the proper fix is declaring `express` in `apps/api/package.json`. |
| Pods `CreateContainerConfigError` | Secret `clinicplus-secrets` missing in the namespace (`kubectl -n clinicplus get secret`). |
| Pods rejected: `violates PodSecurity "restricted"` | A patch removed a securityContext field; compare with `base/`. |
| API never Ready | `kubectl -n clinicplus describe pod`; `/health/ready` reports `database` / `storage` errors — check the DB NetworkPolicy CIDR, S3 bucket/credentials/IRSA, and the HTTPS egress policy. |
| 502/504 from the site | Web is up but the API is not: `kubectl -n clinicplus get endpoints clinicplus-api`; NetworkPolicy `web-allow-egress-to-api`. |
| 413 Request Entity Too Large | Raise ingress `proxy-body-size`, web `CLIENT_MAX_BODY_SIZE`, and `MAX_UPLOAD_MB` together. |
| Everyone shares one rate-limit bucket / login lockouts | `REAL_IP_FROM` does not cover the ingress/proxy IPs, or `TRUST_PROXY` is false. |
| Stripe webhook 400 "signature" | `STRIPE_WEBHOOK_SECRET` belongs to a different endpoint/mode (test vs live); URL must be `https://<host>/api/v1/webhooks/stripe`. |
| Twilio webhook 403 | `API_PUBLIC_URL` must exactly match the URL configured in Twilio (scheme + host). |
| Backup CronJob fails | `kubectl -n clinicplus logs job/<backup-job>`: `pg_dump` version mismatch (server ≠ 16 → rebuild with `--build-arg PG_MAJOR=<n>`), S3 `AccessDenied`, or MinIO rejecting SSE (`BACKUP_S3_SSE=""`). |
| Blank page / CSP errors in console | Add the blocked origin to `CSP_CONNECT_EXTRA` / `CSP_IMG_EXTRA` (e.g. Sentry ingest host). |
| nginx `host not found in upstream "api"` | API Service missing or `API_UPSTREAM` wrong (`http://clinicplus-api:3000` in K8s, `http://api:3000` in Compose). |
