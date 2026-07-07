# Cart & Order UX Polish Pass — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (customer-facing) · Follow-up to `2026-07-07-cart-add-and-order-confirm-ux-design.md` (the toast + review-modal feature just merged). Follows `07-epic-map.md` Story 5.

**Motivation.** After merging the toast/review-modal feature, manual testing surfaced feedback across three areas: (1) the toast needs a manual dismiss and better placement/motion, (2) the review modal should be a centered dialog rather than a bottom sheet, and (3) several pre-existing cart-rail bugs (not introduced by the prior feature, but now more visible since the cart rail is used more) — a scrollbar overlapping the price column, layout shift on multi-digit amounts, no press feedback on steppers, and a collapse/expand bug that shows a useless disabled-submit panel when the cart is empty, then visibly jumps when the first item is added. This pass also adds a restrained set of motion/transition polish across the order page.

**Scope.** Client-only. `app/order/Cart.tsx`, `app/order/OrderReviewModal.tsx`, `app/globals.css`. No backend, API, or schema changes.

## Decisions

### Toast

- **Position: top-right corner, not top-center.** Top-center was tried in the prior feature and worked but visually competed with the page header. Top-right reads as a distinct, out-of-the-way notification without needing a bigger repositioning relative to page content.
- **Dismiss: a dedicated `×` button, pinned to the toast card's own top-right corner** (separate from "Undo," which stays as the primary text action below the message). Chosen over "tap anywhere" because it keeps "dismiss" and "undo" as clearly distinct actions rather than overloading the whole card with one meaning.
- **Animation: fade + slide in on appear, fade + slide out on any exit path** (auto-timeout, `×`, or Undo) — all three exits animate identically, so the toast never just vanishes. Respects `prefers-reduced-motion` (see Motion section).
- Undo's underlying behavior (reverses exactly the last `+1`) is unchanged from the merged feature — only presentation changes here.

### Review modal

- **Centered dialog, not a bottom sheet.** The merged feature anchored the modal to the viewport's bottom edge (`align-items: flex-end`). Centering it (both axes) reads as a deliberate "stop and confirm" moment rather than a drawer, and avoids the bottom-sheet's slightly awkward stretch on wider (desktop-width) test/admin windows.
- **Width capped at ~420px regardless of viewport**, not fluid — prevents the dialog from stretching into an oversized box on wide screens while still fitting comfortably on a 390px phone with side margins.
- **Animation: fade + scale in on open, fade + scale out on close** (Back to menu, Escape, or backdrop tap — all identical). Respects `prefers-reduced-motion`.
- Everything else about the modal (read-only content, "Confirm Order" label, error-clears-on-close behavior) is unchanged from the merged feature.

### Cart-rail bug fixes

These are corrections to existing behavior, not new features — confirmed against the actual CSS/JSX before this doc was written:

- **Always collapsed by default, regardless of whether the cart is empty.** Root cause: `.cart-summary--collapsed` currently only applies when `lines.length > 0 && !cartExpanded` — so an *empty* cart renders the panel uncollapsed (the full, disabled "Submit order" button visibly taking up space for no reason), and the moment the first item is added, `lines.length > 0` flips true while `cartExpanded` is still `false`, causing a sudden collapse the customer didn't ask for. Fix: drop the `lines.length > 0` condition from the collapse check entirely — the rail is collapsed whenever `!cartExpanded`, full stop, whether the cart is empty or not. The toggle button stays `disabled` when empty (nothing to expand into, and the empty-state hint already communicates everything in the collapsed toggle bar itself).
- **Scrollbar no longer overlaps price.** `.cart-summary__lines` gets right-side padding so its own scrollbar (when the line list is tall enough to scroll) doesn't sit on top of `.cart-summary__line-price`.
- **Fixed-width numeric columns.** `.cart-summary__line-qty` and `.cart-summary__line-price` get explicit `min-width`s sized for realistic worst cases (e.g. a 3-digit quantity, a 4-digit price like `$1,000.00` — this is a café menu so 4-digit totals are unlikely but the fix is cheap and removes the whole class of shift), so the `-`/`+` stepper buttons never visibly shift position when a number's digit count changes.
- **Stepper press feedback.** `.cart-summary__stepper` gets an `:active` state (brief scale/opacity change, matching the existing `:active { transform: scale(0.99) }` pattern already used on `.menu-item-button` and `.table-picker__row`) so tapping `-`/`+` gives immediate visual confirmation, consistent with the rest of the app.

### Motion (targeted set)

Chosen over a minimal set (toast/modal only) or an exhaustive one (animate everything): covers every place the user called out as "static" without turning the page into a demo reel.

- **Toast** — fade + slide (covered above).
- **Review modal** — fade + scale (covered above).
- **Cart line add/remove** — when a line is added or its quantity drops to 0 and it's removed, it slides/fades rather than popping in/out instantly. Implemented as a CSS transition on the line's mount/unmount-adjacent properties (height/opacity), not a JS animation library — matches this codebase's existing approach (plain CSS `transition`/`@keyframes`, no framer-motion or similar dependency).
- **Menu items stagger-fade-in on first page load** — mirrors the existing `.order-card-arrive` keyframe pattern already used on the staff dashboard (fade + slight translateY), applied to `.menu-item-button` with a small per-item stagger delay so the list doesn't animate as one flat block.
- **`prefers-reduced-motion: reduce` is honored everywhere motion is added** — every new transition/animation gets a `@media (prefers-reduced-motion: reduce)` override that disables it, following the exact pattern already established for `.order-rail__pulse` and `.order-card` in `globals.css`.

## Implementation notes

### Cart.tsx state changes

Add a `toastVisible`/exit-animation concern to the existing `toast` state so the toast can animate out before being removed from the DOM, rather than disappearing on the same frame `setToast(null)` runs. Concretely: keep `toast: { menuItemId, name } | null` as-is, but drive the exit animation via a CSS class toggled for a short window before the actual removal — e.g. an `exiting` boolean alongside `toast`, set `true` first, then `setToast(null)` after the CSS transition's duration via a short `setTimeout`. This keeps the existing `toastTimerRef` auto-dismiss and `undoToast`/`×`-dismiss paths funneling through one `dismissToast()` helper that both paths call, instead of duplicating the fade-out sequencing in three places.

### OrderReviewModal.tsx changes

Styling-only for centering/width/animation — no prop or behavior changes. The existing `submitting`-gated dismiss guard (in `Cart.tsx`'s `onClose`) is unaffected.

### CSS-only changes

Cart-rail bug fixes (collapse condition, scrollbar padding, fixed-width columns, stepper `:active`) and the menu-item stagger-in are CSS/JSX-attribute changes with no new component state.

## Testing

Extends `app/order/Cart.test.tsx` and `app/order/OrderReviewModal.test.tsx`:

- The cart rail is rendered collapsed (`.cart-summary--collapsed` class present, or equivalent assertion) when the cart is empty, not just when it has items — regression test for the empty-state bug.
- Adding the first item to an empty cart does not change the rail's expanded/collapsed state (it was already collapsed, stays collapsed) — regression test for the jump-on-first-add bug.
- Toast's `×` button dismisses it without calling `adjustQuantity` (distinct from Undo, which does).
- Existing toast/Undo/auto-dismiss/modal-open/confirm/cancel/error tests continue to pass unchanged — this pass doesn't change any of that underlying behavior, only presentation.

Animation/motion (fade/slide/scale/stagger timing, `:active` visual state, `prefers-reduced-motion` overrides) is CSS presentation with no reliable jsdom assertion — verified via manual browser check (screenshots + reduced-motion emulation), not unit tests, consistent with how the merged feature's toast-position fix was verified.

## Scope boundary

Does not touch: `lib/orderService.ts`, `app/api/orders/route.ts`, Story 6's edit/cancel flow (`app/order/[id]/OrderTicket.tsx`), Story 7/8's staff dashboard. Does not change any submission/validation/error-handling *logic* from the merged feature — only presentation (position, dismiss affordance, motion) and the pre-existing cart-rail layout bugs listed above.
