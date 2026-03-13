#!/bin/bash
set -e

# Resolve any failed migrations so deploy can proceed.
# This handles the P3009 error when a previous migration attempt was interrupted.
FAILED=$(npx prisma migrate status 2>&1 | grep -oP 'The `\K[^`]+(?=` migration)' || true)

for migration in $FAILED; do
  echo "Resolving failed migration: $migration"
  npx prisma migrate resolve --rolled-back "$migration" || true
done

npx prisma migrate deploy
HOSTNAME=0.0.0.0 node .next/standalone/server.js
