# Staff Dashboard: Tabs Revision — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (staff-facing) · Revises Story 10 (`docs/superpowers/specs/2026-07-08-staff-dashboard-live-redesign-design.md`) based on your manual verification of that build. Post-epic, user-directed.

**Motivation.** After verifying Story 10's three-way split (Pending lane / Confirmed & Unpaid lane / collapsed "Completed today" count, all on one scrollable page), you asked for something simpler and more literal: two real tabs — **Pending** and **Confirmed** — where Confirmed is the day's full history (paid and unpaid alike), and marking an order Paid is just a flag with no routing consequence. This also happens to remove the exact class of bug the final review caught in Story 10 (an optimistic count update that could drift from the server's `date=today` filter) — there's no longer a count to keep in sync, since the Confirmed tab's own list length is the count.

**Scope.** Touches `app/dashboard/PendingOrdersDashboard.tsx` (substantial rewrite), `app/dashboard/OrderCard.tsx` (badge logic), `app/dashboard/OrderDetailModal.tsx` (drop the Confirm button's lane-exit framing — no code change to its own file expected, since it never contained the lane-routing logic itself, but its caller's behavior changes), and `app/globals.css` (remove the completed-today chip styles, add tab-switcher styles). No changes to `lib/orderService.ts`, `app/api/orders/route.ts`, or `app/api/orders/[id]/status/route.ts` — Story 10's `date=today`/`paymentStatus` filters are reused as-is, just combined differently by the client. No changes to `confirmOrder`/`setPaymentStatus`/`cancelOrder`/`removeOrderItem` or any state-machine invariant — `INV-4/5/8/9` are unchanged, including the admin-only Paid→Unpaid revert rule, which stays exactly as built.

## Decisions

### 1. Two tabs, both polling continuously in the background

- **Problem.** Story 10 rendered Pending and Confirmed & Unpaid as two always-visible lanes on one page, plus a separate collapsed "Completed today" count for Confirmed & Paid orders — three visual states driven by a `fulfillmentStatus` × `paymentStatus` matrix.
- **Fix.** A real tab switcher: `activeTab: 'pending' | 'confirmed'` local state, with only the active tab's list rendered. **Pending** fetches `GET /api/orders?status=pending` (unchanged from today). **Confirmed** fetches `GET /api/orders?status=confirmed&date=today` — reusing the `date=today` filter Story 10 already built (scoped by `confirmedAt`), but **without** the `paymentStatus` filter, so it shows every order confirmed today regardless of payment status. Both endpoints are polled every 3.5s continuously, regardless of which tab is active — so the tab label can carry a live count (e.g. "Confirmed (12)") even while viewing Pending, and switching tabs never shows stale data from before the last poll.
- The `completedTodayCount` state, the `summaryBump` animation, and the `.order-rail__summary` chip are removed entirely — the Confirmed tab's list length is the count now, with no separate figure to keep in sync.

### 2. Payment toggle becomes a plain, no-side-effect flag

- **Problem.** Story 10's `handleSetPaymentStatus` branched on which lane the order was in: marking a Confirmed & Unpaid order Paid triggered an exit animation and moved it into the collapsed count. This was the exact mechanism that produced the counter-flicker bug the final review caught (the "Confirmed & Unpaid" lane wasn't date-scoped, but the count it fed into was).
- **Fix.** Marking Paid/Unpaid **never** moves an order between tabs or triggers an exit animation — it's a plain in-place field update, full stop, regardless of which tab the order is currently in. The **only** transition that still uses the exit-animation machinery (the `exitingIds` set + 200ms `setTimeout`, carried over from Story 10) is the Pending → Confirmed transition itself, when staff taps "Confirm order" — and even there, only the *departure* side is optimistic: the card fades out of the Pending tab's local state immediately (no waiting on a poll to notice it's gone). Its *arrival* on the Confirmed tab is **not** optimistically pushed into local state — it's left entirely to the next background poll of `status=confirmed&date=today` (≤3.5s later, already running per Decision 1 regardless of which tab is active). This is a deliberate simplification over Story 10, which optimistically pushed the just-confirmed order into a second local array — that mechanism was the source of Story 10 final-review's noted "duplicate-entry risk if a poll lands mid-exit-window" (a poll refreshing the list at the same moment the optimistic push runs could produce two entries with the same key). Relying on the poll alone for arrival removes that risk class entirely, at the cost of a sub-4-second delay before a freshly-confirmed order appears if you're already on the Confirmed tab when you confirm it from Pending.
- The underlying rule is unchanged: staff can mark an order Paid; only admin can revert Paid → Unpaid (`INV-9`). A still-Pending order can still be marked Paid before it's confirmed (`INV-8` — payment and confirmation transition independently) — this stays exactly as it works today; the order simply stays in the Pending tab either way until someone taps Confirm.
- `OrderDetailModal`'s action set is unchanged in shape (Pending → Confirm + payment toggle; Confirmed → payment toggle only, admin-only revert) — only its caller's post-mutation behavior in `PendingOrdersDashboard.tsx` simplifies.

### 3. Card badge reflects status plainly, not lane membership

- **Problem.** `OrderCard`'s badge currently reads "Needs confirmation" (Pending) or "Awaiting payment" (Confirmed & Unpaid) — the second label was really describing *which lane the card was in*, not the order's own state, and has no meaning once Confirmed & Unpaid stops being a distinct lane.
- **Fix.** Badge becomes a direct reflection of the order's own two independent fields: on the Pending tab, always "Needs confirmation" (unchanged). On the Confirmed tab, "Paid" or "Unpaid" — a plain status readout, not an instruction.

## Testing

Extends `PendingOrdersDashboard.test.tsx` per this repo's existing conventions (Vitest + RTL, `vi.advanceTimersByTimeAsync` for polling/exit-timer assertions, established in Story 7/10):
- Tab switching renders only the active tab's list; the inactive tab's data is still being polled in the background (assert a poll call to both endpoints happens regardless of which tab is active, and that the tab label reflects an up-to-date count without switching to it).
- Marking a Confirmed order Paid updates its badge in place, on the Confirmed tab, without the card disappearing or animating out.
- Marking a still-Pending order Paid keeps it on the Pending tab, unchanged from Story 10's existing coverage.
- Confirming a Pending order still exits via the animation and appears on the Confirmed tab (poll-driven, since there's no more direct local list mutation into a second lane to assert against — the confirmed order will show up via the next poll tick to the `status=confirmed&date=today` endpoint, same as any other externally-confirmed order).
- Admin-only Paid→Unpaid revert (`INV-9`) re-verified unchanged.

## Scope boundary — do NOT touch

`lib/orderService.ts`, `app/api/orders/route.ts`, `app/api/orders/[id]/status/route.ts`, `app/components/Modal.tsx`, `app/order/[id]/OrderStatusPoller.tsx` — all already correct and unaffected by this revision. Cancelled orders remain out of scope for the dashboard (no tab or count), per Story 10's original decision — unchanged here. No schema or invariant changes.
