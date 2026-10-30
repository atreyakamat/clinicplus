# syntax=docker/dockerfile:1.7
# -----------------------------------------------------------------------------
# ClinicPlus web image: Vite SPA served by unprivileged nginx (port 8080) which also
# reverse-proxies /api/* to the API. Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile -t clinicplus-web .
#
# Runtime env (rendered into the nginx config at container start via envsubst):
#   API_UPSTREAM          API base URL, no trailing slash   (default http://api:3000)
#   CLIENT_MAX_BODY_SIZE  max request body for /api          (default 25m; keep >= MAX_UPLOAD_MB)
#   CSP_CONNECT_EXTRA     extra CSP connect-src sources, e.g. https://o123.ingest.sentry.io
#   CSP_IMG_EXTRA         extra CSP img-src sources
#   REAL_IP_FROM          CIDR of the proxy/ingress in front of nginx (default 10.0.0.0/8)
# Build args:
#   VITE_SENTRY_DSN       browser Sentry DSN baked into the bundle (optional)
# -----------------------------------------------------------------------------
ARG NODE_VERSION=22
ARG DEBIAN_RELEASE=bookworm
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27-alpine

FROM node:${NODE_VERSION}-${DEBIAN_RELEASE}-slim AS base
ARG PNPM_VERSION=10.34.7
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_store_dir=/pnpm/store
RUN npm install -g corepack@0.32.0 \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate \
 && pnpm --version
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile

FROM deps AS build
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter "web..."
RUN pnpm --filter web build \
 && test -f apps/web/dist/index.html

FROM ${NGINX_IMAGE} AS runtime
LABEL org.opencontainers.image.title="clinicplus-web" \
      org.opencontainers.image.description="ClinicPlus web app (Vite SPA on nginx)" \
      org.opencontainers.image.source="https://github.com/atreyakamat/clinicplus"
# Defaults for the template variables. The image's entrypoint only substitutes variables
# that are defined, so every variable used in the template must have a default here.
ENV API_UPSTREAM=http://api:3000 \
    CLIENT_MAX_BODY_SIZE=25m \
    CSP_CONNECT_EXTRA="" \
    CSP_IMG_EXTRA="" \
    REAL_IP_FROM=10.0.0.0/8
# The template is rendered by /docker-entrypoint.d/20-envsubst-on-templates.sh into
# /etc/nginx/conf.d/default.conf (an emptyDir under readOnlyRootFilesystem in K8s).
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# nginx-unprivileged already runs as uid 101 and listens on 8080; pid/temp files go to /tmp.
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
