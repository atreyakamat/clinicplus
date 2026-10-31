# syntax=docker/dockerfile:1.7
# -----------------------------------------------------------------------------
# ClinicPlus API image (NestJS + Prisma). Build from the REPO ROOT:
#   docker build -f apps/api/Dockerfile -t clinicplus-api .
#
# Targets:
#   runtime (default) - production image: node dist/main.js, non-root, tini PID 1,
#                       Prisma CLI available for `prisma migrate deploy`, pg_dump 16.
#   tools             - full api workspace incl. dev deps (ts-node, faker) for one-off
#                       demo seeding:  docker build --target tools ...   (never production)
#
# Commands in the runtime image:
#   (default)                      node dist/main.js
#   migrate                        apply pending migrations (prisma migrate deploy) and exit
#   prisma migrate status          inspect migration state
# -----------------------------------------------------------------------------
ARG NODE_VERSION=22
ARG DEBIAN_RELEASE=bookworm

# ---------- base: node + pnpm (pinned via corepack) --------------------------
FROM node:${NODE_VERSION}-${DEBIAN_RELEASE}-slim AS base
ARG PNPM_VERSION=10.34.7
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    npm_config_store_dir=/pnpm/store
# openssl lets Prisma detect the debian-openssl-3.0.x engine target (default "native"
# binaryTarget, so schema.prisma needs no binaryTargets change).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g corepack@0.32.0 \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate \
 && pnpm --version
WORKDIR /repo

# ---------- deps: download every package in the lockfile into the store ------
# Only the lockfile is copied, so this layer stays cached until dependencies change.
# The store lives in the layer (not a BuildKit cache mount) so a cached layer is always
# usable by the --offline install below, also on fresh CI runners restoring layer cache.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile

# ---------- build: install (offline), generate client, compile, prune --------
FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter "api..."
RUN pnpm --filter api exec prisma generate \
 && pnpm --filter api build \
 && test -f apps/api/dist/main.js
# Production-only node_modules for the api package (no dev deps, real copies).
# pnpm 10 needs inject-workspace-packages for the lockfile-based (non-legacy) deploy.
RUN pnpm --filter api deploy --prod --prefer-offline --config.inject-workspace-packages=true /out
COPY deploy/docker/api/prisma.sh /usr/local/bin/prisma
COPY deploy/docker/api/migrate.sh /usr/local/bin/migrate
# @prisma/client in /out still holds the default stub, so generate the real client there.
# The prisma CLI is present in /out because pnpm installs it as @prisma/client's peer
# (same version as the lockfile), which is also what `prisma migrate deploy` uses at runtime.
RUN sed -i 's/\r$//' /usr/local/bin/prisma /usr/local/bin/migrate \
 && chmod 0755 /usr/local/bin/prisma /usr/local/bin/migrate \
 && APP_DIR=/out prisma generate --schema /out/prisma/schema.prisma \
 && test -f /out/dist/main.js \
 && rm -rf /out/src /out/test /out/coverage /out/backups /out/storage \
           /out/*.txt /out/*.log /out/.env /out/.env.* /out/Dockerfile

# ---------- tools: dev image for demo seeding (not for production) -----------
FROM build AS tools
WORKDIR /repo/apps/api
ENV NODE_ENV=development
CMD ["pnpm", "seed:demo"]

# ---------- runtime -----------------------------------------------------------
FROM node:${NODE_VERSION}-${DEBIAN_RELEASE}-slim AS runtime
ARG DEBIAN_RELEASE=bookworm
ARG PG_MAJOR=16
LABEL org.opencontainers.image.title="clinicplus-api" \
      org.opencontainers.image.description="ClinicPlus API (NestJS + Prisma)" \
      org.opencontainers.image.source="https://github.com/atreyakamat/clinicplus"

# tini: proper PID 1 (signal forwarding + zombie reaping for pg_dump child processes).
# postgresql-client-${PG_MAJOR} from the PostgreSQL apt repo: pg_dump must match the server major.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates openssl tini curl; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${DEBIAN_RELEASE}-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-${PG_MAJOR}; \
    apt-get purge -y --auto-remove curl; \
    rm -rf /var/lib/apt/lists/*; \
    pg_dump --version

# NODE_PATH is a safety net: it lets modules that are only transitive deps (e.g. `express`,
# imported by src/app.setup.ts but not declared in apps/api/package.json) resolve from
# pnpm's hoisted store. Remove once every runtime import is a declared dependency.
ENV NODE_ENV=production \
    PORT=3000 \
    APP_DIR=/app \
    HOME=/tmp \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    UPLOAD_DIR=/app/storage/uploads \
    BACKUP_DIR=/app/backups \
    NODE_PATH=/app/node_modules/.pnpm/node_modules

WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/prisma ./prisma
COPY --from=build /usr/local/bin/prisma /usr/local/bin/migrate /usr/local/bin/
COPY deploy/docker/api/healthcheck.js deploy/docker/api/backup.js /usr/local/lib/clinicplus/

# Code stays root-owned (read-only for the app user); only the data dirs are writable.
# BackupService writes to process.cwd()/backups (= /app/backups); BACKUP_DIR points there too.
# Mount persistent volumes at /app/storage (uploads) and /app/backups (pg_dump files).
RUN mkdir -p /app/storage/uploads /app/backups \
 && chown -R node:node /app/storage /app/backups

# uid/gid 1000 ("node" in the base image) — K8s runAsUser/fsGroup use 1000.
USER 1000:1000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "/usr/local/lib/clinicplus/healthcheck.js"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
