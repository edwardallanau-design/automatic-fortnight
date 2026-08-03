# Unconfirm & Order Audit Journal — Implementation Plan (Story 24)

**Spec:** `docs/specs/2026-07-25-unconfirm-order-audit-journal-design.md` · **Branch:** `feature/unconfirm-order-audit-journal`
**Frontier:** Task 1 → Tasks 2, 3, 5 (any order) → Task 4 (after 3) → Task 6 (last).
Work any task whose blockers are all done. All tasks `ready-for-agent`.

Domain ground (already committed on this branch, `903bdde`): `02-domain-model.md` — Unconfirm, Order Event, `INV-5`/`INV-16` (no admin exceptions), `INV-17`, fulfillment state machine · `04-architecture.md` ADR-006.

---

## Task 1 — Journal foundation + first journaled mutation (tracer bullet)

**What to build:** confirming an order leaves a permanent audit record. When staff or admin confirm, a `confirmed` journal entry exists for that order carrying the actor's role and a timestamp — written in the same database transaction as the status change, so neither can exist without the other.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] New `OrderEvent` entity via a **purely additive** migration: order reference · `action` (fixed vocabulary per spec) · `actorRole` (`customer`/`staff`/`admin`) · optional structured `payload` · created timestamp · **DB-assigned autoincrement sequence** (ordering must never rely on timestamps — ISSUE-32 lesson; batch-inserted rows share a millisecond)
- [ ] A single reusable journal-write pattern inside the order service: mutation + event insert in one transaction (`INV-17` shape); this is the pattern every later task copies
- [ ] The confirm operation journals `confirmed` with the caller's role; the route threads the session role down to the service
- [ ] Service tests assert the mutation and the journal write together through the persistence seam; route tests assert role threading; suite/`tsc` clean

## Task 2 — Journal all remaining mutations

**What to build:** every way an order can change, by any actor, produces exactly one correctly-attributed journal entry: creation (`created`, customer or staff-assisted), cancellation (`cancelled`, customer or staff), payment marking (`marked_paid`/`marked_unpaid`), payment choice (`payment_choice_set`, customer), and item edits (`item_added`/`item_removed`/`item_quantity_changed`, with the item name and quantity delta in the payload). `INV-17` is fully true when this task closes.

**Blocked by:** Task 1.

**Status:** ready-for-agent

- [ ] Each mutating service operation wraps its write + journal insert in one transaction, copying Task 1's pattern
- [ ] Customer-initiated mutations attribute `actorRole: customer`; staff-assisted creation attributes the staff/admin session role
- [ ] Every mutation's existing service tests gain a journal assertion; no mutation path exists without one
- [ ] Suite/`tsc` clean

## Task 3 — Unconfirm end-to-end

**What to build:** the supervisor override. An admin viewing a Confirmed order in the dashboard's order detail view sees an **Unconfirm** action; using it returns the order to Pending (confirmed timestamp cleared, `unconfirmed` journaled), after which the normal Pending flow applies — edit, then re-confirm (which stamps a fresh confirmation time). Staff never see the action and the API refuses them.

**Blocked by:** Task 1 (journal pattern). Not gated on Task 2.

**Status:** ready-for-agent

- [ ] New admin-guarded unconfirm endpoint following the existing API conventions; service re-checks the role and the state (legal only from `Confirmed`; otherwise the standard conflict envelope, generic `CONFLICT` code per spec)
- [ ] Unconfirm clears the confirmed timestamp so date-scoped "today" counts stay truthful; the journal preserves the original confirmation time
- [ ] Dashboard order detail: Unconfirm action rendered for admin sessions on Confirmed orders only; absent for staff; the customer surface is untouched
- [ ] An unconfirmed order behaves as an ordinary Pending order (including the customer's own cancel right — the accepted, journaled edge from the spec)
- [ ] Tests at all three seams: service (state + journal), route (403 staff / 409 wrong-state), component (affordance visibility by role)

## Task 4 — Remove the admin in-place-edit exceptions (`INV-5`/`INV-16` bind everyone)

**What to build:** Confirmed means locked, for everyone. Admin opening a Confirmed order no longer gets item editors — only Unconfirm. Item changes on a Paid order are refused for every role until it is reverted to Unpaid. The full correction dance — revert Paid (`INV-9`) → Unconfirm → edit in Pending → re-confirm → re-mark Paid — works end-to-end, each step journaled.

**Blocked by:** Task 3 — the new correction path must exist before the old one is removed, so no commit leaves admins without a way to fix orders.

**Status:** ready-for-agent

- [ ] The item-mutation guard drops both admin bypasses (fulfillment gate and paid gate); error messages steer the caller to the correction path
- [ ] The Story 12/13 in-place item-editor affordances on **Confirmed** orders are retired from the dashboard; Pending-order editing UI is unchanged
- [ ] Tests: admin refused on Confirmed and on Paid; the correction dance passes as a sequence; existing Pending-editing tests still green

## Task 5 — Per-order history view

**What to build:** staff or admin open an order's detail view and can see its chronological history — a compact list of action · actor role · time, oldest first — so a disputed ticket can be reconstructed on the spot.

**Blocked by:** Task 1 (reads whatever events exist; richer after Task 2 but not gated by it).

**Status:** ready-for-agent

- [ ] New staff-guarded read endpoint returning an order's events in sequence order, following the existing API conventions
- [ ] History list rendered in the order detail view for staff and admin; no customer-facing exposure
- [ ] Orders predating the feature render an empty history without error (no backfill, per spec)
- [ ] Tests: route guard + ordering; component renders entries and the empty state

## Task 6 — Whole-feature verification pass

**What to build:** the closing gate. Full automated suite, `tsc`, and lint compared against the `dev` baseline; then a live Docker Compose + Playwright smoke of the real flows — every prior story's live pass caught bugs jsdom could not, and this story's UI changes (modal affordances, history list) are exactly that class.

**Blocked by:** Tasks 2, 3, 4, 5.

**Status:** ready-for-agent

- [ ] Full suite green; `tsc --noEmit` clean; lint shows no findings beyond the `dev` baseline (`ISSUE-20`'s pre-existing set)
- [ ] Live smoke, per the repo's verify recipe: unconfirm as admin (state, timestamp, journal row) · refusal as staff (no button, API 403) · Paid-lock correction dance end-to-end · history list renders and orders correctly · customer order/cancel/payment-choice flow unchanged · pre-existing order shows empty history
- [ ] Any defect found is logged in `ISSUES.md` before/alongside its fix, per house rules
- [ ] `BUILD_STATUS.md`: Story 24 → Done with plan link; gotchas log updated if anything non-obvious surfaced
