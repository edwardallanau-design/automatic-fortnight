# Dashboard Polish Round — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (staff-facing + customer-facing) · Follows Story 10a (`docs/superpowers/specs/2026-07-08-staff-dashboard-tabs-revision-design.md`) and the order tile redesign (`docs/superpowers/specs/2026-07-08-order-tile-redesign-design.md`). Post-epic, user-directed — three independent fixes/features raised during manual verification of that work.

**Motivation.** Manual testing of the tabs/tile work surfaced three things: (1) a real, pre-existing bug on the customer-facing confirmation page where the heading claims an order is "confirmed" while it's still `Pending` and editable — directly contradicting the status note underneath it; (2) a request to let any staff (not just admin) revert a Paid order back to Unpaid, relaxing the domain rule `INV-9`; (3) the Confirmed tab's "X min ago" time display becomes unreadable once orders have been sitting for hours, and there's no way to sort the day's confirmed orders — approved via an Artifact mockup showing a wall-clock timestamp (based on when the order was *confirmed*, not placed) plus a newest/oldest sort toggle.

**Scope.** Three independent changes, bundled into one spec since they were raised and approved together, but implemented as separate plan tasks:
1. `app/order/[id]/OrderTicket.tsx` — fix the Pending-state heading (logged as `ISSUE-10`).
2. `docs/design/02-domain-model.md`, `lib/orderService.ts`, `app/api/orders/[id]/pay/route.ts`, `app/dashboard/OrderDetailModal.tsx`, `app/dashboard/PendingOrdersDashboard.tsx`, `app/dashboard/page.tsx` — relax `INV-9`.
3. `app/dashboard/OrderCard.tsx`, `app/dashboard/PendingOrdersDashboard.tsx`, `app/globals.css` — Confirmed-tab timestamp + sort.

No schema/migration changes — `confirmedAt` is already a real column on `Order`, already returned by `GET /api/orders` (Prisma's default `findMany` returns all scalar fields; nothing currently `select`s it away), and already used server-side for the `date=today` filter. This is a client-side typing/rendering change only.

## Decisions

### 1. Fix `ISSUE-10` — Pending order no longer claims "confirmed"

- **Problem.** `page.tsx`'s Confirmed branch renders `TicketCard` with `heading={`Order #${orderNumber} confirmed`}` — correct there. `OrderTicket.tsx` (the editable, Pending-state component) passes the **identical** heading string to its own `TicketCard`, even though the order hasn't been confirmed. Its `statusNote` correctly says "Remove items or cancel while your order is still pending" one line below — a direct on-screen contradiction.
- **Fix.** `OrderTicket.tsx`'s heading drops "confirmed" — becomes `Order #${orderNumber}`, matching the plain, no-claim heading `page.tsx`'s Cancelled branch already uses (`Order #{orderNumber}`). No other copy on this component changes.

### 2. Relax `INV-9` — any staff may revert Paid → Unpaid

- **Problem.** `INV-9` currently restricts reverting `paymentStatus` from `Paid` back to `Unpaid` to Owner/Admin only. You've decided this restriction should be lifted: any staff member should be able to correct a mis-marked payment.
- **Fix.** `INV-9` is retired as an access restriction — `paymentStatus` becomes freely settable in either direction by any authenticated staff/admin session, same as marking Paid already is. This is a genuine one-way-door domain-rule change (per this project's own stop-rule), made with your explicit go-ahead.
- **Consequences to trace through, not just the rule itself:**
  - `lib/orderService.ts`'s `setPaymentStatus` currently takes a `role` parameter solely to run this now-removed check — the parameter is dropped, not left as dead weight.
  - `app/api/orders/[id]/pay/route.ts` still requires the caller to be `staff`-or-above (`requireApiRole('staff')` stays — this isn't about removing auth, only the admin-specific revert restriction) but no longer threads the resolved role into `setPaymentStatus`.
  - `app/dashboard/OrderDetailModal.tsx`'s payment-action branch currently has a three-way split (Unpaid → "Mark Paid" button; Paid + admin → "Mark Unpaid" button; Paid + staff → static "Paid" badge, no action). It collapses to a two-way split: Unpaid → "Mark Paid"; Paid → "Mark Unpaid" (always, regardless of role) — meaning the `role` prop this component currently takes becomes unused and is removed from its interface.
  - `app/dashboard/PendingOrdersDashboard.tsx` currently receives a `role` prop solely to forward to `OrderDetailModal` — once that forwarding is gone, verify whether `role` is used anywhere else in this file; if not, remove the prop from `PendingOrdersDashboard`'s own interface too, and stop passing it from `app/dashboard/page.tsx`'s `<PendingOrdersDashboard role={role} />` call. (`page.tsx` itself keeps computing `role` from `requireRole('staff')` regardless — it's still needed there for the existing admin-only nav-link check.)
  - `docs/design/02-domain-model.md`'s `INV-9` line is rewritten to state the new rule (any staff may revert payment status) rather than deleted outright, so the domain doc still documents payment-status behavior explicitly rather than going silent on it.

### 3. Confirmed tab: wall-clock timestamp + newest/oldest sort

- **Problem.** `OrderCard`'s time display (`formatTimeAgo`, relative "X min ago") is well-suited to the Pending tab (urgency), but on the Confirmed tab — a same-day historical record that can span many hours — a large relative number ("312 min ago") is harder to read at a glance than a clock time, and there's currently no way to reorder the list.
- **Fix, timestamp.** `OrderCard`'s time display becomes conditional on `fulfillmentStatus` (already a field on the type, no new prop needed): Pending orders keep `formatTimeAgo(createdAt)`; Confirmed orders show a wall-clock timestamp (e.g. "2:34 PM") derived from `confirmedAt`, since that's what "confirmed today, in order" actually means for this tab. `OrderCardOrder`'s type gains `confirmedAt: string | null` (nullable since a Pending order's `confirmedAt` is genuinely `null` until confirmed — `OrderCard` only reads it in the Confirmed branch, where it's guaranteed set).
- **Fix, sort.** `PendingOrdersDashboard.tsx` gains a `sortDirection: 'newest' | 'oldest'` piece of state, defaulting to `'newest'`, surfaced only on the Confirmed tab as a small toggle pill (not a dropdown — it's a binary choice). The Confirmed tab's list is sorted client-side by `confirmedAt` before rendering (the array is already fully in memory from the poll; no new API call or param). The Pending tab is unaffected — it keeps the server's existing oldest-first order (`listOrders`'s `orderBy: { createdAt: 'asc' }`), matching the existing "oldest order needs attention first" queue semantics that tab already has.

## Testing

- `OrderTicket.test.tsx`: heading assertion updated to `Order #{N}` (no "confirmed"); a new regression test asserts the word "confirmed" never appears anywhere in the Pending-state render.
- `lib/orderService.test.ts`: the existing test(s) asserting a `ForbiddenError` for a non-admin reverting Paid→Unpaid are replaced with a test confirming the revert now succeeds regardless of role; `setPaymentStatus`'s signature drops `role` in every call site across the test file.
- `app/api/orders/[id]/pay/route.test.ts`: any test asserting role-gated revert behavior is updated to match — `staff` can revert same as `admin`.
- `OrderDetailModal.test.tsx`: the staff-sees-static-badge / admin-sees-revert-button split collapses into one behavior (both roles see "Mark Unpaid" on a Paid order); the `role` prop is removed from every render call in the file.
- `PendingOrdersDashboard.test.tsx`: the existing "allows an admin to revert..." test is generalized to run under `role="staff"` (no admin-only case needed anymore, since there's no longer a role distinction to test); render calls that pass `role="staff"`/`role="admin"` are reviewed — if `role` is dropped from the component's props per Decision 2, every render call in this file updates to match the new (role-less) call signature.
- `OrderCard.test.tsx`: new tests for the Confirmed-branch wall-clock timestamp (format, and that it's derived from `confirmedAt` not `createdAt`) alongside the existing Pending-branch relative-time test.
- `PendingOrdersDashboard.test.tsx`: new tests for the sort toggle — default newest-first ordering of the Confirmed tab's cards, and that toggling flips to oldest-first; confirms the Pending tab shows no sort control.

## Scope boundary — do NOT touch

`app/api/orders/route.ts`, `lib/orderService.ts`'s `listOrders`/`confirmOrder`/`cancelOrder`/`removeOrderItem`, `app/components/Modal.tsx`, `app/order/[id]/OrderStatusPoller.tsx`, `app/order/[id]/TicketCard.tsx` — none of these need to change for any of the three decisions above. `INV-8` (payment/confirmation timing independence) is unaffected — only `INV-9`'s access restriction changes, not the underlying "payment transitions independently of confirmation" rule. Time-to-confirm analytics (`createdAt` vs `confirmedAt` gap reporting) is explicitly deferred to the `Order history & reporting` backlog epic, not built here — this round is UX-only display/sort, not a reporting feature.
