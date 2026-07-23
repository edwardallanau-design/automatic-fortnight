# Counter Add-Items Implementation Plan

**Story:** 23 (user-directed, post-epic)

**Goal:** Replace the dashboard `OrderDetailModal`'s flat alphabetical `<select>` add-item control with a categorized, tappable picker laid out beside the order ticket, so staff can add items fast while a customer stands at the counter — with branch-correct availability, optimistic adds, and a new invariant preventing item changes to an already-Paid order.

**Architecture:** Two new presentational components (`MenuItemPicker`, `OrderTicketPane`) rendered as siblings inside the existing `OrderDetailModal`. Layout is CSS-driven: side-by-side at ≥768px, one-at-a-time below, with a single `activePane` state flag that is inert above the breakpoint. `PendingOrdersDashboard` gains a per-branch menu cache and optimistic add handling. One additive API change (`?branchId=` on `GET /api/menu-items`) and one new server-side invariant check. No schema change.

**Tech Stack:** Next.js App Router (client components), Prisma, Vitest + Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-23-counter-add-items-design.md`

## Global Constraints

- **No Prisma/schema changes anywhere in this plan.** `INV-16` is enforced in application code against the existing `paymentStatus` column.
- **Do not touch `app/components/Modal.tsx`.** `ISSUE-26` (Escape closes every stacked modal) is real and worth fixing, but it is a separate bug outside this story's scope. This design deliberately adds **no** new modal layer, so it is not blocked by it.
- **Do not edit the shared `.menu-item-button` / `.menu-categories` / `.menu-category` rules.** They have two existing consumers (the customer menu and admin Menu Management). Everything the picker needs is a scoped override under `.order-detail-picker`.
- **Do not redo documentation already written.** `INV-16` is already in `docs/design/02-domain-model.md` and the spec is already committed (`f1154b1`). Verify both are still present before merging; do not re-add.
- The customer-facing menu, cart, and order pages are out of scope — no files under `app/order/` are modified by this plan.
- Branch off `dev` (e.g. `feature/counter-add-items`); do not commit directly to `dev`.
- Every task ends with `npx vitest run`, `npx tsc --noEmit`, and `npx eslint .` clean (modulo `ISSUE-20`'s 2 known pre-existing errors — do not let the count grow).

---

### Task 1: `INV-16` — block item mutations on a Paid order

**Files:**
- Modify: `lib/orderService.ts`
- Modify: `lib/orderService.test.ts`

**Interfaces:**
- Changes: `assertOrderEditable(order, actorRole)` — gains a `paymentStatus` gate, inherited by `addOrderItem`, `updateOrderItemQuantity`, and `removeOrderItem`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

In `lib/orderService.test.ts`, for each of the three mutations:

- staff + `paymentStatus: 'Paid'` → throws `ConflictError`
- admin + `paymentStatus: 'Paid'` → succeeds
- staff + `paymentStatus: 'Unpaid'` → succeeds (regression guard — the existing behaviour must not change)

Cover `Paid + Pending` explicitly, not just `Paid + Confirmed` — `INV-8` makes the former legal and it is the state the counter flow actually produces.

- [ ] **Step 2: Add the gate to `assertOrderEditable`**

Place it **after** the existing fulfillment/role check so the more specific "this order is settled" message wins over the generic one:

```ts
if (order.paymentStatus === 'Paid' && actorRole !== 'admin') {
  throw new ConflictError('This order is marked Paid. Revert it to Unpaid to change items.')
}
```

The message is user-facing — it surfaces verbatim in the modal — and must name the recovery action, since `INV-9` already lets any staff member revert.

- [ ] **Step 3: Verify** all three routes inherit it (`POST`/`PATCH`/`DELETE` on `/api/orders/:id/items`) without per-route changes.

---

### Task 2: `?branchId=` on `GET /api/menu-items`

**Files:**
- Modify: `app/api/menu-items/route.ts`
- Modify/create: `app/api/menu-items/route.test.ts`

**Interfaces:**
- Produces: `GET /api/menu-items?branchId=<id>` → availability computed for that branch. Consumed by Task 6.
- Consumes: `resolveBranchId(session, requestedBranchId)` — already supports the second parameter; the route simply never passed one.

- [ ] **Step 1: Write the failing tests**

- admin session + `?branchId=<B>` → availability computed for branch B
- **branch-scoped staff session + `?branchId=<other>` → the param is ignored; availability is for the staff member's own branch.** This is a tenant-isolation guarantee, not a nicety — assert it explicitly.
- no param → unchanged from today's behaviour

- [ ] **Step 2: Read the param**

```ts
export async function GET(request: Request) {
  const session = await requireApiRole('staff')
  const { searchParams } = new URL(request.url)
  const branchId = await resolveBranchId(session, searchParams.get('branchId') ?? undefined)
  const items = await listMenuItemsWithAvailability(branchId)
  return NextResponse.json(items, { status: 200 })
}
```

Note the `GET` signature gains a `request` parameter it does not currently take. The safety property comes free: `resolveBranchId` returns `session.branchId` first when present, so a staff session cannot read another branch's availability regardless of the URL. Mirrors `/api/orders`, which already reads `branchId` from the query string.

---

### Task 3: `MenuItemPicker`

**Files:**
- Create: `app/dashboard/MenuItemPicker.tsx`
- Create: `app/dashboard/MenuItemPicker.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `MenuItemPicker({ groups, disabled, onAdd })` — consumed by Task 5.
- Consumes: `MenuGroups` and `MenuGroup<T>` from `app/components/MenuGroups.tsx`; the existing `.menu-item-button` classes.

```ts
export type PickerItem = {
  id: string
  name: string
  price: string
  available: boolean
  countOnOrder: number
}
```

- [ ] **Step 1: Write the failing tests**

- renders one heading per group, in the order given
- a row with `available: false` is `disabled` and shows the "Sold out" badge
- a row with `countOnOrder > 0` shows the count; `countOnOrder: 0` shows none
- clicking a row calls `onAdd(item.id)`; clicking a sold-out row does not
- `disabled` prop disables every row (used when the order itself is locked)

- [ ] **Step 2: Build the component**

Render `MenuGroups` with `renderItem` producing a `.menu-item-button` — matching the customer menu's structure so the sold-out badge, price alignment, hover, and focus-visible states all come for free. The count badge is a `<span className="menu-item-button__count">` immediately before the price, and is **read-only** — no stepper, no click target of its own. Quantity is changed in the ticket pane, and only there.

- [ ] **Step 3: CSS**

```css
.order-detail-picker { background: var(--crema); overflow-y: auto; /* inset shadow */ }
/* Fill the pane: the shared rule centres at max-width 480px */
.order-detail-picker .menu-categories { max-width: none; margin: 0; padding: 0.75rem; }
/* See gotcha below */
.order-detail-picker .menu-item-button { animation: none; }
.menu-item-button__count { font-family: var(--font-mono), monospace; color: var(--copper); }
```

**Gotcha — this will look like a bug if missed.** `.menu-item-button` carries `animation: menu-item-arrive` with a `--stagger-delay` (`globals.css:784-785`). Adds are optimistic, so the picker re-renders on every tap; without the `animation: none` override the whole 25-item list replays a staggered entrance animation on each add. Override under the picker's scope — do **not** edit the shared rule, which the customer menu depends on.

---

### Task 4: `OrderTicketPane`

**Files:**
- Create: `app/dashboard/OrderTicketPane.tsx`
- Create: `app/dashboard/OrderTicketPane.test.tsx`
- Delete: `app/dashboard/OrderItemsEditor.tsx`, `app/dashboard/OrderItemsEditor.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `OrderTicketPane({ order, role, busy, settleDisabled, onAdjustQuantity, onRemoveItem, onConfirm, onSetPaymentStatus, onCancelOrder })` — consumed by Task 5.
- Consumes: `ConfirmDialog`.

This is largely a **move**: the existing `OrderItemsEditor` line list and steppers, plus the total and action buttons currently inline in `OrderDetailModal`, relocated into one component so the two panes are siblings. Port the existing `OrderItemsEditor` tests rather than rewriting them.

- [ ] **Step 1: Write the failing tests**

- steppers adjust quantity; the decrease button is disabled at quantity 1
- **the remove button is absent when exactly one line remains** (`INV-2` — an order cannot reach zero items). This guard exists today as `!singleLine` (`OrderItemsEditor.tsx:70`) and must survive the move.
- remove opens `ConfirmDialog`, and confirming calls `onRemoveItem`
- the running total equals the sum of `priceSnapshot × quantity`
- `settleDisabled` disables **all four** of Confirm / Cancel / Mark Paid / Print, while leaving the steppers usable
- `busy` disables everything

- [ ] **Step 2: Build it**, preserving the existing markup and class names where they already work — this task should not change any pixels on its own.

- [ ] **Step 3:** Confirm `Print receipt` keeps its existing `paymentStatus !== 'Paid'` gate and its title hint. Its enablement is *narrowed* by `settleDisabled`, never widened.

---

### Task 5: Two-pane `OrderDetailModal`

**Files:**
- Modify: `app/dashboard/OrderDetailModal.tsx`
- Modify: `app/dashboard/OrderDetailModal.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Changes: `OrderDetailModal` gains `pickerGroups: MenuGroup<PickerItem>[]` and `settleDisabled: boolean`; drops the old flat `menuItems` prop.
- Consumes: Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests**

- when `editable`, both panes render and the dialog carries `order-detail-modal--wide`
- when **not** `editable` (staff viewing a Confirmed order), the picker does not render **and** `--wide` is absent — the read-only view stays at today's 420px
- admin viewing a Confirmed order **does** get both panes (`INV-5`)
- the pane toggle sets `activePane`; both panes remain mounted regardless
- the receipt print portal still renders

- [ ] **Step 2: Restructure**

Keep the header (`{orderingPoint.label} · #{orderNumber}`, customer name, payment note) spanning the full width, then a `.order-detail-modal__panes` grid containing the picker and the ticket. Add:

```tsx
const [activePane, setActivePane] = useState<'order' | 'add'>('order')
```

Both panes always render. `activePane` drives a `data-pane` attribute that CSS consults **only** below the breakpoint. **Do not use `window.matchMedia` or a resize listener** — no JavaScript should ask how wide the screen is.

- [ ] **Step 3: CSS**

```css
.order-detail-modal__panes { display: grid; }
.order-detail-modal__pane-toggle { /* visible by default */ }

@media (min-width: 768px) {
  .order-detail-modal--wide { max-width: 900px; }
  .order-detail-modal__panes { grid-template-columns: 45fr 55fr; }
  .order-detail-modal__pane-toggle { display: none; }
}

@media (max-width: 767px) {
  .order-detail-modal__panes[data-pane='order'] .order-detail-picker { display: none; }
  .order-detail-modal__panes[data-pane='add'] .order-detail-ticket__lines { display: none; }
}
```

Leave the existing `max-width: 420px` and the `≤480px` bottom-sheet rules untouched — they still govern the narrow and read-only cases.

- [ ] **Step 4: The signature — total pulse**

The total is the largest type on the panel, set in `var(--font-display)` (Fraunces — its only appearance in this component), pinned above the actions. On change it pulses once toward `--copper-bright`.

This is load-bearing, not decoration: optimistic adds have no network delay to signal that a tap registered, so without it a double-tap silently becomes quantity 2. Add a `.order-detail-modal__total--pulse` class keyed on total change, and neutralise it under `prefers-reduced-motion` (colour change, no transition) alongside the file's existing reduced-motion blocks.

---

### Task 6: Branch-keyed menu cache, optimistic adds, settle guard

**Files:**
- Modify: `app/dashboard/PendingOrdersDashboard.tsx`
- Modify: `app/dashboard/PendingOrdersDashboard.test.tsx`

**Interfaces:**
- Consumes: Task 2's `?branchId=`, Task 5's new props.

This is the task with the real behavioural risk. Take it in three separable steps.

- [ ] **Step 1: Write the failing tests**

- opening an order fetches `/api/menu-items?branchId=<order.branchId>`; reopening the same order does not refetch
- opening orders from **two different branches** fetches twice, once per branch
- the fetch keys on `order.branchId`, **not** the dashboard's `?branch=` filter (assert with an admin on "All branches" and two orders from different branches)
- an add renders the new line **before** the POST resolves
- a rejected add rolls the line back and surfaces the error
- a `CONFLICT` naming a sold-out item greys that row in the picker
- Confirm / Mark Paid / Print are disabled while an add is in flight and re-enable once it settles
- a failed menu fetch leaves the picker empty but the ticket pane fully usable

- [ ] **Step 2: Replace the mount-time fetch with a per-branch cache**

Delete the current mount-time `useEffect` (`PendingOrdersDashboard.tsx:45-58`) — including its `.filter(item => item.available)`, which hid sold-out items and must not survive. Replace with:

```ts
const [menuByBranch, setMenuByBranch] = useState<Record<string, PickerItem[]>>({})
```

populated on modal open for `order.branchId` when absent. Build the picker's `groups` by joining the cached items with the open order's lines to compute `countOnOrder`, grouped by category with an uncategorised bucket last (mirroring the customer menu).

- [ ] **Step 3: Optimistic add + settle guard**

Track in-flight adds so the settle actions can be gated independently of `busy`:

```ts
const [pendingAdds, setPendingAdds] = useState(0)
const settleDisabled = pendingAdds > 0
```

`handleAddItem` applies the line locally, POSTs, and **splices the response** (`POST /items` already returns the full updated `OrderWithItems`) instead of calling `refreshTabs()`. On failure it rolls the line back and sets the error; on a sold-out conflict it also marks that item unavailable in `menuByBranch`.

Apply the same splice-the-response change to `handleAdjustQuantity` and `handleRemoveItem` — all three currently call `refreshTabs()`, which re-downloads every pending and every confirmed-today order to reflect one line.

**Do not collapse `busy` and `settleDisabled` into one flag.** They are deliberately separate: `busy` locks the order during a settle operation; `settleDisabled` blocks *settling* while the displayed total is still optimistic. Merging them silently removes the guard that stops staff taking payment against a total the server has not agreed to. This is the single most important invariant in this task.

---

### Task 7: Manual verification

**Files:** none (verification only).

- [ ] Follow the `verify` skill's Docker Compose recipe with **two branches** and items sold out in one but not the other.
- [ ] As **admin** on "All branches": open an order from each branch and confirm each picker shows *its own* branch's sold-out set. This is the `ISSUE-24`-shaped bug this story fixes — it is invisible in a single-branch environment.
- [ ] As **staff**: confirm `?branchId=` cannot be used to see another branch's availability.
- [ ] Add three items in rapid succession; confirm the lines and total keep up with the tap rate, and that Confirm / Mark Paid stay disabled until they settle.
- [ ] Mark an order Paid, then attempt to add — expect the `INV-16` message. Revert to Unpaid, add, confirm it now succeeds.
- [ ] Toggle an item sold-out in a second browser, then add it in the first — expect the row to grey in place with the server's message, modal still open.
- [ ] Check the layout at ≥768px (two panes), 767px (toggle), and ≤480px (bottom sheet).
- [ ] Confirm the picker does **not** replay its entrance animation on each add.
- [ ] Update `BUILD_STATUS.md` Story 23 → `Done`, and log any non-obvious traps in the gotchas section.
