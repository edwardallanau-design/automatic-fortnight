# Staff/Admin Order Edits & Dashboard Back-Links — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (staff/admin-facing) · Backlog items: "Admin edits to Confirmed orders (UI)" and "Staff edits to a *Pending* order" (both `07-epic-map.md`, removed from that file's Backlog list once this ships). Post-epic, user-directed. The dashboard back-link sweep is a new, not-previously-backlogged ask folded into the same branch.

**Motivation.** Three related gaps, bundled into one delivery at the user's request:

1. `INV-5` (`02-domain-model.md`) already documents that Owner/Admin may edit a Confirmed order's contents as a correction mechanism — but no UI exists for it yet.
2. Staff currently has zero item-editing capability at any stage — only Confirm, payment toggle, and (per the domain model, though unbuilt) implicit authority to cancel a Pending order. Only the customer can edit their own still-Pending order today.
3. A staff/admin "← Dashboard" back-link exists on `app/order/page.tsx` (added for Story 11) but is missing from four other staff/admin-reachable screens.

**Scope.** Touches `lib/orderService.ts`, three API routes under `app/api/orders/[id]/items/**` (one new POST, one new PATCH, one extended DELETE), `app/dashboard/OrderDetailModal.tsx` (new editing UI + Cancel action), `app/dashboard/page.tsx` (back-link + `ISSUE-5` fix), and four pages gaining a back-link (`app/order/[id]/page.tsx`, `app/order/new/page.tsx`, `app/admin/menu-items/page.tsx`, `app/admin/tables/page.tsx`). **Does not** touch `app/order/[id]/OrderTicket.tsx` or its API routes' customer-facing behavior — the customer's own capability stays remove-only + cancel, unchanged. No invariant (`INV-1`–`INV-9`) is changed; `INV-5`'s already-documented exception is being implemented, not altered.

## Decisions

### 1. One shared editing capability, gated by status + role

Both features need the same underlying operations (add item, remove item, adjust quantity) on an Order, differing only in who's allowed to invoke them:

| Fulfillment status | Item edits (add/remove/qty) | Cancel |
|---|---|---|
| `Pending` | Anyone (customer via existing routes, or staff/admin via the dashboard) | Customer or staff/admin |
| `Confirmed` | Admin only (`INV-5` exception) | Nobody (`INV-6` still requires `Pending`) |
| `Cancelled` | Nobody | N/A |

Rather than two separate implementations, one shared service layer and one shared dashboard component (`OrderItemsEditor`) implement this table once, parameterized by the caller's role and the order's current status.

### 2. Service layer (`lib/orderService.ts`)

- `removeOrderItem(orderId, itemId, actorRole?)` — **extended**. Existing behavior (`Pending`-only, `ConflictError` otherwise, last-item-removal blocked per `INV-2`) is preserved as the default. New: also allowed when `fulfillmentStatus === 'Confirmed'` **and** `actorRole === 'admin'`. Any other caller hitting a Confirmed order gets the exact same `ConflictError` it gets today — no new error path for existing callers (customer, non-admin staff). The last-item-removal block applies unconditionally, including to admin on a Confirmed order — there is no cancel-equivalent for Confirmed, so this is a hard floor.
- `addOrderItem(orderId, menuItemId, quantity, actorRole?)` — **new**. Same status/role gate as above. Snapshots `name`/`price` at add-time (`INV-3`); rejects sold-out menu items (`INV-7`, `ConflictError`). If the menu item already has a line on the order, increments that line's quantity rather than creating a duplicate `OrderItem` row.
- `updateOrderItemQuantity(orderId, itemId, quantity, actorRole?)` — **new**. Same gate. `quantity` must be a positive integer ≥ 1 (`ValidationError` otherwise) — reducing to 0 is not a valid input; the existing remove endpoint is the path to zero out a line.
- `cancelOrder` — **unchanged**. Still `Pending`-only. Now also invoked from the staff dashboard, not only the customer page.

### 3. API routes

- `DELETE /api/orders/:id/items/:itemId` — existing route, response shape unchanged (`204`). Internally now reads the caller's role via `peekSession()` (non-redirecting — customers with no session must still succeed) and passes it as `actorRole` to the service call.
- `POST /api/orders/:id/items` — **new**. Body `{ menuItemId, quantity }` → `201` + updated order, per `05-api-conventions.md`'s create convention. Same `peekSession()`-passthrough.
- `PATCH /api/orders/:id/items/:itemId` — **new**. Body `{ quantity }` → `200` + updated order, per the partial-update convention. Same passthrough.
- `DELETE /api/orders/:id` (cancel) — unchanged, still unauthenticated (`Pending`-only cancel was already open to anyone).

This preserves the existing trust model for every route a customer already calls — no new auth requirement is introduced on paths they use today. The only new gate is the Confirmed-order branch, which is new behavior entirely.

### 4. Dashboard UI (`app/dashboard/OrderDetailModal.tsx`)

- New `OrderItemsEditor` renders per-line controls (a `− qty +` stepper, styled to match the existing cart panel's stepper, plus a `×` remove button) when the current session is permitted to edit this order (per the table in Decision 1). For a `Pending` order this is any staff/admin session; for `Confirmed`, only when `role === 'admin'` — staff sees today's unchanged read-only list.
- A "+ Add item" control opens a small menu-item picker sourced from the existing `GET /api/menu-items`, filtered to `available` items only (`INV-7`), with a quantity input, calling the new `POST` route.
- Destructive actions (remove line, cancel order) reuse the existing `ConfirmDialog` pattern already established in `OrderTicket.tsx`/the confirm-order flow. Non-destructive actions (add item, adjust quantity) need no confirmation step, matching how the original cart never required one.
- **New "Cancel order" button**, shown only when `fulfillmentStatus === 'Pending'`, next to "Confirm order" — closes the gap between the domain model (staff already has authority to cancel a Pending order) and the UI (no such control exists today). Routed through `ConfirmDialog` with the same copy the customer page uses ("Cancel this order? Staff won't receive it, and this can't be undone.").
- Errors surface via the modal's existing error-banner pattern (`ApiError.message`, generic fallback otherwise) — no new error-handling pattern.
- After any successful edit, the dashboard's existing poll-driven re-render keeps the modal in sync (`selectedOrder` is already re-derived from the polled arrays on every render) — no new refresh mechanism needed.

### 5. Back-to-dashboard link sweep

Applies the existing `peekSession()` + `← Dashboard` link (`order-header__back` class, established on `app/order/page.tsx` for Story 11) to the four gaps the codebase currently has:

- `app/order/[id]/page.tsx` — public page; gate the link on `peekSession()` truthy, same conditional pattern as `app/order/page.tsx`.
- `app/order/new/page.tsx` — already `requireRole('staff')`-gated; render the link unconditionally (the page-level guard already proves staff/admin).
- `app/admin/menu-items/page.tsx` — already `requireRole('staff')`-gated; unconditional link.
- `app/admin/tables/page.tsx` — already `requireRole('admin')`-gated; unconditional link.

### 6. `ISSUE-5` fix (bundled)

While touching `app/dashboard/page.tsx`'s nav for the above, also fix the already-logged, already-open `ISSUE-5`: the admin nav's "Menu Management" link points to `/admin/menu` (404s) instead of the real route `/admin/menu-items`. One-line fix; move this issue to `ISSUES.md`'s Resolved section as part of this branch.

## Testing

Per `06b-engineering-decisions.md` §7 (Vitest logic/integration, no new e2e path needed — existing happy-path script unaffected):

- `lib/orderService.ts`: status/role gating for `removeOrderItem`/`addOrderItem`/`updateOrderItemQuantity` (Pending/any, Confirmed/admin-only, Cancelled/nobody), last-item-removal still blocked for admin on Confirmed, duplicate-item-add increments existing line, sold-out rejection (`INV-7`), quantity validation (≥1).
- API routes: role passthrough via `peekSession()` for all three item routes; existing unauthenticated-customer-success cases still pass unchanged.
- `OrderItemsEditor`: controls render/hide correctly per role × status combination from Decision 1's table.
- Back-link additions: mirror `app/order/page.test.tsx`'s existing pattern — no link with no session (for the public `/order/[id]` page), link present for both `staff` and `admin` sessions; unconditional presence for the three already-gated pages.

## Scope boundary — do NOT touch

`app/order/[id]/OrderTicket.tsx` and its existing capability (customer stays remove-only + cancel, no add/quantity UI added there). `lib/authGuard.ts`, `lib/session.ts`, the `Order`/`OrderItem` Prisma schema, and any `INV-*` invariant — `INV-5`'s exception is being implemented, not altered, and no new invariant is introduced. No per-employee audit trail of *who* (which staff member) made an edit — out of scope per `ADR-003`'s shared-credential model.
