#!/bin/sh
set -e

echo "[entrypoint] applying migrations..."
npx prisma migrate deploy

echo "[entrypoint] seeding (idempotent)..."
npx tsx prisma/seed.ts

echo "[entrypoint] starting server..."
exec node server.js
