# Unconfirm & Order Audit Journal — Design Spec

**Date:** 2026-07-25 · **Triage:** `ready-for-agent` · **Branch:** `feature/unconfirm-order-audit-journal`
**Design session:** `/grill-with-docs`, 2026-07-24/25 (Product re-declaration + this feature)
**Domain/architecture decisions already landed on this branch:** `02-domain-model.md` (Unconfirm, Order Event, `INV-5`/`INV-16` amendments, `INV-17`, fulfillment state machine) · `04-architecture.md` ADR-006 · `ISSUES.md` ISSUE-33.
**First artifact of the `/to-spec` → `/to-tickets` → `/implement` workflow** (superpowers tree is a frozen archive).

## Problem Statement

Once staff confirm an order, it is supposed to be final "for the books" — but today the system quietly contradicts that: Owner/Admin can edit a Confirmed order's items **in place** (the old `INV-5` exception, Story 12), and a Paid order's items in place too (the old `INV-16` exception). Nothing records that these corrections happened, who made them, or what changed. For the committed pilot client this is a real operational and trust gap: order records can silently diverge from what was actually made and what money was actually collected, and the legitimate restaurant reality — "the order changed after confirmation, call a supervisor" — has no honest, attributable path in the system.

## Solution

Make Confirmed genuinely final for **everyone**, and make the supervisor override an explicit, journaled state transition instead of a silent edit:

- A new **Unconfirm** action (Owner/Admin only) returns a Confirmed order to Pending. Contents are then corrected under the ordinary Pending rules and the order is re-confirmed. The in-place edit paths on Confirmed and Paid orders are removed for all roles, admin included.
- A new **order audit journal** (`OrderEvent`) records every order mutation — creation, confirm, unconfirm, cancel, paid/unpaid, payment choice, item add/remove/adjust — with the action, the actor's **role**, and a timestamp, written in the same database transaction as the mutation itself (`INV-17`). The journal is append-only: no update or delete path exists for any role.
- Staff and Owner/Admin can read an order's event history from the order detail view, so a disputed ticket can be reconstructed.

The supervisor-override pattern (manager PIN to modify a sent ticket, logged on the owner's report) is standard POS practice; this implements it with this system's existing role model. Attribution is deliberately role-level (shared credentials, ADR-003): `unconfirm · admin · 14:03` cross-referenced with the shift roster names the human at this pilot's scale. ADR-006 records the revisit triggers.

## User Stories

1. As an Owner/Admin, I want to unconfirm a Confirmed order back to Pending, so that a mistaken confirmation or a changed order can be corrected without silent edits.
2. As an Owner/Admin, I want an unconfirmed order to become an ordinary Pending order, so that its items can be corrected under the normal Pending rules and then re-confirmed — no special half-state.
3. As a Staff member, I want the Unconfirm action to be unavailable to me (UI and API), so that changing a settled order always requires supervisor authority.
4. As an Owner/Admin, I want in-place editing of Confirmed orders removed for everyone including myself, so that every post-confirmation change is an explicit, journaled state transition (`INV-5`).
5. As an Owner/Admin, I want item changes on a Paid order to be impossible for every role until it is reverted to Unpaid (`INV-9` → `INV-16`), so the recorded total can never silently outrun the money collected.
6. As an Owner/Admin, I want every order mutation journaled — creation, confirm, unconfirm, cancel, paid/unpaid, payment choice, item add/remove/adjust — so the books carry a complete history (`INV-17`).
7. As an Owner/Admin, I want each journal entry to record the action, the actor's role, and a timestamp, so corrections are attributable via the shift roster without new login machinery.
8. As an Owner/Admin, I want the journal to be append-only with no edit or delete path for any role, so the record is tamper-evident even against privileged users.
9. As a Staff member or Owner/Admin, I want to see an order's chronological event history in the order detail view, so I can reconstruct what happened to a disputed ticket.
10. As a Customer, I want my ordering, cancellation, and payment-choice flows unchanged, so this feature costs me nothing.
11. As a Customer whose order was unconfirmed, I want it to behave exactly like any Pending order — including my own cancel right (`INV-6`) — an accepted, journaled edge rather than a special case.
12. As an Owner/Admin, I want unconfirming to clear the order's confirmed timestamp and re-confirming to stamp a fresh one, so date-scoped dashboard counts ("today") stay truthful; the journal preserves the original confirmation time.
13. As an Owner/Admin, I want unconfirming a non-Confirmed order rejected with a conflict error, so a stale dashboard can't bypass the state machine.
14. As an Owner/Admin, I want a dead Confirmed order to be killable only via Unconfirm → Cancel — two journaled steps — so no single tap can erase a settled order (`Confirmed → Cancelled` stays illegal).
15. As the vendor planning future integrations (verified payment webhook, analytics, kitchen display), I want the journal to be the transactional-outbox seed, so push semantics can be added later by accretion, not re-architecture (ADR-006).

## Implementation Decisions

- **New `OrderEvent` entity** (additive migration only): reference to its Order · `action` from a fixed vocabulary (`created`, `confirmed`, `unconfirmed`, `cancelled`, `marked_paid`, `marked_unpaid`, `payment_choice_set`, `item_added`, `item_removed`, `item_quantity_changed`) · `actorRole` (`customer` / `staff` / `admin`) · optional structured `payload` for the change detail (e.g. item name + quantity delta, previous → new value) · creation timestamp · a **DB-assigned autoincrement sequence** for stable ordering — per the ISSUE-32 lesson, rows created in one transaction share a timestamp, so ordering must come from a sequence, never a clock.
- **`INV-17` enforcement shape:** each order-mutating service function wraps its mutation and its journal write in a single database transaction. The journal write lives **inside the service layer** — the one place every mutation already flows through — so no route or actor path can miss it.
- **Service functions gain an actor-role parameter** where they don't already have one; routes pass the session's role down (they already resolve it for guarding).
- **Unconfirm operation:** admin-only, enforced at the route guard and re-checked in the service; legal only from `Confirmed`; transitions to `Pending`; clears the confirmed timestamp; journals `unconfirmed`. Re-confirmation is the existing confirm operation unchanged (fresh timestamp, journals `confirmed`).
- **Guard changes:** the item-mutation guard drops both admin bypasses (`INV-5` fulfillment gate and `INV-16` paid gate now bind every role). The correction path is: revert Paid → Unpaid (`INV-9`, any staff/admin) → Unconfirm (admin) → edit in Pending (`INV-4`) → re-confirm → re-mark Paid. Each step journaled.
- **Dashboard UI:** the Confirmed-order in-place item editor (Story 12/13 affordances on Confirmed orders) is retired; in its place, Confirmed orders show a single admin-only **Unconfirm** action in the order detail view. Pending-order editing UI is unchanged. The order detail view gains a compact chronological **history** list (staff/admin readable).
- **API:** one new mutation endpoint for unconfirm (admin-guarded) and one new read endpoint for an order's events (staff-guarded), both following the existing conventions. Unconfirming a non-Confirmed order returns the standard conflict envelope with the generic `CONFLICT` code — no subclass, because no client behavior branches on the *reason* (the `SOLD_OUT` precedent applies only when one does).
- **No new fulfillment states**; the payment machine is untouched (staff paid-revert per `INV-9` stays). No broker, no queue, no async consumers (ADR-006).
- **Journal coverage includes customer-initiated mutations** (create, cancel, payment choice), attributed `actorRole: customer`.

## Testing Decisions

- A good test exercises **external behavior at a seam**, never implementation detail: call a service function and assert the returned state plus the journal write as observed through the persistence seam; call a route and assert status code, envelope, and role gating; render a component and assert visible affordances (Unconfirm present for admin only, edit controls absent on Confirmed orders, history renders in order), not internals.
- **Seams: no new ones.** The service layer remains the primary seam (mutations + journal asserted together there, since `INV-17` couples them); the route layer covers guards and conflict cases; the component layer covers affordance changes. This matches the suite's existing three-level shape — the two new endpoints are thin and slot into the existing route-test pattern.
- **Modules under test:** the order service (unconfirm, transactional journal writes across every mutation, both guard-bypass removals), the two new routes (role gating, 409 on illegal unconfirm), and the order detail component (affordance swap + history list).
- **Prior art:** the existing order-service unit tests (node environment, mocked persistence), the existing route-guard tests, and the dashboard component tests under jsdom — including this repo's established fake-timer/fireEvent patterns and the ISSUE-28 mock discipline: mutation-endpoint mocks return **only** the fields the real API returns, so a regression to response-splicing fails in unit tests, not just live.

## Out of Scope

- `Preparing` / `Served` / any richer fulfillment lifecycle — parked in the epic map's Ideas tier; decided from pilot journal data, not speculation.
- Per-person attribution (named supervisor PINs or per-user accounts) — deferred behind ADR-006's named triggers.
- An owner-facing cross-order exceptions report (weekly unconfirms/reverts list) — the per-order history ships now; the aggregate view is epic-map backlog.
- Payment-gateway integration and any auto-confirm trigger; any broker/queue/event-driven infrastructure.
- Branch model, receipt printing, and all customer-facing UI beyond the no-change guarantee above.
- Retroactive journal backfill for orders that predate the feature — history starts at deploy.

## Further Notes

- The domain-model, ADR, and issue-log changes this spec builds on are **already committed** on this branch (`903bdde`) — the implementation must conform to them, not restate them.
- Deploy sequencing: this feature is the last change before the pilot client's dedicated instance is provisioned; the migration is additive, safe for the shared dev database.
- The journal is expected to earn its keep twice post-pilot: as the fraud-deterrence record the client owner reviews, and as the dataset that decides whether richer fulfillment states are ever justified.
