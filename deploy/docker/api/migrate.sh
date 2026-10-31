#!/bin/sh
# One-shot migration entrypoint (compose `migrate` service, K8s migration Job).
# Applies pending Prisma migrations; never resets or drops data.
set -eu
echo "[migrate] applying pending migrations (prisma migrate deploy)"
prisma migrate deploy
echo "[migrate] done"
