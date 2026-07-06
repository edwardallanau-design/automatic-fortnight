# Story 6 — Customer Edits/Cancels a Pending Order — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering · Follows `02-domain-model.md` (`INV-2`, `INV-4`, `INV-5`, `INV-6`, `fulfillmentStatus` state machine), `05-api-conventions.md`, `07-epic-map.md` Story 6.

## Summary

After submitting, the customer is redirected to a dedicated, refreshable page `/order/[id]` that is the home for reviewing, editing, and cancelling the order **while it remains `Pending`**. The customer can remove individual line items or cancel the whole order. Once staff confirms it (`INV-5`), the page shows a read-only, locked view.

This replaces the current in-memory confirmation "ticket" (React state in `app/order/Cart.tsx`), which is destroyed on page refresh and holds no durable handle to the order.

## Decisions (and the reasoning behind them)

- **Dedicated order URL over ephemeral state.** The Story-5 confirmation lives only in `Cart.tsx`'s `confirmation` React state — a refresh wipes it and the order `id` with it. Redirecting to a real page `/order/[id]` makes the confirmation refreshable and gives edit/cancel a stable home. Chosen over `localStorage` (fragile across devices/cleared storage) and over keeping ephemeral state (no recovery at all).
- **Customer cancel is retained** exactly as the domain model specifies (`Pending → Cancelled`, trigger: Customer). While an order is `Pending`, nothing has been acted on, so this is the intended safe self-service window; once staff confirms, `INV-5` already locks the customer out. No domain-model change.
- **Scope is remove-item + cancel only.** No add-item or quantity-change after submission. Story 6's slice is "remove items or cancel the whole order"; quantity/add happen pre-submit in the cart. `INV-4` permits more, but the story does not ask for it (YAGNI).
- **Removing the last remaining line is blocked** (the story's recommended option), because `INV-2` forbids empty orders — cancel is the explicit "I want nothing" action. Enforced server-side with `ConflictError` (409); guided client-side by hiding that line's Remove control when one line remains.
- **DELETE, not PATCH, for both mutations.** `05-api-conventions.md` explicitly assigns "cancel/remove" to `DELETE → 204`. Cancel = `DELETE /api/orders/[id]`; remove line = `DELETE /api/orders/[id]/items/[itemId]`. (Staff confirm/pay use PATCH sub-resources; customer cancel/remove use DELETE per the conventions doc.)
- **Server component reads directly; no GET-single HTTP route.** `/order/[id]/page.tsx` calls `orderService.getOrderById` directly (same pattern as `app/order/page.tsx` calling `getTableOrThrow`). Mutations call `apiClient.del` then `router.refresh()` to re-run the server component — the App Router idiom, keeping the server the single source of truth. This avoids adding a public `GET /api/orders/:id` endpoint.

## Authorization model (accepted MVP limitation)

The `/order/[id]` page and both DELETE routes are **unauthenticated**, consistent with `POST /api/orders` — the customer flow has no session. The order `id` (a UUID) therefore acts as a bearer capability: whoever holds the URL can view/edit/cancel the order **while it is `Pending`**. Confirmed/Cancelled orders reject all mutations (`409`), so the blast radius is a single un-confirmed order. This is a documented, accepted trade-off for the MVP, not a bug. A future story may introduce a per-order capability token if this proves insufficient.

## Deferred to a follow-up story (not in this slice)

Full "lost-the-link" recovery — re-scanning the table QR to resume the table's active `Pending` order — is **out of scope here**. It would require deciding whether a table may hold more than one concurrent `Pending` order (a new invariant / domain-model change). Logged as a backlog item; the dedicated URL already fixes the refresh-loses-everything problem this story cares about.

## Service layer — `lib/orderService.ts` (three new functions)

- `getOrderById(orderId: string): Promise<OrderWithItemsAndTable>` — `findUnique` with `items` + `table`; throws `NotFoundError` if absent.
- `cancelOrder(orderId: string): Promise<OrderWithItems>` — load order; if not found → `NotFoundError`; if `fulfillmentStatus !== 'Pending'` → `ConflictError` (`INV-6`); else update `fulfillmentStatus = 'Cancelled'`. Mirrors the existing `confirmOrder` guard shape.
- `removeOrderItem(orderId: string, orderItemId: string): Promise<OrderWithItems>` — load order **with items**; if order not found → `NotFoundError`; if `fulfillmentStatus !== 'Pending'` → `ConflictError` (`INV-4`); if the `orderItemId` is not one of this order's items → `NotFoundError`; if the order has only one item → `ConflictError` ("Cancel the order instead", protects `INV-2`); else delete that `OrderItem` and return the reloaded order with remaining items.

## API routes (public — no `requireApiRole`)

- `app/api/orders/[id]/route.ts` → `DELETE` → `cancelOrder(id)` → `204` (no body). Errors via `handleApiError` (`404`, `409`).
- `app/api/orders/[id]/items/[itemId]/route.ts` → `DELETE` → `removeOrderItem(id, itemId)` → `204`. Errors via `handleApiError` (`404`, `409`).

Note (per project gotcha): `handleApiError` derives the wire `error` code from the error **class name**, so a Confirmed-order rejection returns `{ error: "CONFLICT", ... }`, not a bespoke `ORDER_NOT_PENDING`. The client keys on HTTP status + `message`, never on a specific code string.

## UI — `app/order/[id]/`

- **`page.tsx`** (server component) — awaits `params.id`, calls `getOrderById`. Branches:
  - not found (`NotFoundError`) → friendly error state ("We couldn't find that order. Please ask staff for help.").
  - `Cancelled` → "This order was cancelled." (read-only ticket).
  - `Confirmed` → read-only ticket + "Confirmed by staff — ask staff to change anything." (mirrors the existing `.ticket__note`).
  - `Pending` → renders `<OrderTicket>` (client) with the order data.
- **`OrderTicket.tsx`** (client component) — reuses the existing `.ticket` markup moved out of `Cart.tsx`. Per line: a **Remove** button (`apiClient.del('/api/orders/:id/items/:itemId')`). A **Cancel order** button (`apiClient.del('/api/orders/:id')`). On success → `router.refresh()` (re-runs the server component; a removed-to-cancel or staff-confirmed order re-renders into the correct state). When only one line remains, its Remove control is hidden so Cancel is the guided path (server still enforces the 409). On a caught `ApiError`, render an inline `role="alert"` message (e.g. a `409` because staff just confirmed → "This order was just confirmed by staff and can no longer be changed."), then `router.refresh()` to reconcile.
- **`Cart.tsx`** — the inline `confirmation` branch is removed; `handleSubmit` now `router.push(\`/order/${order.id}\`)` after a successful POST. This touches Story-5 code, but within the same bounded context and as the natural evolution of the confirmation UX. The ticket markup is preserved by relocating it into `OrderTicket.tsx`.

## Testing (TDD, Vitest — per `06b` §7)

- **`lib/orderService.test.ts`** (extend):
  - `cancelOrder`: Pending → `Cancelled`; Confirmed → `ConflictError`; Cancelled → `ConflictError`; missing → `NotFoundError`.
  - `removeOrderItem`: removes a line from a multi-item Pending order; removing the only line → `ConflictError`; on a Confirmed order → `ConflictError`; unknown `orderItemId` → `NotFoundError`; missing order → `NotFoundError`.
- **`app/api/orders/[id]/route.test.ts`**: `DELETE` happy path → `204`; `409` on Confirmed; `404` on missing.
- **`app/api/orders/[id]/items/[itemId]/route.test.ts`**: `DELETE` happy path → `204`; `409` on last-item / Confirmed; `404` on unknown item/order.
- **`app/order/[id]/OrderTicket.test.tsx`**: Remove fires the item DELETE and refreshes; Cancel fires the order DELETE and refreshes; single-line state hides Remove; a `409` renders the inline alert. (`router.refresh` mocked via `next/navigation`.)
- **`app/order/[id]/page.test.tsx`**: renders Pending (editable), Confirmed (locked note), Cancelled, and not-found states.

## Scope boundary — do NOT touch

Staff-side confirm/pay actions and their routes (`app/api/orders/[id]/confirm`, `.../pay`, `PendingOrdersDashboard`) — Story 8, already done. Menu management (Story 3), table setup (Story 2). No changes to `02-domain-model.md` invariants or state machines (customer cancel is retained as already specified).
