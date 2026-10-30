#!/usr/bin/env sh
# -----------------------------------------------------------------------------
# Ordered ClinicPlus rollout to Kubernetes:
#   1. "pre" objects: ServiceAccount, ConfigMap, NetworkPolicies (+ dev: Secret, Postgres, MinIO)
#   2. database migration Job (prisma migrate deploy) — must succeed, else stop
#   3. everything else (Deployments roll with maxUnavailable=0)
#   4. wait for the rollouts
#
# Usage:  deploy/k8s/deploy.sh <dev|staging|production> [--admin]
#   --admin   also apply cluster-scoped objects (the Namespace). Needs cluster-admin;
#             the CI deployer ServiceAccount (deploy/k8s/rbac) runs without it.
# Requires kubectl >= 1.27 (built-in kustomize with components support).
# -----------------------------------------------------------------------------
set -eu

ENV_NAME="${1:-}"
ADMIN="${2:-}"
NS="${NAMESPACE:-clinicplus}"
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-900}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OVERLAY="$HERE/overlays/$ENV_NAME"

if [ -z "$ENV_NAME" ] || [ ! -d "$OVERLAY" ]; then
  echo "usage: $0 <dev|staging|production> [--admin]" >&2
  exit 2
fi
if [ "$ENV_NAME" = "dev" ] && [ ! -f "$OVERLAY/secrets.env" ]; then
  echo "missing $OVERLAY/secrets.env — cp secrets.env.example secrets.env and edit it" >&2
  exit 2
fi

if [ "$ADMIN" = "--admin" ]; then
  echo "==> [0/4] cluster-scoped objects (namespace)"
  kubectl apply -k "$OVERLAY" -l 'clinicplus.io/admin-only=true'
fi

echo "==> [1/4] service account, config, network policies"
kubectl apply -k "$OVERLAY" -l 'clinicplus.io/phase=pre,clinicplus.io/admin-only!=true'
if [ "$ENV_NAME" = "dev" ]; then
  kubectl -n "$NS" rollout status statefulset/clinicplus-postgres --timeout=5m
fi

echo "==> [2/4] database migration"
kubectl -n "$NS" delete job clinicplus-migrate --ignore-not-found --wait=true
kubectl apply -k "$OVERLAY/migrate"
elapsed=0
while :; do
  ok="$(kubectl -n "$NS" get job clinicplus-migrate -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
  failed="$(kubectl -n "$NS" get job clinicplus-migrate -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || true)"
  if [ "$ok" = "1" ]; then
    break
  fi
  if [ "$failed" = "True" ] || [ "$elapsed" -ge "$MIGRATE_TIMEOUT" ]; then
    echo "Migration failed or timed out — NOT rolling out. Logs:" >&2
    kubectl -n "$NS" logs job/clinicplus-migrate --tail=200 >&2 || true
    exit 1
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done
kubectl -n "$NS" logs job/clinicplus-migrate --tail=20 || true

echo "==> [3/4] application"
kubectl apply -k "$OVERLAY" -l 'clinicplus.io/admin-only!=true'

echo "==> [4/4] waiting for rollout"
kubectl -n "$NS" rollout status deployment/clinicplus-api --timeout=10m
kubectl -n "$NS" rollout status deployment/clinicplus-web --timeout=5m
echo "Done."
