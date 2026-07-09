# Restrict Customer Order Editing to Cancel-Only — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (customer-facing) · Backlog item: "Restrict customer self-editing of a Pending order to cancel-only; item adjustment becomes dashboard/staff-only" (`07-epic-map.md`, removed from that file's Backlog list once this ships). Post-epic, user-directed. Also closes `ISSUE-13`.

**Motivation.** Since Story 12/13, staff/admin can add/remove/adjust-quantity items on any order from the dashboard. The customer's own ability to remove items from `/order/[id]` while Pending is now redundant with that, and the underlying API routes accept any caller — including anonymous ones — which `ISSUE-13` already flagged as an accepted-for-now risk. Rather than carry that risk indefinitely, the owner decided to just remove the redundant customer capability: once an order is submitted, the customer's only self-service action is Cancel. All item-level editing becomes exclusively a staff/admin dashboard action.

**Scope.** Touches `docs/design/02-domain-model.md` (`INV-4`, high-level flow prose), `lib/orderService.ts` (`removeOrderItem`/`addOrderItem`/`updateOrderItemQuantity` role param), the three API routes under `app/api/orders/[id]/items/**`, and `app/order/[id]/OrderTicket.tsx` + `TicketCard.tsx` (customer UI). **Does not** touch `app/dashboard/OrderDetailModal.tsx` or its staff-facing item-editing UI — staff/admin capability is unchanged. `DELETE /api/orders/:id` (cancel) is unchanged and stays unauthenticated.

## Decisions

### 1. `INV-4` gains a role restriction

Current: *"OrderItems may be added, removed, or have their quantity changed only while the parent Order's `fulfillmentStatus = Pending`."*

New: *"OrderItems may be added, removed, or have their quantity changed only by Staff or Owner/Admin, and only while the parent Order's `fulfillmentStatus = Pending`."*

`INV-6` (cancel only while Pending) is unchanged and stays open to the customer. The "High-level flow" section's customer line ("adds items to cart, may add/remove/adjust freely") is updated to reflect that add/remove/adjust freedom applies to the pre-submission cart only — post-submission, the customer's only action on their own order is cancel.

### 2. API routes require staff/admin

`POST /api/orders/:id/items`, `PATCH /api/orders/:id/items/:itemId`, and `DELETE /api/orders/:id/items/:itemId` each add `await requireApiRole('staff')` at the top of the handler — the same pattern already used by `app/api/orders/[id]/confirm/route.ts` and the pay route. An anonymous or under-privileged caller gets `403 Forbidden` (via the existing `ForbiddenError`) instead of a mutation.

`lib/orderService.ts`'s `removeOrderItem`/`addOrderItem`/`updateOrderItemQuantity` currently take `actorRole?: Role` (optional, used only to detect the admin-on-Confirmed exception). Since every caller is now guaranteed to have a role, this becomes a required `actorRole: Role` param — tightens the signature to match reality rather than leaving it looking anonymous-callable.

`DELETE /api/orders/:id` (cancel) is untouched — no `requireApiRole` added, no service-layer signature change. Customers keep this action exactly as today.

### 3. Customer UI (`app/order/[id]/OrderTicket.tsx`, `TicketCard.tsx`)

- `OrderTicket.tsx` drops the entire remove-item path: the `ConfirmAction` union's `'remove'` variant, the `singleLine` check that used to hide remove on a one-line order, and the per-line `×` button wiring. `handleConfirm`'s branch on `confirmAction.type === 'cancel'` collapses to the only remaining action.
- `TicketCard.tsx` drops the `onRemove?: () => void` field from `TicketCardLine` and the `×` button it rendered — dead prop once its only caller stops passing it (confirmed via grep: `TicketCard` has no other consumer besides `OrderTicket.tsx`/`OrderStatusPoller.tsx`).
- Status note text changes from *"Remove items or cancel while your order is still pending."* to *"Contact staff to change your order, or cancel it below."*
- The `Confirmed`-state branch in `app/order/[id]/page.tsx` (statusNote: *"Confirmed by staff — ask staff to change anything."*) is unchanged — already consistent with this direction.

## Testing

Per `06b-engineering-decisions.md` §7 (Vitest logic/integration):

- `lib/orderService.ts`: `removeOrderItem`/`addOrderItem`/`updateOrderItemQuantity` now take a required `actorRole`; existing Pending/Confirmed-admin-exception test cases updated to pass one explicitly.
- API route tests: new case per route asserting `403` with no session and with a `customer`-equivalent (no session) caller; existing staff/admin-session success cases updated if they relied on the old optional-role passthrough.
- `OrderTicket.test.tsx` / `TicketCard.test.tsx`: remove-item test cases deleted; cancel-only flow retained and still covered.
- No change expected to `PendingOrdersDashboard.tsx` / `OrderDetailModal.tsx` tests — staff-side calls already send an authenticated session today, so `requireApiRole('staff')` is a no-op for them.

## Tracker updates (part of this change, not just code)

- `BUILD_STATUS.md`: new Story 18 row, "Restrict customer self-editing to cancel-only."
- `docs/design/07-epic-map.md`: remove the now-implemented backlog bullet from the Backlog epics list.
- `ISSUES.md`: move `ISSUE-13` to Resolved — anonymous item-mutation is no longer possible once these routes require `staff`+.

## Scope boundary — do NOT touch

`app/dashboard/OrderDetailModal.tsx`, `app/dashboard/PendingOrdersDashboard.tsx`, and their tests — staff/admin item-editing capability is unchanged, only now guaranteed authenticated (already true in practice, since the dashboard is itself behind `requireRole`). `DELETE /api/orders/:id` (cancel route) and `cancelOrder` in `orderService.ts`. `INV-5`, `INV-7`, `INV-8`, `INV-9`, `INV-10` — untouched. No new invariant is introduced; `INV-4` is narrowed, not replaced.
