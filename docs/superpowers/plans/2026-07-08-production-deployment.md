# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the digitalmenu app running in production on Vercel + Neon Postgres for the first time, closing out `BUILD_STATUS.md`'s Deployment checklist.

**Architecture:** No new application code. One `package.json` script addition (`vercel-build`) so migrations + seeding run at Vercel build time instead of at Docker container boot. Everything else is account-level setup (Neon project, Vercel project, environment variables) that only the project owner can perform, since Claude has no credentials for those dashboards.

**Tech Stack:** Next.js 16 / Prisma 7 (`@prisma/adapter-pg`) / Neon Postgres / Vercel.

## Global Constraints

- `DATABASE_URL` for production must be Neon's **pooled** connection string (hostname contains `-pooler`), not the direct one — spec §1.
- `AUTH_SECRET` for production must be a newly generated value, never the one in `.env.docker`/`.env.local` — spec §2, closes ISSUE-7.
- `SEED_STAFF_PASSWORD` / `SEED_ADMIN_PASSWORD` for production must be real credentials chosen by the project owner, never the dev/Docker placeholder values — spec §2.
- `ENABLE_TEST_PICKER` must stay unset in both the Production and Preview Vercel environments — spec §2.
- No secret value (connection string, `AUTH_SECRET`, seed passwords) gets written to any file tracked by git, committed, or logged in a plan/spec doc — standard secret hygiene, not stated explicitly in the spec but implied by ISSUE-7's remediation.
- Preview deployments intentionally share the production Neon database — spec §4 (Decision 4). This is a deliberate MVP-scale tradeoff, not an oversight.

---

## File Structure

| File | Change |
|---|---|
| `package.json` | Add a `vercel-build` script: `prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build` |
| `BUILD_STATUS.md` | Check off the three Deployment checklist boxes once production is verified working |

No other files change. This plan is infrastructure/config work, not a feature.

---

### Task 1: Add and locally verify the `vercel-build` script

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a `vercel-build` npm script that Vercel will auto-detect and run in place of the default `build` script (Task 6 depends on this being merged to `main` before the first deploy).

- [ ] **Step 1: Add the script**

Open `package.json` and add `vercel-build` to the `"scripts"` block (alongside the existing `"build": "next build"` — leave that line in place, it's still used by `npm run build` / the Docker image):

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "vercel-build": "prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:seed": "prisma db seed"
}
```

- [ ] **Step 2: Verify it locally against the Docker Postgres instance**

This proves the exact command Vercel will run actually succeeds end-to-end, before trusting it to a remote build log.

Run (from the repo root, with the Docker Compose Postgres already up per your normal local workflow — `docker compose up -d db` if it isn't):

```bash
docker compose up -d db
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/digitalmenu?schema=public" \
SEED_STAFF_PASSWORD="local-verify-staff" \
SEED_ADMIN_PASSWORD="local-verify-admin" \
npm run vercel-build
```

Expected: the command runs `prisma generate`, then `prisma migrate deploy` (reports "No pending migrations to apply" if your local DB is already up to date), then the seed script (prints `Seeded credentials for roles: staff, admin`, `Seeded tables: 1, 2, 3`, `Seeded menu items: ...`), then `next build` completes with Next.js's standard build summary and exits 0.

If any step fails, stop and fix it here — do not proceed to Task 4/6 with an unverified script.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Add vercel-build script to run migrate deploy + seed at build time"
```

---

### Task 2: Create the Neon project and obtain the pooled connection string

**Owner-executed** (Neon dashboard — account-level action, no credentials available to Claude).

**Files:** none.

**Interfaces:**
- Consumes: nothing.
- Produces: a pooled Postgres connection string, needed as the `DATABASE_URL` value in Task 5.

- [ ] **Step 1:** Sign in to the Neon console and create a new project (any region is fine — no production traffic exists yet to optimize latency for).
- [ ] **Step 2:** In the project's Connection Details panel, select the **pooled** connection string — the one whose hostname contains `-pooler` (this routes through PgBouncer). Do not use the direct/unpooled string for `DATABASE_URL`.
- [ ] **Step 3:** Copy that connection string somewhere temporary and private (a password manager entry, not a file in this repo) — it's needed in Task 5 and should not be pasted into chat, a commit, or any tracked file.
- [ ] **Step 4: Verify the connection works** before moving on, using a throwaway local check (don't skip this — a bad connection string surfaces as a confusing build failure later):

```bash
DATABASE_URL="<paste the pooled connection string>" npx prisma db execute --stdin <<< "SELECT 1;"
```

Expected: no error output (Prisma exits 0 after executing the query).

---

### Task 3: Generate production secrets

**Files:** none — outputs are handed to Task 5, not written to any file.

**Interfaces:**
- Consumes: nothing.
- Produces: `AUTH_SECRET` value and the two seed-password values, needed in Task 5.

- [ ] **Step 1: Generate `AUTH_SECRET`**

```bash
openssl rand -base64 32
```

Copy the output somewhere temporary and private. This must be a fresh value — do not reuse the `AUTH_SECRET` from `.env.docker` or `.env.local`.

- [ ] **Step 2: Choose `SEED_STAFF_PASSWORD` and `SEED_ADMIN_PASSWORD`**

These are the real login passwords staff and the admin/owner will use in production, so they should be chosen deliberately (e.g. generated by a password manager) rather than reused from `.env.docker`'s dev placeholders. Store both alongside the `AUTH_SECRET` value from Step 1.

---

### Task 4: Create the Vercel project and link the GitHub repo

**Owner-executed** (Vercel dashboard — account-level action).

**Files:** none.

**Interfaces:**
- Consumes: nothing.
- Produces: a linked Vercel project, required before Task 5 (env vars) and Task 6 (deploy) can happen.

- [ ] **Step 1:** In the Vercel dashboard, import this repo's GitHub remote as a new project.
- [ ] **Step 2:** Confirm the framework preset auto-detects as **Next.js** and the root directory is the repo root (no monorepo subfolder).
- [ ] **Step 3 (correction, verified against a real deploy attempt):** Vercel's `vercel-build`-script auto-pickup does **not** apply when a recognized framework preset (Next.js) is selected — with a recognized framework, Vercel runs `npm run build` directly and ignores `vercel-build` unless the Build Command is explicitly overridden. In Settings → Build and Development Settings, toggle the Build Command override on and set it to `npm run vercel-build`. Save. Without this, the build runs plain `next build`, `prisma generate` never executes, and the build fails with `Module '"@prisma/client"' has no exported member 'Prisma'` (or similar missing-type errors) since the generated client is absent.
- [ ] **Step 4:** Do not trigger a deploy yet — env vars (Task 5) need to be in place first, otherwise the first build will fail at `prisma migrate deploy` with a missing/invalid `DATABASE_URL`.

---

### Task 5: Configure Vercel environment variables

**Owner-executed** (Vercel dashboard — requires pasting secret values into a UI Claude has no session/credentials for).

**Files:** none.

**Interfaces:**
- Consumes: the pooled connection string from Task 2, the secrets from Task 3, the linked project from Task 4.
- Produces: a fully configured Vercel project, ready for Task 6's deploy.

- [ ] **Step 1:** In the Vercel project's Settings → Environment Variables, add the following four variables. For each, check **both** the "Production" and "Preview" environment checkboxes (per spec §4 — previews intentionally share the production database at this stage):

  | Variable | Value |
  |---|---|
  | `DATABASE_URL` | the pooled connection string from Task 2 |
  | `AUTH_SECRET` | the value generated in Task 3 Step 1 |
  | `SEED_STAFF_PASSWORD` | the value chosen in Task 3 Step 2 |
  | `SEED_ADMIN_PASSWORD` | the value chosen in Task 3 Step 2 |

- [ ] **Step 2:** Confirm `ENABLE_TEST_PICKER` is **not** set in either environment (it shouldn't exist as a Vercel env var at all — its absence is what keeps `/order/test` hidden in production, per `app/order/test/page.tsx`'s existing gate).
- [ ] **Step 3:** Save.

---

### Task 6: Trigger the first deploy and verify the build

**Shared** (owner pushes/merges; both parties can read the build log).

**Files:** none.

**Interfaces:**
- Consumes: Task 1's committed `vercel-build` script (must be on `main`), Task 4's linked project, Task 5's env vars.
- Produces: a live production deployment URL, needed for Task 7's smoke test.

- [ ] **Step 1:** Merge/push the Task 1 commit to `main` (if it isn't already there). Vercel auto-deploys on push once the project is linked (Task 4).
- [ ] **Step 2:** Open the deploy's build log in the Vercel dashboard. Confirm, in order:
  - `prisma generate` completes without error
  - `prisma migrate deploy` reports migrations applied (or "No pending migrations to apply" if the schema was already current from an earlier manual check)
  - the seed script prints `Seeded credentials for roles: staff, admin`, `Seeded tables: 1, 2, 3`, `Seeded menu items: ...`
  - `next build` completes and the deploy status shows **Ready**
- [ ] **Step 3:** If the build fails, stop and diagnose from the log before proceeding — do not re-run Task 5 by guessing at values. Common failure: `DATABASE_URL` pasted with a trailing newline or missing `?sslmode=require`-equivalent param from the pooled string — re-copy it exactly from the Neon console.

---

### Task 7: Smoke test the production deployment

**Shared.** Claude drives the API-level checks via `curl` against the live URL (owner supplies the URL once Task 6 shows Ready); the owner drives the browser-based checks (QR/table flow, visual confirmation) since Claude can't operate a browser here.

**Files:** none.

**Interfaces:**
- Consumes: the production URL from Task 6, the passwords from Task 3.
- Produces: pass/fail confirmation gating Task 8.

- [ ] **Step 1 (Claude): verify admin login works end-to-end via the API**

```bash
curl -i -X POST https://<your-project>.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<SEED_ADMIN_PASSWORD value>"}'
```

Expected: `HTTP/2 200`, JSON body `{"role":"admin"}`, and a `Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax` header (the `Secure` attribute confirms `NODE_ENV=production` is correctly wired, per spec §2).

- [ ] **Step 2 (Claude): verify a wrong password is rejected**

```bash
curl -i -X POST https://<your-project>.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"definitely-wrong"}'
```

Expected: `HTTP/2 401` (or the status your `05-api-conventions.md` error table specifies for invalid credentials), no `Set-Cookie` header.

- [ ] **Step 3 (Claude): verify `/order/test` is inaccessible**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<your-project>.vercel.app/order/test
```

Expected: a 404, or a response that does not render the table picker (confirms `ENABLE_TEST_PICKER` is correctly absent in production).

- [ ] **Step 4 (Owner): browser walkthrough of the full core loop**
  - Visit `https://<your-project>.vercel.app/order?table=<a real table id from the seeded tables>` — confirm the demo menu (Espresso, Cappuccino, etc.) renders.
  - Add an item, submit the order, confirm an order number is returned.
  - Log in to `/login` with the admin password from Task 3 and confirm the new order appears on the staff dashboard within a few seconds (polling, per ADR-001).
  - Confirm the order and mark it paid; confirm both state changes are reflected.

- [ ] **Step 5:** If every check in Steps 1–4 passes, proceed to Task 8. If anything fails, log it in `ISSUES.md` per this project's standing rule (bugs get logged whether or not they're fixed immediately) before deciding whether it blocks checking off the Deployment boxes.

---

### Task 8: Update BUILD_STATUS.md

**Files:**
- Modify: `BUILD_STATUS.md`

**Interfaces:**
- Consumes: a passing Task 7.
- Produces: an up-to-date build status record for future sessions, per `CLAUDE.md`'s standing instruction to update `BUILD_STATUS.md` in the same turn as the change, not after the fact.

- [ ] **Step 1:** Check off the three existing Deployment checklist boxes:

```markdown
## Deployment

- [x] Vercel project created and linked
- [x] Neon Postgres database provisioned, `DATABASE_URL` set
- [x] Skeleton deployed to production (first successful deploy, even before all stories are done)
```

- [ ] **Step 2:** Update the "Per-system checklist" line near the top of the file:

```markdown
- [x] Walking skeleton (= the MVP) deployed end-to-end to production
```

- [ ] **Step 3:** Add a gotchas-log entry if Task 1's local verification or Task 6/7 surfaced anything non-obvious (e.g. a Neon connection-string quirk, a Vercel build-log detail worth remembering). If nothing non-obvious came up, skip this — don't invent a gotcha to fill space.

- [ ] **Step 4: Commit**

```bash
git add BUILD_STATUS.md
git commit -m "Mark production deployment complete in BUILD_STATUS.md"
```

---

## Self-Review Notes

- **Spec coverage:** Neon pooled connection (Task 2) · fresh `AUTH_SECRET`/seed passwords (Task 3) · Vercel project + env vars for Production and Preview (Tasks 4–5) · `vercel-build` script (Task 1) · previews-share-prod-DB consequence called out (Global Constraints, Task 5 Step 1) · rollout verification (Tasks 6–7) · `BUILD_STATUS.md` checklist (Task 8). Custom domain, Neon branching, and monitoring were explicitly out of scope in the spec and have no task here, correctly.
- **Placeholder scan:** no TBD/TODO; the only bracketed values (`<your-project>`, `<SEED_ADMIN_PASSWORD value>`) are runtime substitutions the executor fills in with real values they hold, not unresolved plan content.
- **Type/name consistency:** `DATABASE_URL`, `AUTH_SECRET`, `SEED_STAFF_PASSWORD`, `SEED_ADMIN_PASSWORD`, `ENABLE_TEST_PICKER` are used identically across Tasks 1, 2, 3, 5, matching the names already established in `.env.example` and `lib/session.ts`/`prisma/seed.ts`.
