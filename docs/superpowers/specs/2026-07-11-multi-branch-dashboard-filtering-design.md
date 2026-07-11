# Multi-branch dashboard filtering — Design (Plan 3 of 3)

**Date.** 2026-07-11
**Source.** Plan 3 of 3 for the multi-branch feature. Plan 1 (schema/migration/auth, merged to `dev` at `07f6755`) made the data model branch-aware. Plan 2 (admin branch CRUD + branch selectors, spec + plan written, not yet built) lets admin manage branches and their tables/menu-sold-out state. Neither plan touched the staff dashboard's order-fetching query at all — `GET /api/orders` still has zero branch awareness. Parent design: `docs/superpowers/specs/2026-07-10-multi-branch-ordering-points-design.md`.

## Problem

Today, `lib/orderService.ts`'s `listOrders()` takes `status`/`paymentStatus`/`date` but no `branchId`, and `GET /api/orders`'s route handler never reads `session.branchId` at all. This means a Downtown branch's staff login, right now, still sees **every branch's orders** on their dashboard — not a cosmetic gap, a real scoping bug that's only survived this long because there's only ever been one branch in practice. This plan closes it, and gives admin the promised branch-tab view on top.

## Scope

**In scope.**
- `listOrders()` gains an optional `branchId` filter; its return type gains a `branch: { id, name }` relation (for the "All" tab's per-row tag), alongside the existing `orderingPoint`.
- `GET /api/orders` forces `branchId = session.branchId` for staff sessions, unconditionally overriding any client-supplied `?branchId=` — staff's own branch always wins, mirroring the exact security boundary Plan 1/2 already established for `resolveBranchId`. Admin's `?branchId=` stays optional; omitted means "All".
- Dashboard client (`PendingOrdersDashboard`): a new `activeBranch` state (`'all' | <branchId>`), admin-only branch tab strip **above** the existing Pending/Confirmed tabs (branch is the outer facet, status the inner one). `fetchTabs()` itself is unchanged — it keeps fetching unfiltered-by-branch data on every poll; the branch tab filters the already-fetched list client-side, exactly like the existing status tabs already do (they fetch both Pending and Confirmed on every poll regardless of which is active, for instant tab switching with no extra round-trip).
- `OrderCard` gains a `showBranch?: boolean` prop — a small branch-name tag, rendered only when the "All" tab is active (a specific branch tab already tells you which branch you're looking at, so tagging every row there would be redundant).
- `app/dashboard/page.tsx` calls `listBranches()` when `role === 'admin'` and passes the result down — no new API route, matching Plan 2's precedent that every branch-list consumer is a server component reading `branchService` directly.

**Out of scope.**
- Any staff-facing UI change. The fix for staff is entirely server-side scoping — zero new elements, zero new interactions. Verifiable directly: a staff dashboard screenshot before and after this plan should be pixel-identical.
- A new API route for branches (none needed — `app/dashboard/page.tsx` is already a server component).
- Any change to individual order-action endpoints (confirm/pay/cancel/add-item/etc.) — those already operate on a single order by id and don't need branch awareness added.
- Real-time push / WebSockets — still the existing 3.5s polling per `ADR-001`.
- URL-based branch-tab state. Considered and rejected: this component's existing Pending/Confirmed tabs are plain client `useState` with no page navigation (it's a live-polling component), and Plan 2's `?branch=<id>` URL convention is for server-rendered admin pages with no equivalent live-update requirement. Introducing a URL-driven tab here would be a new interaction pattern inconsistent with the component's own existing tabs, and risks interrupting in-flight poll cycles or card-exit animations on every switch.

## Data flow

```ts
// lib/orderService.ts
listOrders(options: { status?, paymentStatus?, date?, branchId? }): Promise<OrderWithItemsAndOrderingPoint[]>
// where.branchId = options.branchId when present; include gains `branch: true`
```

```ts
// app/api/orders/route.ts GET handler
const session = await requireApiRole('staff')
// ...existing status/paymentStatus/date parsing...
const branchIdParam = searchParams.get('branchId')
const branchId = session.branchId ?? branchIdParam ?? undefined
const orders = await listOrders({ status, paymentStatus, date, branchId })
```

The one line `session.branchId ?? branchIdParam ?? undefined` is the actual security fix: a staff session's own `branchId` is checked first and wins unconditionally; only when it's absent (admin) does a client-supplied `branchId` get a chance to apply, and even then only to select which slice of "everything admin can see" to view — never to grant access beyond what the session already permits.

Dashboard client: `activeOrders`'s existing computation —

```ts
const activeOrders = activeTab === 'pending' ? pendingOrders : sortConfirmedOrders(confirmedOrders)
```

gains one more filter step, applied before the existing sort:

```ts
const branchFiltered = (list: DashboardOrder[]) =>
  activeBranch === 'all' ? list : list.filter((o) => o.branchId === activeBranch)
const activeOrders = branchFiltered(activeTab === 'pending' ? pendingOrders : sortConfirmedOrders(confirmedOrders))
```

Tab counts (`Pending (3)`, `Confirmed (5)`) become branch-scoped automatically, since they count the branch-filtered list, not the raw fetched one.

## Component structure

- **`app/dashboard/page.tsx`** — fetches `listBranches()` only when `role === 'admin'`; passes `branches: { id: string; name: string }[]` to `PendingOrdersDashboard` (an empty array for staff, so the branch-list fetch never even runs on a path that will never render tabs).
- **`PendingOrdersDashboard`** — gains a `branches` prop and `activeBranch` state, defaulting to `'all'`. The branch tab strip renders only when `branches.length > 0` — for staff it's absent entirely, not merely hidden by CSS, matching the "zero new UI for staff" requirement literally.
- **`OrderCard`** — gains `showBranch?: boolean` (default `false`); when true, renders `order.branch.name` as a small tag alongside the existing ordering-point label. `OrderCardOrder`'s exported type gains `branchId: string` and `branch: { name: string }`.
- **`OrderDetailModal`** — unchanged. It already receives a full order object; no branch-specific action lives inside it.

## Error handling

- A stale `activeBranch` referencing a since-renamed branch: `listBranches()` re-runs on every page load (server component, no client cache), so the tab list is always current on a fresh dashboard visit; a renamed branch's tab label updates on next load. No branch-deletion path exists (per Plan 2's scope), so a tab can never point at a branch that's vanished mid-session.
- No new error class needed — `listOrders({branchId: <nonexistent>})` simply returns an empty array, same as any other non-matching filter today.

## Testing

- `lib/orderService.test.ts` (extended) — `listOrders({branchId})` filters correctly; return shape includes `branch`.
- `app/api/orders/route.test.ts` (extended) — staff session's `branchId` is forced regardless of any `?branchId=` sent (even a different one supplied deliberately); admin's `?branchId=` is honored when present; admin with no param gets every branch's orders.
- `app/dashboard/PendingOrdersDashboard.test.tsx` (extended) — branch tabs render only when `branches` is non-empty; switching `activeBranch` filters the already-fetched list with no new `fetch` call; tab counts are branch-scoped; the "All" tab's cards render with `showBranch`, a specific branch tab's don't.
- `app/dashboard/OrderCard.test.tsx` (extended) — `showBranch` toggles the branch-name tag's presence.

## Rollout

- No migration needed — fully additive to Plan 1's already-merged schema, no new tables/columns.
- Independent of Plan 2 in principle (Plan 3 doesn't consume anything Plan 2 builds), but naturally follows it since Plan 2 is what actually lets a second branch exist to test against. Work branches off `dev`, PR/squash back into `dev`.
