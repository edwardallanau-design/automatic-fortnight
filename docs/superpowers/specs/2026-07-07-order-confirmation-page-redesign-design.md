# Order Confirmation Page (`/order/[id]`) Redesign — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (customer-facing) · Builds on Story 6 (`docs/superpowers/specs/2026-07-06-story-6-customer-edit-cancel-order-design.md`) and the recent cart UX polish passes (`2026-07-07-cart-add-and-order-confirm-ux-design.md`, `2026-07-07-cart-ux-polish-design.md`). Follows `07-epic-map.md` Story 6.

**Motivation.** The confirmation page (`/order/[id]`, referred to in `07-epic-map.md` as "the order-confirmation screen") visually diverges from the rest of the customer-facing flow: it has no branded header band (unlike `/order`), its per-line layout doesn't form real columns, its Remove control is an untouchable-feeling underlined text link, there's no way back to the menu, and Remove/Cancel fire immediately with no confirmation step. This pass brings the page in line with the rest of the app's design language and adds the missing safeguards.

**Scope.** Client/presentation-only. Touches `app/order/[id]/page.tsx`, `app/order/[id]/OrderTicket.tsx`, `app/globals.css`, plus one new shared presentational component and one new shared confirm-dialog component (both colocated under `app/order/[id]/`, following this codebase's "component lives with the feature that uses it" convention — no new `components/ui` folder). No changes to `lib/orderService.ts`, the DELETE routes, or any domain-model invariant/state machine.

## Decisions

### 1. Shared header band + back-to-menu link

- **Problem.** `/order/[id]` currently renders a bare `<main className="order-page">` with the `.ticket` card floating with no header — while `/order` has a dark `.order-header` band (eyebrow + italic serif title, 3px copper bottom border). This is the main source of the "doesn't match the menu page" feel.
- **Fix.** Add the same `.order-header` band to `page.tsx`, rendered **once**, above the branch logic — so it's shared by the not-found, Cancelled, Confirmed, and Pending states rather than repeated per branch. Eyebrow reads `ORDER #<orderNumber>`; title stays "Your Ticket" (or equivalent short label — exact copy decided at implementation time, matching the existing serif/italic header style).
- **Back button.** A "Back to menu" link/button lives in this same header, pointing at `/order?table=${order.table.id}` — `getOrderById` already includes the `table` relation (`lib/orderService.ts`, `include: { items: true, table: true }`), so no new data fetch is needed. Shown on **all** states (Pending, Confirmed, Cancelled) per your decision — it's pure navigation, not a state mutation, so it's safe even on a locked/Confirmed order.
- **Not-found exception.** The not-found branch (`NotFoundError`) has no `order.table` to link back to, so it keeps its current header-less plain error layout — there's nothing sensible to "go back" to from an invalid order id.

### 2. Column-aligned ticket lines

- **Problem.** `.ticket__line` is `display: flex; justify-content: space-between` with a *variable* child count — 2 spans normally, a 3rd (Remove link) on editable multi-line rows — so `space-between` redistributes differently row to row instead of forming real columns. This is the same class of bug the cart rail had (`2026-07-07-cart-ux-polish-design.md`: "Fixed-width numeric columns"), already fixed there but never applied here.
- **Fix.** Give each ticket line a fixed-column layout, mirroring `.cart-summary__line-qty`/`.cart-summary__line-price`:
  - **Name** — flex-grow, wraps/truncates as needed.
  - **Qty** — fixed `min-width: 3ch`, centered, `font-family: var(--font-mono)`.
  - **Price** — fixed `min-width: 6ch`, right-aligned, `font-family: var(--font-mono)`.
  - **Remove** — fixed 44×44px icon-button column, present only on editable rows (Pending, >1 line); absent (not just hidden) on read-only/Confirmed/Cancelled rows and on the single remaining line, so the grid still lines up without an empty gap column when it's never shown for a given order state.

### 3. Remove control becomes a real button

- **Problem.** `.ticket__remove` is an underlined red text link with no hover/`:active` feedback, unlike every other interactive control in the app (`.menu-item-button`, `.cart-summary__stepper` both have hover border-color + `:active { transform: scale(...) }`).
- **Fix.** Replace it with a small bordered, rounded icon button (a "×" glyph, `aria-label="Remove {item name}"` preserved for a11y), same 44px touch-target discipline, `hover` → border-color shifts toward `--danger` (see below), `:active` → `transform: scale(0.99)` (or a same-order factor as `.cart-summary__stepper`'s `0.92` — implementation detail), `:focus-visible` outline, and `@media (prefers-reduced-motion: reduce)` disabling the transform, matching every other button in this file. `.ticket__cancel` gets the same missing `:active` scale rule added (it already has the right sizing/border, just no press feedback).
- Clicking Remove no longer calls the API directly — it opens the new confirm dialog (below); the dialog's own confirm button is what actually triggers the DELETE.

### 4. Confirmation dialogs for Cancel and Remove

- **Problem.** Neither destructive action has any confirmation today — `OrderTicket.tsx`'s `mutate()` fires the DELETE the instant Remove or Cancel is clicked. The only confirm-before-action precedent in the codebase is a plain, unstyled `window.confirm()` on the *staff* dashboard, guarding a non-destructive action — not a pattern to copy.
- **Fix.** A new shared `ConfirmDialog` component (colocated at `app/order/[id]/ConfirmDialog.tsx`), built on the exact modal chrome `OrderReviewModal` already established: centered card, dimmed backdrop (`color-mix(in srgb, var(--espresso) 60%, transparent)`), `role="dialog"` / `aria-modal="true"`, Escape-key and backdrop-tap to close, an `exiting`-flag-driven CSS fade+scale-out (matching `review-modal-enter`/`--exiting` keyframes and timing), and `prefers-reduced-motion` override. New parallel CSS classes (e.g. `.confirm-dialog__backdrop`, `.confirm-dialog`) are added rather than renaming/reusing `OrderReviewModal`'s existing classes, to avoid touching already-tested markup/selectors.
  - Props: `title`, `message`, `confirmLabel`, a `danger` flag (styles the confirm button with the new `--danger` token instead of copper), `busy` (reuses `OrderTicket`'s existing `busy` state to disable both buttons mid-request), `onConfirm`, `onClose`.
  - Used twice from `OrderTicket.tsx`:
    - Remove: title "Remove item?", message "Remove {nameSnapshot} from your order?", confirm label "Remove".
    - Cancel: title "Cancel this order?", message "Staff won't receive it, and this can't be undone.", confirm label "Cancel order".
  - `OrderTicket.tsx` adds a small piece of state to track which dialog (if any) is open and for which item (e.g. a discriminated union: remove-for-item-X vs cancel vs none) plus the existing `exiting` pattern already used elsewhere in this codebase (`Cart.tsx`'s toast/modal exit timers) for a consistent close animation. The dialog's confirm button calls the existing `mutate(path)` — that function's DELETE + `router.refresh()` + error-handling logic is unchanged.

### 5. New `--danger` design token

- **Problem.** Destructive-action red is currently ad hoc and inconsistent: `#b91c1c` (`.ticket__remove`, `.ticket__cancel`, `.review-modal__error`), `#c0392b` (`.order-card__error`), `#e8a05a` (`.cart-summary__error`, actually an amber, not red) — four different values doing the same conceptual job across the CSS token system that otherwise names everything (`--espresso`, `--copper`, `--sage`, `--clay`).
- **Fix.** Add one `--danger` custom property to `:root` (and a dark-mode-adjusted value in the existing `prefers-color-scheme: dark` block, following the same pattern as `--espresso`/`--crema`/`--paper`/`--clay` already do) and repoint `.ticket__remove`, `.ticket__cancel`, `.confirm-dialog`'s danger confirm button, and `.review-modal__error` onto it. `.cart-summary__error` and `.order-card__error` are **not** touched — they're an unrelated existing warning/error color outside this page's scope; consolidating those is a separate cleanup, not part of this pass.

### 6. De-duplicating the three ticket states

- **Problem.** `page.tsx` currently hand-writes the `.ticket` markup three separate times (Cancelled inline, Confirmed inline, Pending via `<OrderTicket>`) — the same structure with small variations (status note text, presence of Remove/Cancel controls). Since the header, back-button, and column-layout changes above need to land consistently across all three (per the "all three states" scope decision), leaving the triplication in place would mean making the same change three times, twice more than necessary, and risking the three states drifting apart again later.
- **Fix.** Extract the read-only ticket markup (label, order number, customer name, column-aligned line list, total, status note) into one shared presentational component, `TicketCard` (colocated at `app/order/[id]/TicketCard.tsx`). It takes the ticket data plus an optional per-item `onRemove` callback slot (undefined ⇒ no Remove column rendered for that state) and an optional `cancelSlot`/`onCancel` (undefined ⇒ no Cancel button rendered). `page.tsx`'s Cancelled/Confirmed branches render `<TicketCard>` directly with no callbacks (fully read-only); `OrderTicket.tsx` renders `<TicketCard>` with its `onRemove`/`onCancel` wired to open the new confirm dialogs. This is a plain function component (no hooks/browser APIs), so it works from both the server-rendered branches in `page.tsx` and the client `OrderTicket.tsx` without needing `'use client'` itself.

## Testing

Extends the existing co-located tests, per `06b-engineering-decisions.md` §7 (Vitest + RTL):

- **`OrderTicket.test.tsx`** (updated, not just extended): existing "Remove fires the item DELETE" / "Cancel fires the order DELETE" tests now assert that clicking Remove/Cancel opens the `ConfirmDialog` first (`apiClient.del` is *not* called yet), and that confirming the dialog is what triggers the DELETE + `router.refresh()`. New tests: dialog closes without calling the API on "Never mind"/Escape/backdrop-tap; single-line state still hides the Remove column entirely (not just the button); a `409` still renders the existing inline alert after the dialog's confirm action fails.
- **`page.test.tsx`** (extended): asserts the header band and "Back to menu" link (pointing at `/order?table=<id>`) render for not-found (header/back-link absent), Cancelled, Confirmed, and Pending states.
- **New `ConfirmDialog.test.tsx`**: renders title/message/labels from props; Escape and backdrop-click call `onClose`; confirm button calls `onConfirm`; both buttons disabled when `busy`.
- **New `TicketCard.test.tsx`** (or folded into `OrderTicket.test.tsx`/`page.test.tsx` if small enough — decided at planning time): column structure renders correctly with and without `onRemove`/`onCancel` supplied.
- Animation/motion (fade+scale enter/exit, `:active` press feedback, `prefers-reduced-motion` overrides) is CSS presentation with no reliable jsdom assertion — verified via manual browser check, consistent with how `2026-07-07-cart-ux-polish-design.md`'s motion work was verified.

## Scope boundary — do NOT touch

`lib/orderService.ts`, `app/api/orders/[id]/route.ts`, `app/api/orders/[id]/items/[itemId]/route.ts` (all already correct, covered by their own tests) — no change to the `Pending`/`Confirmed`/`Cancelled` state machine or the last-item-blocked invariant. Story 7/8's staff dashboard (`PendingOrdersDashboard.tsx`) and its `window.confirm()` usage are untouched — that's a separate, non-destructive confirmation on the staff side, out of scope here. `Cart.tsx` / `OrderReviewModal.tsx` are not modified beyond what's needed to keep `.review-modal__error` pointed at the new `--danger` token (a one-line value change, not a structural change).
