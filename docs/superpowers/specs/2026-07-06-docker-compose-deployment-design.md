# Dockerize App + DB with Compose — Design

**Status.** Approved for implementation.
**Epic.** Infrastructure / deployment tooling (not a numbered product story).
**Related docs.** `04-architecture.md` (ADR-002 self-contained deploy preference), `BUILD_STATUS.md` gotchas (the two-Postgres-on-5432 fight, Prisma 7 driver-adapter requirement).

---

## Context

The app currently has no containerization. It runs via host `npm run dev` against a native Windows Postgres on `127.0.0.1:5432`. The user juggles multiple local projects that all default to port 3000 (app) and 5432 (Postgres), causing address collisions — the two-Postgres-on-5432 fight is already logged as a project gotcha.

This change puts the whole stack (Postgres + a production build of the Next.js app) into Docker Compose on ports unique to this project (app → host **3001**, DB → host **5433**), so `docker compose up` runs the project in isolation with no port fight. It is structured to make a real deployment a small next step (production-style build, standalone output, non-root runtime), per the user's "local now, deploy later" intent.

The host `npm run dev` + `.env.local` workflow stays fully intact — Docker is an additional isolated way to run the project, not a replacement for the native dev loop.

## Decisions

- **Production-style build in the container, not dev-mode.** The app container runs `next build` + the standalone server, not `next dev`. Rationale: matches the deploy-later goal directly, gives clean port isolation, and avoids Windows in-container file-watch pain. Active coding still uses host `npm run dev`; Compose is for a clean isolated run and as the deployment foundation.
- **`output: 'standalone'` in `next.config.ts`.** Required for a small self-contained runner image (Next copies only the needed `node_modules` into `.next/standalone`). This is the single application-source change; it is inert for host `npm run dev`, so the native workflow is unaffected.
- **Multi-stage Dockerfile (deps → build → runner) on `node:24-slim`.** Matches the project's Node 24 (`.nvmrc` = v24.14.1). bcrypt is a native module: the **deps** and **build** stages install `python3 make g++` so bcrypt compiles; the **runner** stage carries the already-built native binary, so it needs no build tools. Runner runs as a non-root user.
- **Entrypoint script runs migrate + conditional seed, then starts the server.** On container start: `prisma migrate deploy` (idempotent — safe every boot), then run the seed **only if the DB has no data** (guard on an existing-row check so re-ups don't error or duplicate), then exec the standalone server. One `docker compose up` brings up a working, seeded app.
- **Seed runs in-image (bcrypt compiled).** The existing seed (staff/admin credentials, tables 1–3, menu items) runs in-container so a fresh `compose up` yields a usable app with login creds and demo data. This is why the build stage includes bcrypt's build toolchain.
- **Separate Docker env file, host `.env.local` untouched.** A new gitignored `.env.docker` holds Compose-time values (`DATABASE_URL` in db-hostname form, `AUTH_SECRET`, `SEED_STAFF_PASSWORD`, `SEED_ADMIN_PASSWORD`); Compose loads it via `env_file`. A committed `.env.docker.example` documents the keys. `.env.local` (host, `127.0.0.1:5432`) is never read by Compose and keeps working for `npm run dev`.
- **Conditional dotenv load in `prisma.config.ts` and `prisma/seed.ts`.** Both currently call `loadEnv({ path: '.env.local' })` unconditionally. In a container that file does not exist, and Compose-injected env vars already carry the values (dotenv does not override already-set vars, so behavior is correct either way — but the missing file logs noise). Change both to load `.env.local` **only if it exists**, so the container path is clean and the host path is unchanged.
- **Ports:** host **3001 → container 3000** (app), host **5433 → container 5432** (Postgres). Chosen to sidestep the default 3000/5432 that other projects grab.
- **Postgres 17, named volume, healthcheck.** DB persists across `compose down`/`up` via a named volume; the app waits on a `pg_isready` healthcheck (`depends_on: condition: service_healthy`) so migrations never race an unready DB.

## Components

1. **`next.config.ts` (modify).** Add `output: 'standalone'` to the config object. No other change.

2. **`prisma.config.ts` (modify).** Wrap `loadEnv({ path: '.env.local' })` so it only loads when the file exists (e.g. `existsSync('.env.local')`). Datasource/migrations/seed config unchanged.

3. **`prisma/seed.ts` (modify).** Same conditional-load wrap for `loadEnv({ path: '.env.local' })`. Seed logic itself unchanged. Confirm the seed is idempotent enough to be guarded by an "empty DB?" check in the entrypoint (it already uses `upsert` for tables/credentials — verify menu items too during implementation; if menu seeding is not upsert-based, the entrypoint's empty-DB guard is what prevents duplicate inserts on re-up).

4. **`Dockerfile` (create).** Multi-stage:
   - `deps`: `node:24-slim`, install `python3 make g++`, `COPY package*.json`, `npm ci`.
   - `build`: from deps, `COPY` source, `npx prisma generate`, `npm run build`.
   - `runner`: `node:24-slim`, non-root user, `COPY` `.next/standalone`, `.next/static`, `public`, the generated Prisma client/engine, `prisma/` (schema + migrations + seed), and the tsx-capable bits needed to run the seed. `COPY` the entrypoint script; `ENTRYPOINT` runs it; it ends by exec-ing the standalone server (`node server.js`) on port 3000.

5. **`docker/entrypoint.sh` (create).** `set -e`; run `npx prisma migrate deploy`; run an empty-DB check and seed if empty; `exec node server.js`. Reads `DATABASE_URL` and `SEED_*` from the container environment (provided by Compose).

6. **`docker-compose.yml` (create).**
   - `db`: `postgres:17`, `environment` (POSTGRES_USER/PASSWORD/DB), named volume `dbdata:/var/lib/postgresql/data`, `healthcheck` using `pg_isready`, `ports: "5433:5432"`.
   - `app`: `build: .`, `env_file: .env.docker`, `depends_on: db: condition: service_healthy`, `ports: "3001:3000"`.
   - `volumes: dbdata:`.

7. **`.dockerignore` (create).** Exclude `node_modules`, `.next`, `.git`, `.env*` (so no host secrets/artifacts enter the build context), `docs`, test/scratch dirs.

8. **`.env.docker.example` (create) + `.env.docker` (create, gitignored).** Document/hold Compose-time env: `DATABASE_URL=postgresql://postgres:<pw>@db:5432/digitalmenu?schema=public`, `AUTH_SECRET`, `SEED_STAFF_PASSWORD`, `SEED_ADMIN_PASSWORD`, plus the `POSTGRES_*` values the `db` service uses. Add `.env.docker` to `.gitignore`.

## Data flow (container startup)

```
docker compose up --build
   │
   ├─ db service starts → healthcheck pg_isready loops until ready
   │
   └─ app service (waits for db healthy)
         │
         entrypoint.sh:
           prisma migrate deploy      (idempotent; applies prisma/migrations)
           if DB empty → run seed      (tsx prisma/seed.ts; creds + tables + menu)
           exec node server.js         (Next standalone, listens :3000)
         │
   host: app on :3001, Postgres on :5433
```

## Error / edge handling

| Scenario | Handling |
|---|---|
| DB not ready when app starts | `depends_on: service_healthy` + `pg_isready` healthcheck gate the app until Postgres accepts connections |
| `compose up` run a second time (existing data) | `migrate deploy` is a no-op if no new migrations; empty-DB guard skips seeding → no duplicate rows, no error |
| `.env.local` absent in container | Conditional `loadEnv` skips it; Compose-injected env supplies all values |
| bcrypt native build | build tools present in deps/build stages; runner reuses the compiled binary |
| Host secrets leaking into image | `.dockerignore` excludes all `.env*` and `.git` |
| Port 3000/5432 still taken by another project | Host binds 3001/5433 instead; container-internal ports stay 3000/5432 |

## Testing / verification

This is infrastructure; verification is operational, not unit tests (no app logic changes to unit-test beyond confirming the existing suite still passes).

- `npm run test` still green after the `next.config.ts` / dotenv edits (no behavior change expected).
- `docker compose up --build`: db becomes healthy; app logs show `migrate deploy` then seed then server start; no dotenv "file not found" noise.
- `curl -f http://localhost:3001` returns 200; `http://localhost:3001/order/test` renders; login works with the seeded admin credential.
- `psql`/`pg_isready` against `localhost:5433` succeeds; native `5432` Postgres (if running) is untouched — no collision.
- `docker compose down` then `up` again: data persists (named volume), seed does not duplicate, app comes back up.
- Sanity: host `npm run dev` against `.env.local` still works unchanged.

## Scope boundary (do NOT touch)

- No app logic, route, component, or Prisma **schema** changes. (Migrations are applied, not authored.)
- No change to `.env.local` or the host dev workflow.
- Only these files change: `next.config.ts` (+1 line), `prisma.config.ts` + `prisma/seed.ts` (conditional dotenv), `.gitignore` (add `.env.docker`). New files: `Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml`, `.dockerignore`, `.env.docker`, `.env.docker.example`.

## Acceptance criteria

- [ ] `docker compose up --build` starts Postgres + the app; app reachable at `http://localhost:3001`, Postgres at `localhost:5433`.
- [ ] On first up, migrations apply and the DB is seeded (admin login works, tables 1–3 + menu present).
- [ ] Re-running `compose up` after `down` preserves data and does not duplicate seed rows or error.
- [ ] No `.env.local` "not found" noise in container logs; Compose env drives the container.
- [ ] Host `npm run dev` + `.env.local` still works exactly as before; native 5432 Postgres is not disturbed.
- [ ] The image contains no host `.env*` files or `.git` (verified via `.dockerignore`).
- [ ] Existing test suite still passes after the source edits.
