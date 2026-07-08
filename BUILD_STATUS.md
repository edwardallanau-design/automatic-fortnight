# Build Status

**Board.** `Backlog → Building → Done`, WIP limit of **one** story at a time (per playbook Section 0). Update this file as stories move.

**Lifecycle stage.** FOUNDATION complete → **MVP** (in progress) → VALIDATE → SCALE

---

## Per-system checklist

- [x] Foundation: artifacts 1–4 at production depth, 5–7 at MVP depth
- [x] Validation hypothesis + kill criteria written into artifact #1
- [x] CLAUDE.md seeded
- [x] MVP epic broken into agent-ready stories
- [x] Walking skeleton (= the MVP) deployed end-to-end to production
- [ ] Validation gate reached and decided: go / pivot / kill
- [ ] If go: scale path begun, signal-driven

**Open risk.** No pilot restaurant confirmed yet — the kill criteria in `01-intent-and-constraints.md` are unmeasurable without one. Resolve before/alongside the build.

---

## MVP epic: Digital Ordering Core Loop

Recommended build order: 1 → 2 → 3 → 4 → 5 → 7 → 8 → 6 (see `07-epic-map.md` for the dependency rationale).

| # | Story | Status | Notes |
|---|---|---|---|
| 1 | Staff/Admin login | Done | |
| 2 | Table setup & QR identification | Done | |
| 3 | Menu management (Admin) | Done | |
| 4 | Customer menu view | Done | |
| 5 | Cart & order submission | Done | |
| 7 | Staff dashboard: view Pending orders (polling) | Done | |
| 8 | Staff confirms order and marks payment | Done | |
| 6 | Customer edits/cancels a Pending order | Done | Dedicated /order/[id] page; QR-rescan resume deferred to backlog |
| 9 | Order customer name (user-directed, post-epic) | Done | Spec: docs/superpowers/specs/2026-07-07-order-customer-name-design.md |
| 10 | Staff dashboard live redesign (user-directed, post-epic) | Done | Tap-to-open OrderDetailModal, live status polling on the customer confirmation page. Original three-lane layout (Pending / Confirmed & Unpaid / Completed today) superseded after manual testing feedback — see Story 10a. Spec: docs/superpowers/specs/2026-07-08-staff-dashboard-live-redesign-design.md · Plan: docs/superpowers/plans/2026-07-08-staff-dashboard-live-redesign.md |
| 10a | Staff dashboard tabs revision (user-directed, post-epic) | Done | Replaces Story 10's three-way lane split with two tabs (Pending / Confirmed, the latter = today's full confirmed history, paid or unpaid). Payment toggle is now a plain flag with no lane-routing side effects. Spec: docs/superpowers/specs/2026-07-08-staff-dashboard-tabs-revision-design.md · Plan: docs/superpowers/plans/2026-07-08-staff-dashboard-tabs-revision.md |

Status values: `Backlog` · `Building` · `Blocked` · `Done`

---

## Deployment

- [x] Vercel project created and linked
- [x] Neon Postgres database provisioned, `DATABASE_URL` set
- [x] Skeleton deployed to production (first successful deploy, even before all stories are done)

Live at `https://automatic-fortnight-lyart.vercel.app/`. Deployment design/plan: `docs/superpowers/specs/2026-07-08-production-deployment-design.md` / `docs/superpowers/plans/2026-07-08-production-deployment.md`. Known follow-ups tracked in `ISSUES.md`: `ISSUE-11` (seed-on-deploy is the intended password-rotation mechanism, accepted), `ISSUE-12` (weak production admin/staff passwords + no login rate limiting, accepted for now, rotate before a real pilot).

## Validation gate (fill in once the pilot is live)

- **Pilot restaurant:** `<name, TBD>`
- **Measurement window start:** `<date>`
- **Measurement window end (1 month later):** `<date>`
- **Result:** `<% of orders via digital menu>` → **Decision:** `<Go / Pivot / Kill>`

## Gotchas log

- **Vitest 4 mock hoisting.** `vi.mock('mod', () => ({ fn: someOuterConstFn }))` throws `Cannot access '...' before initialization` if `someOuterConstFn` is a plain top-level `const` declared below the `vi.mock` call — `vi.mock` factories are hoisted above all other top-level code. Fix: declare the mock functions via `vi.hoisted(() => ({...}))` and destructure from that. Hit this in `lib/authGuard.test.ts` (Task 7).
- **Prisma 7 requires a driver adapter, not just a `DATABASE_URL`.** `npx prisma init` now defaults to Prisma 7, which removed the implicit query-engine connection — `new PrismaClient()` with no arguments no longer connects to anything. You must install `@prisma/adapter-pg`, construct `new PrismaPg({ connectionString: process.env.DATABASE_URL })`, and pass it as `new PrismaClient({ adapter })`. Also requires a `prisma.config.ts` file (datasource URL and migration/seed config no longer live inline in `schema.prisma`'s `datasource` block). See `lib/prisma.ts`, `prisma.config.ts`, `prisma/seed.ts`.
- **Two Postgres instances can silently fight over port 5432.** If a native Windows Postgres service is already installed, a Docker Postgres container mapped to the same port will also bind successfully (no error), but `localhost:5432` resolves ambiguously (IPv6 `::1` vs IPv4) and traffic may go to either one, causing "my migration ran but the seed I'm querying shows nothing" confusion. Check `netstat -ano | grep :5432` before assuming which instance you're talking to; prefer `127.0.0.1` over `localhost` in `DATABASE_URL` to pin the connection explicitly.
- **`tsc --noEmit` fails with "Property does not exist" / "no exported member" after adding a Prisma model.** Editing `schema.prisma` alone doesn't regenerate `@prisma/client`'s TypeScript types — `npx prisma migrate dev` normally regenerates the client as a side effect, but if the generated client is stale from an earlier session/checkout, `tsc` reports the new model's fields/type as missing even though the schema and migration are correct. Fix: `npx prisma generate`. Hit this in Task 6 of Story 2 (`lib/tableService.ts` briefly appeared broken to `tsc` for reasons unrelated to that task's actual diff).
- **`ConflictError`'s wire code is always `CONFLICT`, never a per-scenario constant.** `handleApiError`'s `codeFor()` derives the JSON `error` code from the error *class* name, not the message — so a sold-out-item rejection in `orderService.createOrder` (Story 5) comes back as `{ error: "CONFLICT", message: "<item> is no longer available" }`, not a distinct `MENU_ITEM_SOLD_OUT` code. The Story 5 design spec named `MENU_ITEM_SOLD_OUT` as if it were a real wire code; it isn't — don't branch client code on it. If a future story needs to distinguish conflict *reasons* programmatically (not just show `message`), that requires a deliberate change to `codeFor()` or a new error subclass, not an assumption that the message text implies a matching code.
- **Testing a polling `useEffect` requires `vi.advanceTimersByTimeAsync`, not `vi.advanceTimersByTime`.** `PendingOrdersDashboard`'s poll function is `async` (it awaits `apiClient.get`); with Vitest 4's plain `advanceTimersByTime`, the fake-timer tick fires but the pending promise inside it never gets a chance to resolve before the assertion runs, so the test either false-passes on stale state or hangs. `advanceTimersByTimeAsync` (wrapped in `await act(async () => { ... })`) flushes the microtask queue after each timer tick, which is what actually lets the second `fetch`/render cycle complete before you assert on it. First use of fake timers in this codebase (Story 7, Task 4) — this pattern should be reused for any future polling/interval component test rather than rediscovered.
- **`userEvent.setup({ advanceTimers })` does not fully fix fake-timer hangs on this repo's Vitest/user-event pairing.** The documented fix for combining `vi.useFakeTimers()` with `userEvent` is `userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })` — but on this repo's exact versions (Vitest 4.1.9 + `@testing-library/user-event` 14.6.1), even with that fix wired correctly, `user.click()` itself hangs and times out under fake timers, before any timer-advance step is reached. The working fix is to use `fireEvent.click(...)` instead of `user.click(...)` for the interaction, wrapped with `await act(async () => { await vi.advanceTimersByTimeAsync(ms) })` for the timer step — the same pattern `PendingOrdersDashboard.test.tsx` already uses. First hit in `app/order/Cart.test.tsx`'s toast auto-dismiss test (Task 2 of the cart-toast/review-modal feature).
- **Plain `.test.ts` files have no `sessionStorage`/`localStorage` — don't "fix" this with a shared polyfill.** `vitest.config.ts` splits tests into two projects: `**/*.test.ts` runs under the `node` environment (no browser globals), `**/*.test.tsx` runs under `jsdom` (real `sessionStorage`). A `.test.ts` file that needs `sessionStorage` (e.g. a plain-TS storage-helper module with no React involved) will fail with it undefined. Do **not** patch this by adding a polyfill to the shared `vitest.setup.ts` — that silently changes behavior for every `.test.ts` file in the repo, and a hand-rolled `Storage` polyfill is easy to get subtly wrong (e.g. `key(index)` ignoring `index`, or `getItem` returning `null` for a stored `""` instead of `""`). Instead add `// @vitest-environment jsdom` as the literal first line of the one test file that needs it, before any imports — this opts just that file into the `jsdom` project's real, spec-correct `sessionStorage` with zero shared-config risk. Hit and reverted in Task 2 of the order-customer-name feature (`app/order/orderNameStorage.test.ts`).
- **Docker Compose is now the actual local dev/test loop, not just an additional isolated option.** The original Docker design (`docs/superpowers/specs/2026-07-06-docker-compose-deployment-design.md`) was written with host `npm run dev` + `.env.local` as the primary workflow and `docker compose up` (app on host `:3001`, Postgres on host `:5433`) as a secondary, isolated way to run the project. In practice, Docker is now how this project is actually run and verified locally. This does **not** change the production deployment plan — `BUILD_STATUS.md`'s Deployment checklist (Vercel + Neon Postgres) is unaffected and still the target for production. When verifying a change works, prefer checking it via `docker compose up --build` over assuming host `npm run dev` was the check.
- **Vercel ignores a `vercel-build` npm script once a framework preset is recognized.** The documented `vercel-build`-script-auto-pickup convention does not apply when the project's Framework Preset is set to "Next.js" (or any other recognized framework) — Vercel runs `npm run build` directly instead and never looks for `vercel-build`. The build then fails at `next build` with `Module '"@prisma/client"' has no exported member '...'`, because `prisma generate` (part of the `vercel-build` script, not `build`) never ran. Fix: explicitly override the Build Command in Vercel's Project Settings → Build and Development Settings to `npm run vercel-build`. Discovered via a real failed deploy during the first production rollout; see `docs/superpowers/plans/2026-07-08-production-deployment.md` Task 4 Step 3. **Update:** that dashboard override only lives in Vercel project state, not in git — if the Vercel project were ever recreated, the override would be lost with nothing in the repo to catch it or explain the fix. A root-level `vercel.json` (`{ "buildCommand": "npm run vercel-build" }`) was added specifically to make this fix survive project recreation — Vercel honors `vercel.json`'s `buildCommand` regardless of the recognized framework preset. The dashboard override is no longer required (it's now redundant/backup) but is harmless to leave set.
- **A `date=today` filter needs its own `confirmedAt`/`paidAt`-equivalent field — don't optimistically bump a count scoped by one field based on a different action.** `listOrders({ date: 'today' })` (`lib/orderService.ts`) scopes "today" by `confirmedAt`. The dashboard's "Completed today" count is that same query's result length. An early version of the staff-dashboard redesign optimistically incremented the local count the instant a Confirmed & Unpaid order was marked Paid — but that lane is deliberately *not* date-scoped (an order confirmed yesterday can still be sitting there unpaid), so paying off a carried-over order bumped the count, then the very next poll (≤3.5s later) correctly excluded it again (its `confirmedAt` wasn't today) and the number visibly dropped back down. Fix: only optimistically bump a count when the action you just took is *itself* what makes the record match the filter (e.g. confirming an already-Paid order — `confirmedAt` becomes "now" as part of that exact API call, so it's safe); for any other action, let the next poll be the sole source of truth rather than guessing client-side. Caught in the final whole-branch review of the dashboard redesign, not by any per-task review — this class of bug only shows up when the filter's field and the action's effect are viewed together.
