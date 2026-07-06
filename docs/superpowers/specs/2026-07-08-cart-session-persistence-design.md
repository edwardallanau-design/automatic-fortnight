# Cart Session Persistence — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (customer-facing) · Follow-up to `2026-07-07-cart-add-and-order-confirm-ux-design.md` / `2026-07-07-cart-ux-polish-design.md`. Follows `07-epic-map.md` Story 5.

**Motivation.** Reported after the UX polish pass: the cart currently lives only in React component state (`app/order/Cart.tsx`'s `lines`), so refreshing the order page (accidental reload, browser hiccup, or just re-scanning the same QR code) silently wipes out everything the customer added.

**Scope.** Client-only. `app/order/Cart.tsx`. No backend, API, or schema changes — the cart is restored client-side before submission; `POST /api/orders` and its validation are unchanged.

## Decisions

- **`sessionStorage`, not `localStorage`.** The cart should survive a refresh or navigating away and back within the same browser tab session, but should NOT resurrect days later on a shared/reused device — that would show a stale, confusing cart on an unrelated future visit. `sessionStorage` is cleared when the tab/browser closes, matching "still at this table right now."
- **Keyed per table:** `cart:${tableId}`. Prevents a leftover cart from one table's order page bleeding into another table's page in the same browser (e.g. staff testing multiple tables, or a customer's browser retaining state across a QR re-scan at a different table).
- **Restored in a post-mount effect, not during initial render.** `app/order/Cart.tsx` is a Next.js client component, which still renders once on the server (no `sessionStorage` there) before hydrating on the client. Reading `sessionStorage` synchronously during the initial render/lazy-`useState`-initializer would produce different output on server vs. client and trigger a hydration mismatch. Restoring inside a `useEffect` that runs once after mount avoids this — the cost is a brief instant (one paint) where the cart shows empty before the saved lines appear, which is not noticeable in practice.
- **Saved on every `lines` change**, via a `useEffect` keyed on `[lines, tableId]`, so no explicit save call is needed at each mutation site (`addItem`, `adjustQuantity`, `removeLineWithAnimation`, `undoToast` all already funnel through `lines` state changes).
- **Cleared on successful submission**, before the redirect in `handleSubmit`. A customer who submits, then navigates back to `/order?table=<id>` (e.g. via browser back button), should see an empty cart, not the order they already placed re-appear as if uncommitted.
- **Stale items are NOT filtered on restore.** If a line's item goes sold-out or is deleted while the browser tab was open, the restored cart keeps the line as-is; the existing server-side sold-out/not-found rejection at submit time handles it exactly as it already does for an item that goes sold-out mid-session without ever needing a refresh. No new staleness-detection logic — this matches the existing pattern rather than adding a special case only for the restore path.
- **Corrupted or missing storage fails silently to an empty cart.** `JSON.parse` is wrapped in a `try/catch`; any error (missing key, malformed JSON, a future schema change to `CartLine`) just results in starting with `lines = []`, not a visible error to the customer.

## Implementation notes

In `app/order/Cart.tsx`:

- Add a `useEffect` that runs once on mount (`[]` dependency, but reads `tableId` inside — safe since `tableId` doesn't change for a mounted `Cart` instance): reads `sessionStorage.getItem(\`cart:${tableId}\`)`, `JSON.parse`s it inside a `try/catch`, and calls `setLines(...)` with the parsed array if it's non-empty; any failure leaves `lines` at its initial `[]`.
- Add a second `useEffect` keyed on `[lines, tableId]` that writes `sessionStorage.setItem(\`cart:${tableId}\`, JSON.stringify(lines))` on every change. Guard against writing during the very first render before the restore effect has run isn't necessary — writing `[]` before restoration completes and then immediately being overwritten by the restore is harmless (same tick, no visible flash, and if there's nothing saved yet this is a no-op).
- In `handleSubmit`'s success branch (before `router.push`), call `sessionStorage.removeItem(\`cart:${tableId}\`)`.
- No new state, no new component, no new file — this is entirely additive to the existing `lines` state lifecycle.

## Testing

Extends `app/order/Cart.test.tsx`. `jsdom` (this project's test environment) provides a real, working `sessionStorage`, so tests can seed/inspect it directly without mocking:

- Seeding `sessionStorage` with a saved cart for the table before rendering `Cart` results in that cart being restored and visible in the "Your order" region.
- Adding an item causes the current cart to be saved to `sessionStorage` under the table-specific key.
- A successful order submission clears that `sessionStorage` key.
- A cart saved under a *different* table id is not restored when rendering `Cart` for this table (verifies the per-table key scoping).
- Malformed JSON in `sessionStorage` under the cart key does not crash rendering; the cart starts empty.

## Scope boundary

Does not touch: `lib/orderService.ts`, `app/api/orders/route.ts`, `app/order/OrderReviewModal.tsx`, `app/order/[id]/OrderTicket.tsx` (Story 6), Story 7/8's staff dashboard. Does not change any submission/validation logic — only when the cart's in-memory `lines` state gets seeded and cleared.
