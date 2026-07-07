# Order Tile Redesign — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (staff-facing) · Follows Story 10a (`docs/superpowers/specs/2026-07-08-staff-dashboard-tabs-revision-design.md`). Post-epic, user-directed — visual redesign of `OrderCard` following manual verification of the tabs revision.

**Motivation.** After the tabs revision shipped, you flagged that the card's "Needs confirmation" badge is redundant on the Pending tab (the tab itself already says that), and asked to explore a stronger visual treatment for the order number. This was worked through visually via an Artifact mockup built with the app's actual tokens, landing on a "ticket-stub" corner tag for the order number — leaning into the paper-ticket motif `TicketCard` already uses elsewhere in this app — plus a decision to show the Paid/Unpaid badge on **every** card regardless of tab, since a Pending order can already be Paid (`INV-8`) and that's real information worth surfacing at a glance rather than requiring staff to open the modal to check.

**Scope.** Touches only `app/dashboard/OrderCard.tsx`, `app/dashboard/OrderCard.test.tsx`, and `app/globals.css`. No changes to `PendingOrdersDashboard.tsx`, `OrderDetailModal.tsx`, any API route, `lib/orderService.ts`, or any state-machine invariant — this is a pure presentational change to one component. `OrderCard`'s exported types (`OrderCardOrder`, `OrderCardItem`) and its props (`order`, `exiting`, `onOpen`) are unchanged.

## Decisions

### 1. Badge always shows Paid/Unpaid — the "Needs confirmation" state is retired

- **Problem.** The badge currently reads `order.fulfillmentStatus === 'Pending' ? 'Needs confirmation' : (paymentStatus-derived)`. On the Pending tab, every card is pending by definition — the badge repeats the tab label instead of adding information.
- **Fix.** The badge always shows the order's actual `paymentStatus` — `'Paid'` or `'Unpaid'`, literally the enum value, no derived label needed. This makes `fulfillmentStatus` unused *within `OrderCard`'s own rendering* (it stays in the `OrderCardOrder` type, since `PendingOrdersDashboard`/`OrderDetailModal` still need it to decide tab membership and modal actions — only `OrderCard`'s internal badge logic stops branching on it).

### 2. Order number becomes a ticket-stub corner tag

- **Problem.** The order number currently sits inline, right-aligned in a flex row (`.order-card__head`) next to the table name. It reads as just another field, not a strong visual anchor — and removing the badge line (Decision 1 was originally going to make it tab-conditional; it isn't now, but the header still had room to reconsider) opened space to make the number more distinctive.
- **Fix.** The order number moves to a small tag clipped to the card's top-right corner — `position: absolute`, sitting above the card's border, dark espresso background with a small triangular notch underneath (a CSS pseudo-element triangle), matching the paper-ticket visual language `TicketCard`'s `.ticket__stub` already establishes elsewhere in this app, without reusing that exact class (different shape: a stub *label* inside a ticket vs. a corner *tag* clipped to a card). The card gains `margin-top` equal to the tag's protrusion so it doesn't visually collide with the row above it in the grid, and `position: relative` so the tag can anchor to it.
- Removing the old `.order-card__head` flex row means the table name becomes a standalone block line, no longer paired with the order number in the same row.

### 3. Time and item count consolidate into one meta line, alongside the badge

- **Problem.** `.order-card__time` and `.order-card__summary` are two separate stacked spans/lines today — two lines of small grey text doing a similar job (secondary metadata).
- **Fix.** One `.order-card__meta` line: `"{time ago} · {N item(s)}"`, with the Paid/Unpaid badge inline at the end of that same line (`display: flex; gap; flex-wrap: wrap` so it still wraps sanely on narrow cards).

### 4. Total price becomes the visual focal point

- **Problem.** `.order-card__total` is currently styled the same weight/size as ordinary card text (1rem) — for a screen staff are scanning for "how much is this table's bill," the number that matters most doesn't stand out.
- **Fix.** Total price grows to 1.5rem, keeping its existing bold/mono styling, becoming the clear visual anchor at the bottom of the card.

## Testing

Extends `OrderCard.test.tsx` (existing tests already cover click handling, exiting class, singular/plural item count, and the badge/paid-class assertion from Story 10a — those keep passing largely unchanged except where they assert on markup removed by this redesign):
- Replace the "Needs confirmation" assertion with a check that the badge shows the order's `paymentStatus` verbatim (`'Paid'`/`'Unpaid'`) regardless of `fulfillmentStatus` — test both a Pending order and a Confirmed order, each Paid and Unpaid, confirming the badge text and `--paid` class are driven only by `paymentStatus`.
- Add a rendering check that the order number renders as the corner tag content (e.g. `#101` still findable via `getByText`, since the DOM structure changes but the visible text doesn't).
- Existing "renders table, order number, customer name, item count, and total" test's assertions stay valid (all the same text still renders, just in a different DOM position) — update only if the meta-line consolidation changes how item count text is queried.

## Scope boundary — do NOT touch

`app/dashboard/PendingOrdersDashboard.tsx`, `app/dashboard/OrderDetailModal.tsx`, `app/dashboard/page.tsx`, any API route, `lib/orderService.ts` — none of these need to change; `OrderCard`'s props/types are stable, so its consumers are unaffected. `TicketCard.tsx`'s own `.ticket__stub` styling is not modified or reused directly — the new `.order-card__stub` is a distinct rule serving a different shape (corner tag vs. in-card label), even though both draw on the same paper-ticket visual language.
