# Cart Add-to-Cart Toast + Order Review Confirmation — UX Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (customer-facing) · Follows `07-epic-map.md` Story 5 (Cart & order submission), `05-api-conventions.md`.

**Motivation.** Reported UX gap: tapping a menu item adds it to the cart immediately with no feedback beyond the cart rail's count updating, so an accidental tap (e.g. mis-tap while scrolling) silently adds an item the customer may not notice. Separately, the final "Submit order" tap goes straight to the API with no second confirmation, so a stray tap there sends a real order to staff with no chance to review it first.

**Scope.** Client-only revision to `app/order/Cart.tsx`. No backend changes — `POST /api/orders` and its validation are unchanged and already correct.

## Decisions

- **Tap-to-add stays as-is.** A per-item `+`/`−` stepper (replacing the whole-row tap) was considered as a stronger fix — it would keep cart state visible on the item itself instead of only in the toast/cart rail. Parked as a future improvement rather than built now (see `07-epic-map.md` Backlog epics); today's fix keeps the existing interaction and adds a toast on top of it.
- **Toast includes Undo, not just an acknowledgement.** An info-only toast tells the customer something happened but doesn't fix it — they'd still have to open the cart panel and use the existing stepper to correct a mis-tap. Undo directly reverses the specific action the toast is reporting.
- **Undo reverses exactly one `+1`, not the whole line.** If a customer adds 2× Latte on purpose and later mis-taps a 3rd, Undo should only remove that 3rd one — not silently wipe out the 2 they meant to order. Each add shows its own toast (replacing any toast still visible; no stacking), so Undo always acts on the single most recent add.
- **Toast auto-dismisses after ~4s.** Long enough to notice and react, short enough not to linger as clutter over the menu.
- **Order review is a full-screen modal, not an inline swap.** The cart rail's expanded panel is easy to miss entirely if the customer hasn't scrolled to it — a full-screen overlay is a much stronger interrupt for what is otherwise a one-way action (the order goes to staff immediately, no post-submit edit for anything other than the already-supported cancel/remove-item flow from Story 6). Visual style follows the existing ticket-stub look (`.ticket` classes in `globals.css`) used on the order confirmation page, so this doesn't introduce a new visual language.
- **Modal button reads "Confirm Order," not "Send to Kitchen."** There's no kitchen integration — the order goes to the staff/cashier dashboard (Story 7), not a kitchen system. The label shouldn't imply a downstream process that doesn't exist.
- **Modal content is read-only.** No steppers in the modal — quantity adjustments still happen in the cart panel before the customer taps Submit. The modal's only job is "here's what's about to be sent — confirm or go back," not another editing surface.
- **API failure keeps the modal open.** Matches the existing pattern in `Cart.tsx`'s `handleSubmit` (catch `ApiError`, show `err.message`, fallback to a generic message) — the error renders inside the modal and the customer can retry without re-reviewing the order from scratch.

## State shape

Alongside the existing `lines`, `error`, `submitting`, `cartExpanded`, add:

```ts
type Toast = { menuItemId: string; name: string } | null
const [toast, setToast] = useState<Toast>(null)
const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const [reviewOpen, setReviewOpen] = useState(false)
```

`toastTimerRef` holds the pending auto-dismiss timer so a new add can clear the previous item's timer before starting its own (prevents an earlier toast's timeout from dismissing a newer one early, and prevents leaked timers across re-renders).

## Add-to-cart + toast flow

1. Tapping an available item calls the existing `addItem`, then:
   - Clears any pending `toastTimerRef` timeout.
   - Sets `toast = { menuItemId: item.id, name: item.name }`.
   - Starts a new ~4s timeout that clears `toast` to `null`.
2. Toast renders as `"Added {name} to cart · Undo"` in a dismissible banner near the top of the screen.
3. Tapping Undo:
   - Clears the pending timeout.
   - Calls the existing `adjustQuantity(toast.menuItemId, -1)` (already handles the "drops to 0 → line removed" case).
   - Clears `toast` immediately.
4. Toast is purely additive to the existing `addItem`/`adjustQuantity` logic — no changes to cart-line semantics.

## Order review modal flow

1. Tapping "Submit order" (cart panel) no longer calls the API. It sets `reviewOpen = true` instead, provided `lines.length > 0` (unchanged disabled condition).
2. Modal renders: itemized list (name, qty, line price — read-only), a total, `error` (if set, `role="alert"`), a "Back to menu" button, and a "Confirm Order" button.
3. "Back to menu" sets `reviewOpen = false`. Cart lines are untouched.
4. "Confirm Order" runs the existing `handleSubmit` body (the `apiClient.post('/api/orders', ...)` call and `router.push` on success). `submitting` continues to disable the button and prevent double-submits, exactly as today.
5. On failure, `error` is set (existing catch logic, unchanged) and `reviewOpen` stays `true` so the message renders in the modal rather than the now-hidden cart panel.
6. Modal is a standard dialog: `role="dialog"`, `aria-modal="true"`, dismissible via Escape and backdrop tap (equivalent to "Back to menu").

## Rendering / styling notes

- Toast: fixed-position card below the page header (`top: 7.5rem`, clearing the header's rendered height), using the `--paper`/`--espresso`/`--clay-faint` on-page-card look (not `--espresso`/`--crema`) — the original top-of-viewport placement visually blended into the header, which also uses `--espresso`; this was found and fixed during manual browser verification.
- Modal: full-screen bottom-sheet overlay (`.review-modal__backdrop` / `.review-modal`) styled directly with the app's existing tokens, rather than reusing the `.ticket`/`.ticket__stub` classes from `/order/[id]` — kept as its own dedicated style since its content (line items + total + actions) doesn't match the ticket-stub's read-only receipt layout closely enough to share classes cleanly.
- No changes to `.menu-item-button`, `.cart-rail`, or `.cart-summary` structure/behavior beyond what's listed above.

## Testing

Extends `app/order/Cart.test.tsx`:

- Adding an item shows a toast with that item's name.
- Adding a second, different item replaces the toast (only one visible at a time).
- Toast auto-dismisses after the timeout elapses (fake timers, `vi.advanceTimersByTimeAsync` per the pattern established in `PendingOrdersDashboard.test.tsx`).
- Tapping Undo decrements that item's quantity by exactly 1 (and removes the line if quantity was 1), and dismisses the toast immediately.
- Undo has no effect on other lines' quantities.
- Tapping "Submit order" opens the review modal instead of calling `apiClient.post` directly.
- The review modal renders every cart line's name/qty/price and the correct total.
- "Back to menu" closes the modal without calling the API and without changing `lines`.
- "Confirm Order" calls `apiClient.post('/api/orders', ...)` with the same payload shape as today, and redirects via `router.push` on success.
- A rejected `apiClient.post` call keeps the modal open and renders the error (`role="alert"`) inside it.

## Scope boundary

Does not touch: `lib/orderService.ts`, `app/api/orders/route.ts` (already correct, covered by their own tests), Story 6's edit/cancel flow (`app/order/[id]/OrderTicket.tsx`), Story 7/8's staff dashboard.

## Parked idea

Recorded as a backlog entry in `07-epic-map.md`: replace whole-row tap-to-add with a per-item `+`/`−` stepper (matching the cart panel's existing stepper), so cart-line quantity is always visible directly on the menu item rather than only in a transient toast or the cart panel.
