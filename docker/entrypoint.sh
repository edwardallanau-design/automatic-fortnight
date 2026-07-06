#!/bin/sh
set -e

echo "[entrypoint] applying migrations..."
npx prisma migrate deploy

# The seed is intentionally run on EVERY boot, not just when the DB is empty.
# It is fully idempotent (credential/table upserts, menu find-or-create keyed on
# natural keys), so re-running is safe. This also makes the seeded staff/admin
# credentials declarative: each boot re-applies the passwords from the container
# env. Do NOT add an "empty-DB guard" here — that would silently break that
# behavior (an earlier design doc described a guard; this supersedes it).
echo "[entrypoint] seeding (idempotent)..."
npx tsx prisma/seed.ts

echo "[entrypoint] starting server..."
exec node server.js
