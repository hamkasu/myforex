#!/bin/bash
set -e

# Mark the known failed migration as rolled-back so migrate deploy can re-apply it.
# Safe to run repeatedly: no-ops if the migration is not in a failed state.
echo "==> Resolving any failed migrations..."
npx prisma migrate resolve --rolled-back "0001_init" 2>&1 || true

echo "==> Running migrations..."
npx prisma migrate deploy

echo "==> Starting server..."
HOSTNAME=0.0.0.0 exec node .next/standalone/server.js
