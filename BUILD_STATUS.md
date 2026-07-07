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
| 2 | Table setup & QR identification | Done | |
| 3 | Menu management (Admin) | Done | |
| 4 | Customer menu view | Done | |
| 5 | Cart & order submission | Done | |
| 7 | Staff dashboard: view Pending orders (polling) | Done | |
| 8 | Staff confirms order and marks payment | Done | |
| 6 | Customer edits/cancels a Pending order | Done | Dedicated /order/[id] page; QR-rescan resume deferred to backlog |

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
- **`tsc --noEmit` fails with "Property does not exist" / "no exported member" after adding a Prisma model.** Editing `schema.prisma` alone doesn't regenerate `@prisma/client`'s TypeScript types — `npx prisma migrate dev` normally regenerates the client as a side effect, but if the generated client is stale from an earlier session/checkout, `tsc` reports the new model's fields/type as missing even though the schema and migration are correct. Fix: `npx prisma generate`. Hit this in Task 6 of Story 2 (`lib/tableService.ts` briefly appeared broken to `tsc` for reasons unrelated to that task's actual diff).
- **`ConflictError`'s wire code is always `CONFLICT`, never a per-scenario constant.** `handleApiError`'s `codeFor()` derives the JSON `error` code from the error *class* name, not the message — so a sold-out-item rejection in `orderService.createOrder` (Story 5) comes back as `{ error: "CONFLICT", message: "<item> is no longer available" }`, not a distinct `MENU_ITEM_SOLD_OUT` code. The Story 5 design spec named `MENU_ITEM_SOLD_OUT` as if it were a real wire code; it isn't — don't branch client code on it. If a future story needs to distinguish conflict *reasons* programmatically (not just show `message`), that requires a deliberate change to `codeFor()` or a new error subclass, not an assumption that the message text implies a matching code.
- **Testing a polling `useEffect` requires `vi.advanceTimersByTimeAsync`, not `vi.advanceTimersByTime`.** `PendingOrdersDashboard`'s poll function is `async` (it awaits `apiClient.get`); with Vitest 4's plain `advanceTimersByTime`, the fake-timer tick fires but the pending promise inside it never gets a chance to resolve before the assertion runs, so the test either false-passes on stale state or hangs. `advanceTimersByTimeAsync` (wrapped in `await act(async () => { ... })`) flushes the microtask queue after each timer tick, which is what actually lets the second `fetch`/render cycle complete before you assert on it. First use of fake timers in this codebase (Story 7, Task 4) — this pattern should be reused for any future polling/interval component test rather than rediscovered.
- **`userEvent.setup({ advanceTimers })` does not fully fix fake-timer hangs on this repo's Vitest/user-event pairing.** The documented fix for combining `vi.useFakeTimers()` with `userEvent` is `userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })` — but on this repo's exact versions (Vitest 4.1.9 + `@testing-library/user-event` 14.6.1), even with that fix wired correctly, `user.click()` itself hangs and times out under fake timers, before any timer-advance step is reached. The working fix is to use `fireEvent.click(...)` instead of `user.click(...)` for the interaction, wrapped with `await act(async () => { await vi.advanceTimersByTimeAsync(ms) })` for the timer step — the same pattern `PendingOrdersDashboard.test.tsx` already uses. First hit in `app/order/Cart.test.tsx`'s toast auto-dismiss test (Task 2 of the cart-toast/review-modal feature).
