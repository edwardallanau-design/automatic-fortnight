# Production Deployment — Design

**Status.** Approved, ready for planning.
**Related.** `BUILD_STATUS.md` Deployment checklist · `04-architecture.md` ADR-002 · `06b-engineering-decisions.md` §1 · `ISSUES.md` ISSUE-6, ISSUE-7

## Context

All MVP stories (1–8, plus post-epic stories 9, 10, 10a) are Done. The core loop (menu → order → confirm → pay) is built and verified locally via Docker Compose. Nothing has been deployed to production yet — `BUILD_STATUS.md`'s Deployment section is still all unchecked.

The architecture docs already committed to a production target: Vercel (app hosting) + Neon (managed Postgres), no containers (ADR-002, `06b` §1). Docker Compose was explicitly built as the local dev/test loop, not the deployment vehicle (`BUILD_STATUS.md` gotchas log, 2026-07-08 entry). This design executes that existing decision rather than revisiting it.

Two previously-deferred issues become live now: `ISSUE-6` (seed reruns on every boot, reverting rotated passwords — accepted as intentional/declarative) and `ISSUE-7` (secrets as plaintext env vars — flagged "harden before any real deployment," specifically calling out rotating `AUTH_SECRET`).

## Scope

**In scope:**
- Neon Postgres project + pooled connection string
- Vercel project linked to the GitHub repo
- Production + Preview environment variables, using fresh production secrets (not the dev/Docker ones)
- A build-step change so migrations and seeding run automatically on every Vercel deploy, replacing the role `docker/entrypoint.sh` plays locally
- Verifying the deployed app end-to-end and checking off `BUILD_STATUS.md`'s Deployment items

**Out of scope (deliberately deferred, not silently dropped):**
- Custom domain — launching on the default `*.vercel.app` subdomain; attaching a domain later doesn't require a redeploy
- Neon branching for isolated preview databases — previews will share the production Neon DB for now
- Monitoring/alerting beyond Vercel's built-in dashboard/logs — no NFR in `01-intent-and-constraints.md` calls for more
- Replacing `prisma/seed.ts`'s demo coffee-shop menu with a real pilot restaurant's menu — no pilot is confirmed yet (`BUILD_STATUS.md` open risk); the demo data will appear in production on first deploy and can be edited/replaced later via the already-built Admin menu management UI (Story 3)

## Design

### 1. Neon setup

- Create a Neon project (any region — no live traffic to optimize for yet).
- Use the **pooled connection string** (PgBouncer endpoint, hostname contains `-pooler`) for `DATABASE_URL`, not the direct connection string.
  - **Why:** `lib/prisma.ts` creates one `PrismaPg`-adapter connection pool per warm serverless function instance. Vercel can run multiple concurrent instances under load; each holding its own pool against a direct Postgres connection risks exhausting Neon's connection limit. The pooled endpoint is the standard mitigation and costs nothing extra to configure correctly up front.

### 2. Vercel project setup

- Import the GitHub repo as a new Vercel project. Framework auto-detects as Next.js; root directory is the repo root.
- Environment variables, set for **both Production and Preview** (previews intentionally share the prod DB — see Decision 4 below):
  - `DATABASE_URL` — the Neon pooled connection string
  - `AUTH_SECRET` — a newly generated random value, distinct from the one in `.env.docker`/`.env.local`. Closes `ISSUE-7`'s outstanding "rotate `AUTH_SECRET`" note.
  - `SEED_STAFF_PASSWORD`, `SEED_ADMIN_PASSWORD` — real production login credentials, chosen by the project owner (not reused dev/Docker values).
  - `ENABLE_TEST_PICKER` — left **unset** in both environments, keeping `/order/test` (the dev table picker) hidden in production. Already correctly gated by `NODE_ENV` + this flag in `app/order/test/page.tsx` — no code change needed.
- `NODE_ENV` is managed by Vercel automatically. `app/api/auth/login/route.ts` already gates the session cookie's `secure` flag on `NODE_ENV === 'production'`, so cookies are correctly HTTPS-only in production with no code change.

### 3. Build pipeline: migrations + seeding on deploy

Vercel has no persistent container boot, so `docker/entrypoint.sh` (migrate → seed → start server) doesn't apply directly. The equivalent moment is the **build step**, which runs on every deploy.

Add a `vercel-build` script to `package.json` — Vercel runs this instead of the default `build` script when present:

```json
"vercel-build": "prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build"
```

This preserves the exact behavior `docker/entrypoint.sh` already documents and `ISSUE-6` accepted as intentional: the seed reruns on every deploy and is idempotent, re-applying `SEED_STAFF_PASSWORD`/`SEED_ADMIN_PASSWORD` from the environment declaratively each time.

**Consequence to flag explicitly:** because previews share the production Neon DB (Decision 4), every deploy — production or preview — runs migrations and seeding against production data. Given the standing stop-rule that additive migrations are fine to proceed with, and the seed's existing idempotency, this is consistent with the project's current MVP dial, but it is a real change from "only prod deploys touch prod data."

### 4. Decision: previews share the production database

Considered three options: (a) share the prod DB across Preview and Production environments, (b) configure `DATABASE_URL` for Production only and let preview builds fail, (c) use Neon's native Vercel integration to auto-provision an isolated DB branch per preview deployment.

**Chosen: (a), share the prod DB.** Lowest setup cost today, and the project's seed/migration design is already built around idempotency and "additive migrations are fine" — sharing doesn't introduce a new class of risk so much as extend an already-accepted one. Revisit with Neon branching once a pilot is live and production data actually needs protecting from preview-build noise.

## Rollout checklist

Maps onto `BUILD_STATUS.md`'s existing Deployment section.

| Step | Owner |
|---|---|
| Create Neon project, copy pooled `DATABASE_URL` | Project owner (Neon dashboard) |
| Create Vercel project, link GitHub repo | Project owner (Vercel dashboard) |
| Set Vercel env vars (`DATABASE_URL`, `AUTH_SECRET`, `SEED_STAFF_PASSWORD`, `SEED_ADMIN_PASSWORD`) for Production + Preview | Project owner, or Claude via `vercel` CLI if authenticated |
| Add `vercel-build` script to `package.json` | Claude (code change) |
| Trigger first deploy | Automatic on push to `main` once linked |
| Verify build logs show successful `migrate deploy` + seed | Both |
| Smoke test production URL: admin login → menu shows → place order → staff dashboard receives it → confirm → mark paid | Both |
| Confirm `/order/test` is inaccessible in production | Both |
| Check off `BUILD_STATUS.md`'s three Deployment checklist boxes | Claude |

Account-level actions (creating the Neon project, the Vercel project) are left to the project owner rather than driven by Claude via Bash — these are dashboard actions on services Claude has no credentials for by default. If the owner wants Claude to drive Vercel/Neon CLI tooling instead, those tools need to be authenticated in this environment first — a decision for the implementation plan, not this design.

## Risks / open questions carried forward, not blocking

- No pilot restaurant is confirmed yet (`BUILD_STATUS.md` open risk) — this deployment produces a live, usable skeleton, not a validated pilot. The kill criteria in `01-intent-and-constraints.md` remain unmeasurable until a pilot starts.
- The demo menu/table seed data will be visible in production until manually replaced via the Admin UI.
