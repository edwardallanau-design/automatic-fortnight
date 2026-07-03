# Build Status

**Board.** `Backlog → Building → Done`, WIP limit of **one** story at a time (per playbook Section 0). Update this file as stories move.

**Lifecycle stage.** FOUNDATION complete → **MVP** (in progress) → VALIDATE → SCALE

---

## Per-system checklist

- [x] Foundation: artifacts 1–4 at production depth, 5–7 at MVP depth
- [x] Validation hypothesis + kill criteria written into artifact #1
- [x] CLAUDE.md seeded
- [x] MVP epic broken into agent-ready stories
- [ ] Walking skeleton (= the MVP) deployed end-to-end to production
- [ ] Validation gate reached and decided: go / pivot / kill
- [ ] If go: scale path begun, signal-driven

**Open risk.** No pilot restaurant confirmed yet — the kill criteria in `01-intent-and-constraints.md` are unmeasurable without one. Resolve before/alongside the build.

---

## MVP epic: Digital Ordering Core Loop

Recommended build order: 1 → 2 → 3 → 4 → 5 → 7 → 8 → 6 (see `07-epic-map.md` for the dependency rationale).

| # | Story | Status | Notes |
|---|---|---|---|
| 1 | Staff/Admin login | Done | |
| 2 | Table setup & QR identification | Building | Tasks 1-6 done (tableService, qrCode, authGuard.requireApiRole, POST /api/tables, admin table setup page); Task 7 (customer order-URL landing) remaining. |
| 3 | Menu management (Admin) | Backlog | |
| 4 | Customer menu view | Backlog | |
| 5 | Cart & order submission | Backlog | |
| 7 | Staff dashboard: view Pending orders (polling) | Backlog | |
| 8 | Staff confirms order and marks payment | Backlog | |
| 6 | Customer edits/cancels a Pending order | Backlog | |

Status values: `Backlog` · `Building` · `Blocked` · `Done`

---

## Deployment

- [ ] Vercel project created and linked
- [ ] Neon Postgres database provisioned, `DATABASE_URL` set
- [ ] Skeleton deployed to production (first successful deploy, even before all stories are done)

## Validation gate (fill in once the pilot is live)

- **Pilot restaurant:** `<name, TBD>`
- **Measurement window start:** `<date>`
- **Measurement window end (1 month later):** `<date>`
- **Result:** `<% of orders via digital menu>` → **Decision:** `<Go / Pivot / Kill>`

## Gotchas log

- **Vitest 4 mock hoisting.** `vi.mock('mod', () => ({ fn: someOuterConstFn }))` throws `Cannot access '...' before initialization` if `someOuterConstFn` is a plain top-level `const` declared below the `vi.mock` call — `vi.mock` factories are hoisted above all other top-level code. Fix: declare the mock functions via `vi.hoisted(() => ({...}))` and destructure from that. Hit this in `lib/authGuard.test.ts` (Task 7).
- **Prisma 7 requires a driver adapter, not just a `DATABASE_URL`.** `npx prisma init` now defaults to Prisma 7, which removed the implicit query-engine connection — `new PrismaClient()` with no arguments no longer connects to anything. You must install `@prisma/adapter-pg`, construct `new PrismaPg({ connectionString: process.env.DATABASE_URL })`, and pass it as `new PrismaClient({ adapter })`. Also requires a `prisma.config.ts` file (datasource URL and migration/seed config no longer live inline in `schema.prisma`'s `datasource` block). See `lib/prisma.ts`, `prisma.config.ts`, `prisma/seed.ts`.
- **Two Postgres instances can silently fight over port 5432.** If a native Windows Postgres service is already installed, a Docker Postgres container mapped to the same port will also bind successfully (no error), but `localhost:5432` resolves ambiguously (IPv6 `::1` vs IPv4) and traffic may go to either one, causing "my migration ran but the seed I'm querying shows nothing" confusion. Check `netstat -ano | grep :5432` before assuming which instance you're talking to; prefer `127.0.0.1` over `localhost` in `DATABASE_URL` to pin the connection explicitly.
