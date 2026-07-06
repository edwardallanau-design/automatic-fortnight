# Story 8 — Staff Confirms Order and Marks Payment — UX Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering · Follows `02-domain-model.md` state machines (`fulfillmentStatus`, `paymentStatus`), `05-api-conventions.md`, `07-epic-map.md` Story 8.

**Status.** The backend and a first-pass UI for this story were already implemented (`lib/orderService.ts`'s `confirmOrder`/`setPaymentStatus`, `app/api/orders/[id]/confirm/route.ts`, `app/api/orders/[id]/pay/route.ts`, and buttons on `PendingOrdersDashboard`) and pass all acceptance criteria. This spec covers a follow-up brainstorm on the dashboard's interaction design — it does not change the service layer or API routes, which are already correct and untouched by this design.

## Scope

Client-only revision to `app/dashboard/PendingOrdersDashboard.tsx`. No backend changes: `confirmOrder`, `setPaymentStatus`, and the `/confirm` and `/pay` routes already satisfy every acceptance criterion in `07-epic-map.md` Story 8 and are not modified here.

## Decisions

- **Confirm requires a native `window.confirm()` gate.** Confirming locks the order from further staff/customer edits (`INV-5`), so a single mis-tap has a real cost. A native blocking dialog ("Confirm order #&lt;n&gt;?") avoids building and testing a custom two-step UI while still preventing accidental taps, including on a touch/tablet dashboard.
- **Mark Paid has no confirmation step.** Only the fulfillment transition is gated; toggling payment status is not a one-way door in the same sense (`INV-8`/`INV-9` already restrict who can reverse it).
- **The "Mark Unpaid" button stays hidden entirely for staff** on a Paid order (unchanged from the existing implementation) — staff sees a static "Paid" label, admin sees the button. This matches the domain model's framing of reverting payment as an admin-only correction, not an action staff should be invited to attempt and get rejected.
- **Optimistic removal on Confirm success stays** (unchanged) — the order disappears from the list immediately rather than waiting for the next ~3.5s poll tick, since it's already gone from the `status=pending` result set once confirmed.
- **Row-scoped submitting + error state, newly added.** The current implementation has no error handling: a failed `PATCH` (e.g. a `409` because another staff member already confirmed the same order, or a `403` on a stale Mark-Unpaid click) rejects silently with no UI feedback and no protection against a rapid double-click firing two requests for the same order.

## State shape

Alongside the existing `orders: PendingOrder[]`, add:

```ts
type RowState = { submitting: boolean; error: string | null }
const [rowState, setRowState] = useState<Record<string, RowState>>({})
```

Looked up per row as `rowState[order.id] ?? { submitting: false, error: null }`, so no pre-seeding is needed when new orders arrive via polling. Keeping this separate from `PendingOrder` (the server-shaped type) means the API response shape doesn't need a UI-only field bolted on.

## Confirm flow

1. Click "Confirm" → `window.confirm('Confirm order #<orderNumber>?')`.
2. Cancel → no-op, no request, no state change.
3. OK → set that row's state to `{ submitting: true, error: null }`, call `apiClient.patch('/api/orders/:id/confirm', {})`.
4. Success → remove the order from `orders` and delete its `rowState` entry (matches current optimistic-removal behavior).
5. Failure → catch `ApiError`, set that row's state to `{ submitting: false, error: err.message }` (fallback text `'Something went wrong. Please try again.'` if the error isn't an `ApiError`, matching `app/order/Cart.tsx`'s existing pattern). The order stays visible so staff can retry, or the next poll tick reconciles it if it turns out to already be Confirmed elsewhere.

## Pay flow (Mark Paid / Mark Unpaid)

Same shape as Confirm, minus the `window.confirm()` gate:

1. Click → set `{ submitting: true, error: null }` for that row → `apiClient.patch('/api/orders/:id/pay', { paymentStatus })`.
2. Success → update that order's `paymentStatus` in place in `orders`, clear the row's error, `submitting: false`.
3. Failure → set `{ submitting: false, error: err.message }` for that row.

## Rendering

- Each row's Confirm/Mark Paid/Mark Unpaid buttons get `disabled={rowState.submitting}` — prevents a double-click from firing a second request for the same order while the first is in flight.
- If `rowState.error` is set, render `<p role="alert">{error}</p>` under that row's buttons. Scoped per-row so one order's failure doesn't affect the visibility or usability of any other row.
- No global error banner, no toast — errors are local to the row that produced them, consistent with the rest of this dashboard having no app-wide notification system.

## Testing

Extends `app/dashboard/PendingOrdersDashboard.test.tsx`:

- Clicking Confirm calls `window.confirm` with a message containing the order number; if it returns `true`, the `/confirm` PATCH fires; if it returns `false`, no request is made and the order stays in the list.
- A rejected `/confirm` or `/pay` call renders that row's inline error text (`role="alert"`) and re-enables its buttons; the order remains visible (for `/confirm`) or its `paymentStatus` is left unchanged (for `/pay`).
- Buttons are disabled between the click and the request settling — simulated with a controllable (manually-resolved) promise so the test can assert the disabled state mid-flight before resolving it.
- A subsequent successful action on the same row clears any previously-shown error for that row.
- Existing coverage (renders on fetch, polling re-fetch, "No pending orders", Confirm removes the order on success, Mark Paid/Unpaid update `paymentStatus`, admin-only revert visibility) is retained, updated only where `window.confirm` now needs to be mocked to return `true` for the happy-path Confirm tests.

## Scope boundary

Does not touch: `lib/orderService.ts`, `app/api/orders/[id]/confirm/route.ts`, `app/api/orders/[id]/pay/route.ts` (already correct and covered by their own service/route tests), menu management (Story 3), customer-side order edit/cancel (Story 6).
