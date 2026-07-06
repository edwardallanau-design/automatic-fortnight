# Dockerize App + DB with Compose — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the whole stack (Postgres 17 + a production Next.js standalone build) via `docker compose up` on project-unique host ports (app 3001, DB 5433), without disturbing the host `npm run dev` / `.env.local` workflow, and structured so a real deployment is a small next step.

**Architecture:** One source-config change (`output: 'standalone'`) plus a conditional-dotenv tweak in two Prisma files, then new Docker artifacts: a multi-stage Dockerfile (deps → build → runner on `node:24-slim`), an entrypoint that runs `prisma migrate deploy` + the (idempotent) seed then execs the standalone server, a `docker-compose.yml` wiring Postgres + app with a healthcheck gate, and `.dockerignore` + Docker env files.

**Tech Stack:** Docker, Docker Compose, `node:24-slim`, `postgres:17`, Next.js 16 standalone output, Prisma 7 (pg driver adapter), bcrypt (native module).

## Global Constraints

- **Node base image:** `node:24-slim` (matches `.nvmrc` v24.14.1).
- **Postgres:** `postgres:17`.
- **Host ports:** app `3001:3000`, DB `5433:5432`. Container-internal ports stay 3000 / 5432.
- **bcrypt is native:** the `deps` and `build` stages MUST install `python3 make g++` so bcrypt compiles; the `runner` stage must NOT need them (reuses the compiled binary via copied `node_modules`).
- **The seed is already fully idempotent** (credentials `upsert`, tables `upsert`, menu items find-or-update-or-create in `prisma/seed.ts:62-89`), so the entrypoint runs it unconditionally every boot — no empty-DB guard needed.
- **Do not disturb the host workflow:** `.env.local` is never read by Compose; `npm run dev` must keep working. The `output: 'standalone'` and conditional-dotenv edits are inert for host dev.
- **No image secret leakage:** `.dockerignore` must exclude all `.env*` and `.git`.
- **`.gitignore` already ignores `.env*` (line 36) with `!.env.example` as the only exception.** So `.env.docker` is already ignored (do NOT add a line for it); `.env.docker.example` must be un-ignored with a new `!.env.docker.example` exception so it can be committed.
- **Scope:** only these existing files change — `next.config.ts`, `prisma.config.ts`, `prisma/seed.ts`, `.gitignore`. No app logic, route, component, or Prisma **schema** change.

---

### Task 1: Source config — standalone output + container-safe dotenv

**Files:**
- Modify: `next.config.ts`
- Modify: `prisma.config.ts`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces: a Next build that emits `.next/standalone/server.js` (consumed by the Dockerfile runner in Task 2); Prisma config + seed that load `.env.local` only when present (so the container, which has no `.env.local`, runs clean).

- [ ] **Step 1: Add standalone output to `next.config.ts`**

Replace the file contents with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Make the dotenv load conditional in `prisma.config.ts`**

The current file calls `loadEnv({ path: '.env.local' })` unconditionally. Change it to only load when the file exists. Replace the top of the file so it reads:

```ts
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

if (existsSync('.env.local')) {
  loadEnv({ path: '.env.local' })
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
```

- [ ] **Step 3: Make the dotenv load conditional in `prisma/seed.ts`**

At the top of `prisma/seed.ts`, replace the unconditional `loadEnv({ path: '.env.local' })` (currently line 6) with a guarded version. The imports block plus the load should read:

```ts
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'

if (existsSync('.env.local')) {
  loadEnv({ path: '.env.local' })
}
```

Leave everything below (adapter, `requireEnv`, `SEED_*`, `main()`) unchanged.

- [ ] **Step 4: Verify the host workflow is unaffected — typecheck + tests still pass**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc clean; the full Vitest suite passes (same count as before — these edits change no runtime behavior on the host, where `.env.local` still exists and is still loaded).

- [ ] **Step 5: Verify a production build succeeds and emits standalone output**

Run: `npm run build`
Expected: build completes; the directory `.next/standalone/` now exists and contains `server.js`. Confirm with: `test -f .next/standalone/server.js && echo STANDALONE_OK`

- [ ] **Step 6: Commit**

```bash
git add next.config.ts prisma.config.ts prisma/seed.ts
git commit -m "chore: standalone output + container-safe dotenv for docker"
```

---

### Task 2: Dockerfile, entrypoint, and .dockerignore

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `docker/entrypoint.sh`

**Interfaces:**
- Consumes: `.next/standalone/server.js` from Task 1's build; the idempotent `prisma/seed.ts`; `DATABASE_URL` + `SEED_*` env vars (provided at run time by Compose in Task 3).
- Produces: an image whose `ENTRYPOINT` runs `docker/entrypoint.sh`, which runs `prisma migrate deploy`, then the seed, then execs `node server.js` on port 3000. Consumed by the `app` service in Task 3.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
.next
.git
.gitignore
.env*
docs
*.md
.superpowers
.vscode
npm-debug.log*
Dockerfile
docker-compose.yml
.dockerignore
```

(Excludes host `node_modules`/`.next` so the build is clean and platform-correct, all `.env*` and `.git` so no host secrets/history enter the image, and docs/scratch to keep the context small.)

- [ ] **Step 2: Create `docker/entrypoint.sh`**

```sh
#!/bin/sh
set -e

echo "[entrypoint] applying migrations..."
npx prisma migrate deploy

echo "[entrypoint] seeding (idempotent)..."
npx tsx prisma/seed.ts

echo "[entrypoint] starting server..."
exec node server.js
```

Note: the seed is safe to run every boot (all operations are upsert / find-or-create). `migrate deploy` is a no-op when there are no pending migrations.

- [ ] **Step 3: Create the multi-stage `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# ---- deps: install node modules (bcrypt needs a build toolchain) ----
FROM node:24-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: generate prisma client + next standalone build ----
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: minimal image that serves the standalone build ----
FROM node:24-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# non-root user
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# standalone server + static assets + public dir
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# prisma schema/migrations/seed + full node_modules (for migrate/seed/tsx/bcrypt)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
```

Rationale for copying full `node_modules` into the runner: the entrypoint needs `prisma` (migrate), `tsx` (seed), `@prisma/client` + `@prisma/adapter-pg` + `bcrypt` (seed runtime). The Next standalone bundle alone does not include these dev/CLI deps. This trades a larger image for a working migrate+seed step — acceptable for this local/deploy-later goal.

- [ ] **Step 4: Build the image to verify it compiles (bcrypt + prisma generate + next build all succeed in-container)**

Run: `docker build -t digitalmenu-app .`
Expected: build completes through all three stages with no error. The most likely failure points and what they'd mean:
- bcrypt compile error in `deps` → the `python3 make g++` line is missing/wrong.
- `prisma generate` error about OpenSSL → the `openssl` package line is missing in that stage.
- `next build` fails to find standalone → Task 1's `output: "standalone"` didn't land.

Confirm the image exists: `docker image inspect digitalmenu-app >/dev/null && echo IMAGE_OK`

- [ ] **Step 5: Commit**

```bash
git add .dockerignore Dockerfile docker/entrypoint.sh
git commit -m "feat: multi-stage Dockerfile + entrypoint for app image"
```

---

### Task 3: Compose stack + env files + end-to-end verification

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.docker.example`
- Create: `.env.docker` (gitignored — created locally, not committed)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the image built by the Dockerfile (Task 2) and its entrypoint contract (migrate → seed → serve on 3000).
- Produces: a running stack — app on host 3001, Postgres on host 5433.

- [ ] **Step 1: Un-ignore `.env.docker.example` in `.gitignore`**

`.gitignore` line 36 is `.env*` with `!.env.example` right after it. Add a second exception so the Docker example can be committed while `.env.docker` (real secrets) stays ignored. After the existing `!.env.example` line, add:

```
!.env.docker.example
```

Do NOT add any line for `.env.docker` — it is already ignored by `.env*`.

- [ ] **Step 2: Create `.env.docker.example` (committed template)**

```
# Copy to .env.docker and fill in. Compose loads .env.docker via env_file.
# DATABASE_URL uses the compose service hostname "db", not localhost.
DATABASE_URL=postgresql://postgres:postgres@db:5432/digitalmenu?schema=public

# Postgres service credentials (must match the DATABASE_URL above)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=digitalmenu

# App secrets
AUTH_SECRET=replace-with-a-long-random-string
SEED_STAFF_PASSWORD=replace-me-staff
SEED_ADMIN_PASSWORD=replace-me-admin
```

- [ ] **Step 3: Create the local `.env.docker` (not committed)**

Copy the example and set real values:

```bash
cp .env.docker.example .env.docker
```

Then edit `.env.docker` to set a real `AUTH_SECRET` (e.g. `openssl rand -base64 32`) and real seed passwords. Keep `POSTGRES_*` and the `DATABASE_URL` password consistent with each other.

- [ ] **Step 4: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:17
    restart: unless-stopped
    env_file: .env.docker
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5433:5432"
    volumes:
      - dbdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build: .
    restart: unless-stopped
    env_file: .env.docker
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "3001:3000"

volumes:
  dbdata:
```

- [ ] **Step 5: Bring the stack up and verify end-to-end**

Run: `docker compose up --build -d`
Then verify (allow ~15–30s for build + migrate + seed on first run):

```bash
# app healthy on 3001
curl -fsS -o /dev/null -w "app: %{http_code}\n" http://localhost:3001
# the test-table picker route renders
curl -fsS -o /dev/null -w "picker: %{http_code}\n" http://localhost:3001/order/test
# postgres reachable on 5433 (from the db container)
docker compose exec db pg_isready -U postgres -d digitalmenu
# entrypoint ran migrate + seed cleanly (no ".env.local not found" noise)
docker compose logs app | grep -E "\[entrypoint\]|Seeded"
```

Expected: `app: 200`, `picker: 200`, `pg_isready` reports "accepting connections", logs show the entrypoint's migrate/seed lines and `Seeded credentials/tables/menu items`, and NO dotenv "file not found" error.

- [ ] **Step 6: Verify persistence + seed idempotency across a restart**

```bash
docker compose down          # keeps the named volume
docker compose up -d         # no --build; reuses image
sleep 20
curl -fsS -o /dev/null -w "app after restart: %{http_code}\n" http://localhost:3001
# menu items should NOT be duplicated — count stays at the seed count
docker compose exec db psql -U postgres -d digitalmenu -c "SELECT count(*) FROM \"MenuItem\";"
```

Expected: `app after restart: 200`; the `MenuItem` count equals the seed's item count (not doubled) — proving the idempotent seed + persistent volume both work.

- [ ] **Step 7: Confirm the host dev workflow still works**

Run: `npm run dev` (host), then `curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200` — the native workflow on port 3000 against `.env.local` / native Postgres is untouched by any of the Docker work. Stop it after confirming.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml .env.docker.example .gitignore
git commit -m "feat: docker-compose stack (app 3001, postgres 5433)"
```

(Note: `.env.docker` is intentionally NOT staged — it holds real secrets and is gitignored.)

## Spec Coverage Check

- "`docker compose up --build` starts Postgres + app; app on 3001, DB on 5433" → Task 3, Steps 4–5.
- "First up applies migrations + seeds (admin login, tables 1–3, menu)" → Task 2 entrypoint + Task 3 Step 5 log check.
- "Re-up preserves data, no duplicate seed / error" → Task 3 Step 6 (and the confirmed-idempotent seed; Global Constraints).
- "No `.env.local` not-found noise; Compose env drives container" → Task 1 conditional dotenv + Task 3 Step 5 log grep.
- "Host `npm run dev` + `.env.local` still works; native 5432 undisturbed" → Task 1 Step 4 + Task 3 Step 7.
- "Image has no host `.env*` or `.git`" → Task 2 `.dockerignore`.
- "Existing suite still passes after edits" → Task 1 Step 4.
- "`output: 'standalone'`, multi-stage Dockerfile, non-root runner, healthcheck gate" → Task 1 Step 1, Task 2 Step 3, Task 3 Step 4.

## Notes on deviations from the spec (intentional, decided during planning)

1. **Seed runs unconditionally, no empty-DB guard.** The spec proposed an "if DB empty" guard because it wasn't yet confirmed the menu seed was idempotent. On inspection (`prisma/seed.ts:81-88`) menu items use find-then-update-or-create, so the whole seed is idempotent and the guard is unnecessary complexity. Removed per YAGNI.
2. **`.gitignore` handling corrected.** The repo already ignores `.env*` (line 36), so `.env.docker` needs no new ignore line; only a `!.env.docker.example` un-ignore exception is added. The spec's wording ("add `.env.docker` to `.gitignore`") would have been redundant/misleading.
```
