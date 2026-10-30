#!/bin/sh
# Runs the Prisma CLI that pnpm installed next to @prisma/client (same pinned version as the lockfile).
# Usage inside the API image:  prisma migrate deploy | prisma migrate status
set -eu
APP_DIR="${APP_DIR:-/app}"
CLI="$(node -e "const p=require('path');const c=require.resolve('@prisma/client/package.json',{paths:[process.argv[1]]});process.stdout.write(require.resolve('prisma/build/index.js',{paths:[p.dirname(c)]}))" "$APP_DIR")"
cd "$APP_DIR"
exec node "$CLI" "$@"
