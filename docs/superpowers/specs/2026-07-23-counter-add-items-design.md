# Counter add-items — Design

**Date.** 2026-07-23
**Status.** Proposed — awaiting approval
**Supersedes.** The `<select>`-based add-item control in `app/dashboard/OrderItemsEditor.tsx`

## Problem

A customer comes to the counter to pay for an order they placed from their table, and asks for one
more thing. Staff pull the order up on the dashboard and need to add an item — fast, with the customer
standing there, before confirming and taking payment.

Today that path is a flat, alphabetical `<select>` of all 25 menu items
(`OrderItemsEditor.tsx:86-108`), inside a 420px-wide modal. It has four problems, in descending order
of severity:

1. **It can show the wrong branch's availability.** `PendingOrdersDashboard` fetches
   `GET /api/menu-items` with no branch parameter (`PendingOrdersDashboard.tsx:46`). The route resolves
   the branch via `resolveBranchId(session)` with no requested id, which for an **admin** (whose session
   carries no `branchId`) falls through to `listBranches()[0]` — the alphabetically-first branch. An
   admin viewing Branch C's order gets Branch A's sold-out set: items available in C are missing from
   the picker, and items sold out in C are offered and then rejected. Same bug shape as `ISSUE-24`.
2. **It goes stale.** The menu is fetched once when the dashboard mounts and never again, while orders
   poll every 3–4s. A dashboard left open all morning offers breakfast's availability at lunch.
3. **Each add is slow and over-fetches.** One `+` costs `POST /items` followed by `refreshTabs()`,
   which re-downloads *every* pending order and *every* confirmed-today order — three requests across
   two sequential network waits, with `busy: true` disabling the entire modal throughout.
4. **It discards structure.** `listMenuItems` already returns each item's `category`, and the app
   already has a shared `MenuGroups` component, but line 46 maps the response down to
   `{id, name, price}` and renders one flat alphabetical list.

There is also a money hole that this work closes (see `INV-16` below): `addOrderItem` has no
`paymentStatus` guard, so items can be added to an order already marked Paid, silently raising the
total above what was collected — and `Print receipt`, gated only on Paid, will then attest to it.

## Scope

**In.**
- Replace the `<select>` with a categorized, tappable picker inside `OrderDetailModal`.
- Two-pane layout at ≥768px (picker + ticket side by side); single pane with a toggle below it.
- Branch-correct, per-open, branch-cached availability.
- Optimistic adds with a settle-guard.
- New invariant `INV-16` (no item mutations while Paid, admin excepted), enforced in
  `assertOrderEditable`.

**Out.**
- Adding items to a **Confirmed** order for staff — `INV-5` is unchanged; admin remains the only actor
  who may edit a Confirmed order.
- Creating a *second* Order for an add-on. Explicitly rejected: one Order per visit, items are added
  to it.
- Partial-payment tracking (an `amountPaid` column). Deferred — see Backlog.
- Any change to the customer-facing menu or cart.
- Search/filter in the picker. Deferred — see Backlog.

## Decisions

**D1 — The add window is `Pending`, and no invariant moves to widen it.**
Confirm is pressed when staff *handle the customer at the counter*, not when the order lands on the
dashboard. So `Pending` already means "submitted, not yet dealt with", which is exactly the add-on
window. `INV-4` is unchanged.

*Rejected:* re-gating item edits on `paymentStatus` instead of `fulfillmentStatus`. It reads well
("a tab is open until it's settled") but is unnecessary given the above, and it would erode the
deliberate independence of the two axes in `INV-8`.

**D2 — Two-pane at ≥768px, mode switch below, from one component set.**
Staff are mostly on a tablet or laptop, where a 420px column wastes the screen and hides the menu
behind a click. Both panes visible means adding is one tap with the total in peripheral vision.

*Rejected:* a stacked "Add items" modal. It would be a third layer on a stack whose Escape handling is
already broken (`ISSUE-26`), and it hides the order and total at the moment money changes hands.
*Rejected:* an inline expanding panel — the modal is `max-height: 85vh` with internal scroll, so
expanding 25 items pushes the total and the settle buttons off-screen.

**D3 — No `matchMedia`.** Both panes always render. A CSS media query decides side-by-side vs. stacked.
One state flag (`activePane: 'order' | 'add'`) controls which pane shows *below* the breakpoint and is
inert above it, as is the toggle strip that sets it. No resize listener, no hydration branch.

**D4 — Availability is fetched per-order-open, cached by branch, keyed on `order.branchId`.**
Not the dashboard's `?branch=` filter and not the session default — an admin on the "All branches" view
has no filter selected while every order on screen may belong to a different branch (`INV-13`).

The client list is a **convenience, never a correctness boundary**: `addOrderItem` already re-checks
sold-out against `order.branchId` (`orderService.ts:187-190`) and that check is authoritative. Because
the server closes the race, spending a poll every 3.5s to narrow it client-side is bad value.

*Rejected:* polling the menu alongside orders. *Rejected:* cache-invalidation on local sold-out toggle
— it only covers the case where this same browser made the change, so a second device still goes stale.

**D5 — Sold-out items render visible-but-disabled, never hidden.**
Matches the customer menu and preserves the distinction between "we're out of that" and "we don't sell
that" — the thing staff must say out loud at the counter. Today's `.filter(item => item.available)`
destroys it.

**D6 — Adds are optimistic; the settle actions are guarded.**
The line appears and the total updates immediately; the POST reconciles in the background. This is the
whole premise of D2 — a permanently visible menu invites a tap rate that a freeze-per-tap cannot serve.

The guard: **`Confirm order` / `Mark Paid` / `Print receipt` stay disabled while any add is in flight.**
For a few hundred milliseconds the displayed total is ahead of what the server has agreed to; settling
against that number could take the wrong amount from the customer. Staff may build the order as fast as
they can tap, but may not *settle* it until screen and server agree. This replaces today's
all-or-nothing `busy`.

**D7 — Splice the POST response instead of refetching.**
`POST /api/orders/:id/items` already returns the fully updated `OrderWithItems`
(`app/api/orders/[id]/items/route.ts:22`). Using it removes two requests and a whole-list download per
tap. Applies to quantity-adjust and remove as well.

**D8 — Whole-row tap, read-only count badge; steppers stay in the ticket.**
The picker reuses `.menu-item-button`, so it inherits the 44px touch target, the sold-out treatment,
and the copper hover/focus states for near-zero new CSS.

*Rejected:* a stepper on each picker row. With both panes visible that puts two controls for the same
number six inches apart. The picker reports what's on the order; the ticket is where it changes. One
owner per number.

**D9 — `INV-16`: no item mutations while Paid, admin excepted.** See Domain model.

## Domain model

One new invariant, added to `docs/design/02-domain-model.md`:

> `INV-16` An Order's OrderItems may not be added, removed, or have their quantity changed while
> `paymentStatus = Paid`, **except by Owner/Admin**. Staff must first revert `paymentStatus` to
> `Unpaid` (permitted by `INV-9`) before changing a Paid order's contents. This gate is independent of
> `INV-4`/`INV-5`'s fulfillment gate — **both** must pass.

Rationale for the admin exception: the domain model already makes Owner/Admin "the only actor who may
modify a Confirmed order (correcting a staff/customer mistake after the fact)". `Paid + Confirmed` is
precisely the state in which a mistake is most likely to be *discovered*, so a lock that applied to
everyone would remove the correction path for the case that most needs one. Same actor hierarchy as
`INV-5`, no new concept.

*Rejected:* auto-reverting to Unpaid on add. It's cheaper but destroys the fact staff need — after the
revert the screen says Unpaid with no memory that $10 was collected, inviting a re-collection of the
full total. It trades a small shortfall for a large overcharge.

No schema change. No new glossary terms — this feature adds no domain vocabulary.

## Visual design

The palette, type, and component vocabulary are already established and are **not** being extended:
fixed warm-dark theme (`--background: #1c1410`, `--paper: #241a14` as the raised surface,
`--espresso: #f7eee1` as foreground), Fraunces / Inter / JetBrains Mono for display / body / utility.
`.menu-categories` + `.menu-item-button` already have two consumers — the customer menu and admin Menu
Management — and the picker is a third instance of that pattern, not new territory.

Two decisions are genuinely open, and both concern hierarchy rather than style.

**Pane weight is asymmetric, not 50/50.** Most times staff open a Pending order it is to confirm and
take payment, *not* to add items — so a layout that gives the picker equal weight optimises the minority
case. The ticket pane is the document being assembled and gets the raised surface (`--paper`), the
larger type, and the actions. The picker is the shelf you take from: recessed onto `--crema`, inset
shadow, no card borders competing with the ticket. Roughly 45/55 in the ticket's favour. It also matches
the physical thing — the counter is lit, the shelf is in shadow.

**Signature: the total is the hero, and it reacts.** In a POS the total is what both people at the
counter look at. It is the largest type on the panel, set in Fraunces (its only appearance here — the
rest is Inter and Mono), pinned to the bottom of the ticket pane above the actions. On change it pulses
once — a brief weight/colour shift toward `--copper-bright`, not a slide or a count-up.

That pulse is doing real work, not decoration: because adds are optimistic (D6) there is no network
delay to signal that a tap registered, and a silent double-tap would otherwise become quantity 2
unnoticed. The count badge is the durable signal; the pulse is the transient one. Everything else on
the panel stays quiet so this is the one thing that moves.

Respects `prefers-reduced-motion` by dropping to a colour change with no transition.

## Components & data flow

### `app/dashboard/MenuItemPicker.tsx` (new)

Renders `MenuGroups` over categorized, availability-annotated items.

```
props: {
  groups: MenuGroup<PickerItem>[]   // PickerItem: { id, name, price, available, countOnOrder }
  busy: boolean                     // only true when the order itself is locked (Paid/Confirmed)
  onAdd: (menuItemId: string) => void
}
```

- Each row is a `.menu-item-button` (whole-row tap → `onAdd`), `disabled` when `!available`.
- `countOnOrder > 0` renders a `.menu-item-button__count` badge — JetBrains Mono, `--copper`,
  immediately left of the price. Read-only.
- Uncategorized items group under a trailing "Other" heading, matching the customer menu.

**Gotcha:** `.menu-item-button` carries `animation: menu-item-arrive` with a `--stagger-delay`
(`globals.css:784-785`). In the picker that animation must be suppressed — the list re-renders on every
optimistic add, so it would re-fire 25 staggered animations per tap. Override with `animation: none` under
the picker's scope rather than editing the shared rule.

### `app/dashboard/OrderTicketPane.tsx` (new)

The existing `OrderItemsEditor` line list, plus the total and the settle actions, extracted so the two
panes are siblings.

- Keeps the `!singleLine` guard on the remove button (`INV-2` — an order cannot reach zero items).
- Owns the quantity steppers.
- Renders the total and, beneath it, `Confirm order` / `Cancel order` / `Mark Paid` / `Print receipt`.
- `settleDisabled` (distinct from `busy`) disables the settle actions while any add is in flight (D6).

### `app/dashboard/OrderDetailModal.tsx` (modified)

- Holds `activePane` state and the toggle strip (`.order-detail-modal__pane-toggle`, hidden ≥768px).
- Applies `order-detail-modal--wide` **only when `editable`** — a read-only Confirmed view has no
  picker and stays at the current 420px.
- Renders `MenuItemPicker` + `OrderTicketPane` as siblings inside a grid.
- Header (`{orderingPoint.label} · #{orderNumber}`, customer name, payment note) spans both panes.
- Unchanged: the receipt print portal, `useReceiptPrintTarget`, `useReceiptPageSize`.

### `app/dashboard/PendingOrdersDashboard.tsx` (modified)

- Replace the mount-time menu fetch with `menuByBranch: Record<string, PickerItem[]>` populated on
  modal open for `order.branchId` if absent (D4).
- `handleAddItem` becomes optimistic: apply the line locally, `POST`, splice the response on success
  (D7); on failure roll the line back and set the error.
- On a `CONFLICT` naming a sold-out item, additionally mark that item unavailable in the branch cache so
  the picker greys it immediately.
- Track in-flight adds (a counter or `Set` of pending ids) to drive `settleDisabled`.

### `app/api/menu-items/route.ts` (modified)

```ts
const { searchParams } = new URL(request.url)
const branchId = await resolveBranchId(session, searchParams.get('branchId') ?? undefined)
```

`resolveBranchId` already accepts a requested id and already prioritises `session.branchId` over it —
so a branch-scoped staff session is unaffected and cannot read another branch's availability. Mirrors
`/api/orders`, which already reads `branchId` from the query string. Additive; existing callers keep
today's behaviour.

### `lib/orderService.ts` (modified)

`assertOrderEditable` gains the `INV-16` check, so `addOrderItem`, `updateOrderItemQuantity`, and
`removeOrderItem` all inherit it from one place:

```ts
if (order.paymentStatus === 'Paid' && actorRole !== 'admin') {
  throw new ConflictError('This order is marked Paid. Revert it to Unpaid to change items.')
}
```

### CSS — `app/globals.css`

- `.order-detail-modal--wide` — `max-width: 900px` at ≥768px; the existing `max-width: 420px` and the
  ≤480px bottom-sheet treatment are untouched for the narrow/read-only case.
- `.order-detail-modal__panes` — `display: grid`; `grid-template-columns: 45fr 55fr` at ≥768px, single
  column below.
- `.order-detail-picker` — recessed: `background: var(--crema)`, inset shadow, own `overflow-y: auto`.
  Resets `.menu-categories`' `max-width: 480px; margin: 0 auto` to fill the pane.
- `.order-detail-ticket` — raised on `--paper`, own `overflow-y: auto`, total + actions pinned at its
  foot.
- `.order-detail-modal__total--pulse` — the signature pulse; no-op under `prefers-reduced-motion`.
- `.order-detail-modal__pane-toggle` — `display: none` at ≥768px.
- `.menu-item-button__count` — mono, `--copper`.

## Error handling

| Case | Behaviour |
|---|---|
| Add fails, item sold out (`409 CONFLICT`) | Roll the optimistic line back, mark the item unavailable in the branch cache so the row greys in place, show the server message. Modal stays open. |
| Add fails, order not editable (`409`) | Roll back, show the message. Covers `INV-16` and a concurrent confirm by another device. |
| Add fails, network/500 | Roll back, show a generic message. The next successful mutation re-syncs from its response. |
| Menu fetch fails on modal open | Picker renders empty with "Menu unavailable — reopen the order to retry." The ticket pane still works, so confirm/pay is never blocked by it. |
| Settle attempted with an add in flight | Not reachable — the buttons are disabled (D6). |

## Testing

Per `06b` §7. New/updated unit tests:

- `MenuItemPicker` — groups by category; sold-out rows disabled with the badge; count badge reflects
  quantity on the order; whole-row tap fires `onAdd`.
- `OrderTicketPane` — steppers adjust; last remaining line's remove button is absent (`INV-2`);
  `settleDisabled` disables all four settle actions.
- `OrderDetailModal` — two panes render when editable; read-only Confirmed view renders neither the
  picker nor `--wide`; the toggle sets `activePane`.
- `PendingOrdersDashboard` — optimistic add shows the line before the POST resolves; a rejected add
  rolls it back; a sold-out 409 greys the row; the branch cache is keyed on `order.branchId`, and
  opening two orders from different branches fetches twice.
- `orderService` — `INV-16`: staff add/adjust/remove on a Paid order each throw `ConflictError`; admin
  succeeds on all three; an Unpaid order is unaffected.
- `app/api/menu-items` — `?branchId=` is honoured for an admin session and *ignored* for a
  branch-scoped staff session.

Manual: multi-branch smoke test per `verify` — as admin on "All branches", open orders from two
different branches and confirm each picker shows its own branch's sold-out set.

## Backlog

- **`amountPaid` / partial payment.** The truthful model for pay-then-add is showing the shortfall
  (`Paid $10.00 · Total $12.75 · $2.75 due`), which needs a money column and turns `Paid` from a state
  into an amount. Deferred: it brushes against `01-intent-and-constraints.md`'s "No payment *processing*
  or verification in-app" non-goal. `INV-16` blocks the error instead of measuring it.
- **Search/filter in the picker.** 25 items across 4 categories scrolls fine, and on a tablet a search
  field throws an on-screen keyboard over half the picker. Revisit around 40+ items.
- **Fix `ISSUE-26` first.** This design deliberately adds no modal layer, so it isn't blocked — but the
  picker raises interaction density inside a modal whose stacked children still mishandle Escape.
