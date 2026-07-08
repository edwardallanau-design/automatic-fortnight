# Staff-Assisted Table Ordering — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (staff-facing) · Backlog items: "Staff-assisted ordering" and "Resume order by re-scanning the QR"'s sibling concern, both `07-epic-map.md`. Post-epic, user-directed.

**Motivation.** Two needs converged into one feature: (1) the QA-only table picker at `/order/test` only works in dev, so it can't be used to test the ordering flow on `preprod`/production; (2) staff sometimes need to place an order on behalf of a customer who doesn't have their own phone/QR access — including walk-in customers with no table at all (e.g. counter/takeaway). Rather than widen `/order/test`'s unauthenticated exposure to more environments, this replaces it with a staff-authenticated picker that serves both needs at once: any authenticated staff/admin session can start an order for any table, on any environment, including one reserved "Counter" table for walk-ins.

**Scope.** Touches `app/order/test/` (deleted), a new `app/order/new/` route, `app/dashboard/page.tsx` (new "New order" button), `app/order/page.tsx` (staff-only back-navigation link), and any code that renders a table number for display (picker, dashboard, ticket) to apply the "table `0` = Counter" convention. No changes to `lib/orderService.ts`, `lib/tableService.ts`, the `Table`/`Order` schema, or any invariant (`INV-1` through `INV-9` unchanged) — orders placed by staff use the exact same `createOrder` path and look identical to customer-placed orders, with no marker or flag distinguishing provenance.

## Decisions

### 1. Replace `/order/test` with an authenticated `/order/new`

- **Problem.** `/order/test` lists every table unauthenticated, gated only by `NODE_ENV !== 'production'` or `ENABLE_TEST_PICKER=true` (`app/order/test/page.tsx`). Flipping that flag on for `preprod` (or worse, production) to enable testing would expose an unauthenticated order-placement surface against the shared production database — compounding `ISSUE-12`, not fixing the testing gap.
- **Fix.** New route `app/order/new/page.tsx`, protected by `requireRole('staff')` (so both `staff` and `admin` sessions pass, per `ROLE_RANK` in `lib/authGuard.ts`). Renders the same table list UI `/order/test` has today (reusing the `.table-picker` markup/styles), sourced from `listTables()`. Each row links to `/order?table=<id>`, unchanged.
- `app/order/test/page.tsx` and `app/order/test/page.test.tsx` are deleted. `ENABLE_TEST_PICKER` is removed from `.env.docker.example`; its references in `docs/superpowers/specs/2026-07-08-production-deployment-design.md` and `docs/superpowers/plans/2026-07-08-production-deployment.md` are updated with a note that the flag no longer exists (superseded by role-based auth on `/order/new`).
- This is a net security improvement over the status quo, not just a new feature: it removes an unauthenticated order-placement surface instead of extending it to more environments.

### 2. Prominent, all-staff entry point on the dashboard

- **Problem.** The dashboard's existing admin-only nav (`Menu Management`, `Table Setup` — `app/dashboard/page.tsx`) is the wrong home for this: placing an order for a customer is a floor-staff task, not an admin one, and burying it in a small text-link nav undersells how often it'll be used.
- **Fix.** A prominent primary "New order" button in the dashboard header, separate from the admin-only nav list, visible to **any** authenticated staff or admin session. Links to `/order/new`.

### 3. Walk-in / no-table orders via a reserved table number

- **Problem.** `INV-1` (`02-domain-model.md`) requires every Order to reference exactly one existing Table — there's no concept of a table-less order. A customer who orders directly through staff (e.g. at a counter) often doesn't have a table assigned.
- **Fix.** Pure display convention, no schema or invariant change: table **number `0`** is reserved to mean "Counter". Admin creates it once, manually, via the existing Table Setup UI — same as any other table. Everywhere a table number is rendered for display (the `/order/new` picker, the staff dashboard's order list, the customer-facing ticket/order pages), `number === 0` renders as **"Counter"** instead of "Table 0".
- Verified against `lib/orderService.ts`'s `createOrder`: there is no constraint limiting a table to one concurrent Pending order, so "Counter" transparently supports multiple simultaneous walk-in orders with no additional logic — each is just a normal Order referencing the same `tableId`.
- Explicitly out of scope: making `Table` optional on `Order` (an actual `INV-1` change) is not part of this design. If the "Counter" convention later proves insufficient, that's a separate, deliberately-scoped follow-up per this project's stop rules.

### 4. Staff back-navigation from the order page

- **Problem.** `app/order/page.tsx` is customer-facing and has no session awareness. A staff member who reaches it via `/order/new` (to place an order, possibly repeatedly for different walk-in customers) has no way back to the dashboard short of the browser back button.
- **Fix.** `app/order/page.tsx` gains a non-redirecting read of the session cookie (read + `verifySession`, no `requireRole`, no throw/redirect) purely to decide whether to render a "Back to dashboard" link. Customers with no session see nothing extra — the page's public, unauthenticated behavior is otherwise unchanged. An authenticated staff/admin session sees the link and can return to `/dashboard` (and from there, back to `/order/new` for the next table).

## Testing

Extends this repo's existing Vitest + RTL conventions:

- New tests for `/order/new` mirroring the deleted `/order/test` tests (table list rendering, empty state, link hrefs), replacing the `NODE_ENV`/`ENABLE_TEST_PICKER` gating tests with a `requireRole` redirect-when-unauthenticated case (redirects to `/login` for no session; renders for both `staff` and `admin` roles).
- Dashboard test updated to assert the "New order" button renders for both `staff` and `admin` roles.
- `/order` page test updated: no back-link with no session cookie; back-link present and pointing to `/dashboard` with a valid staff or admin session cookie.
- A "Counter" display-convention test at minimum on the `/order/new` picker and the staff dashboard's order list (table `number: 0` renders as "Counter", not "Table 0").

## Scope boundary — do NOT touch

`lib/orderService.ts`, `lib/tableService.ts`, `lib/authGuard.ts`, `lib/session.ts`, the `Table`/`Order` Prisma schema, and any `INV-*` invariant — all unchanged. No marker/flag is added to `Order` to distinguish staff-placed from customer-placed orders. No seeding/migration logic is added for the "Counter" table — it's created manually via the existing admin UI, same as any other table.
