# Epic Map

**MVP epic: Digital Ordering Core Loop** — the hypothesis-testing slice. Nothing less than the full loop (menu → order → confirm → pay) can generate the adoption signal Artifact 01's kill criteria depend on, so this epic *is* the MVP.

Stories:

---

**Story 1 — Staff/Admin login**
- **Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Auth · Follow patterns in `06b-engineering-decisions.md` §8
- **Vertical slice.** Login page → API route validates shared credential → sets role-bearing session cookie → redirects to role-appropriate dashboard.
- **Acceptance criteria.**
  - Entering the staff credential logs in with `role=staff` and redirects to the staff dashboard.
  - Entering the admin credential logs in with `role=admin` and redirects to the staff dashboard with admin-only controls visible (menu management link).
  - Wrong credential shows an error, no session set.
  - Visiting a staff/admin route while unauthenticated redirects to login.
- **Scope boundary — do NOT touch.** Customer-facing menu/order flow; per-employee accounts (explicitly out of scope, ADR-003).
- **Fits one window?** Yes.

---

**Story 2 — Table setup & QR identification**
- **Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (Table entity) · Follow patterns in `02-domain-model.md`
- **Vertical slice.** Admin creates a Table (number) → system generates a QR code encoding a URL like `/order?table=<id>` → admin can view/print the QR.
- **Acceptance criteria.**
  - Admin can create a table with a unique number; duplicate numbers are rejected (`409`).
  - Each table has a QR code rendering that link to `/order?table=<id>`.
  - Visiting `/order?table=<invalid-id>` shows a clear error, not a crash.
- **Scope boundary — do NOT touch.** Menu items, order submission logic.
- **Fits one window?** Yes.

---

**Story 3 — Menu management (Admin)**
- **Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Menu · Follow patterns in `02-domain-model.md` (MenuItem aggregate)
- **Vertical slice.** Admin-only page to create/edit/delete menu items (name, price) and toggle `available`.
- **Acceptance criteria.**
  - Admin can create a menu item with name + price; both required (`400` if missing).
  - Admin can edit an existing item's name/price.
  - Admin can toggle `available` true/false.
  - Deleting a menu item that has existing OrderItems referencing it is rejected or soft-deleted (not hard-deleted) — preserves `INV-3` price/name snapshots on past orders.
  - Staff role can view but not edit menu items.
- **Scope boundary — do NOT touch.** Order flow, table setup.
- **Fits one window?** Yes.

---

**Story 4 — Customer menu view**
- **Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Menu (read) · Follow patterns in `05-api-conventions.md`
- **Vertical slice.** Unauthenticated customer scans QR → lands on `/order?table=<id>` → sees a mobile-first list of available menu items; sold-out items shown disabled, not hidden.
- **Acceptance criteria.**
  - Page loads the menu for the given table without login.
  - Available items are selectable; sold-out items are visibly disabled and cannot be added.
  - Invalid/missing table id shows an error state, no crash.
- **Scope boundary — do NOT touch.** Cart/submission logic (Story 5), staff dashboard.
- **Fits one window?** Yes.

---

**Story 5 — Cart & order submission**
- **Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (Order aggregate) · Follow patterns in `02-domain-model.md` INV-1, INV-2, INV-3
- **Vertical slice.** Customer adds items to a client-side cart, adjusts quantities, submits → server creates an `Order` (status `Pending`, `paymentStatus Unpaid`) with `OrderItem`s snapshotting current name/price → customer sees an order number.
- **Acceptance criteria.**
  - Submitting an empty cart is rejected (`INV-2`, `400`).
  - Submitted order is created with `fulfillmentStatus=Pending`, correct `table` reference (`INV-1`).
  - Each OrderItem stores a price/name snapshot equal to the MenuItem's current values at submission time (`INV-3`).
  - Attempting to add a sold-out item to the cart is prevented client-side and rejected server-side if attempted (`INV-7`).
  - Response includes an order number shown to the customer.
- **Scope boundary — do NOT touch.** Staff confirmation/payment actions, menu management.
- **Fits one window?** Yes.

---

**Story 6 — Customer edits/cancels a Pending order**
- **Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering · Follow patterns in `02-domain-model.md` INV-4, INV-6
- **Vertical slice.** From the order-confirmation screen (customer still has the order number/session), customer can remove items or cancel the whole order, while it remains `Pending`.
- **Acceptance criteria.**
  - Removing an item from a `Pending` order updates it; removing the last item is either blocked or treated as a full cancel (pick one — recommend: blocked, since `INV-2` forbids empty orders; cancel is the explicit action for "no items").
  - Cancelling a `Pending` order sets `fulfillmentStatus=Cancelled`.
  - Attempting either action on a `Confirmed` order is rejected (`409`, `INV-4`/`INV-5`).
- **Scope boundary — do NOT touch.** Staff-side confirm/pay actions.
- **Fits one window?** Yes.

---

**Story 7 — Staff dashboard: view Pending orders (polling)**
- **Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (read) · Follow patterns in ADR-001 (polling)
- **Vertical slice.** Authenticated staff/admin dashboard polls `GET /api/orders?status=pending` every 3–4s and renders incoming orders with table number, items, and quantities.
- **Acceptance criteria.**
  - Dashboard shows all currently `Pending` orders, refreshing within the polling interval.
  - A new order submitted by a customer appears on the dashboard without a manual page reload, within ~4 seconds.
  - Confirmed/Cancelled orders drop off the Pending view.
- **Scope boundary — do NOT touch.** Confirm/pay actions (Story 8), menu management.
- **Fits one window?** Yes.

---

**Story 8 — Staff confirms order and marks payment**
- **Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering · Follow patterns in `02-domain-model.md` state machines (fulfillmentStatus, paymentStatus)
- **Vertical slice.** From the dashboard, staff/admin can confirm a Pending order (`→ Confirmed`) and independently toggle `paymentStatus` (`Unpaid ↔ Paid`, with `Paid → Unpaid` restricted to admin per `INV-9`).
- **Acceptance criteria.**
  - Staff confirming a `Pending` order sets `fulfillmentStatus=Confirmed`; the order becomes immutable to customer/staff (`INV-5`).
  - Staff can mark `paymentStatus=Paid` regardless of `fulfillmentStatus` (`INV-8`).
  - Staff attempting to revert `Paid → Unpaid` is rejected (`403`); admin performing the same succeeds (`INV-9`).
  - Confirming an already-`Confirmed` or `Cancelled` order is rejected (`409`).
- **Scope boundary — do NOT touch.** Menu management, table setup.
- **Fits one window?** Yes.

---

**Backlog epics (placeholders).**
- **Order history & reporting** — owner-facing view of past orders/revenue.
- **Kitchen prep / served tracking** — extend the order lifecycle past Confirmed if the pilot shows a need to track food delivery to the table.
- **Admin edits to Confirmed orders (UI)** — the domain rule exists (`INV-5` exception); the admin-facing UI for it can wait until the pilot surfaces real correction cases.
- **Payment integration** — in-app payment, if pay-at-counter proves to be friction in practice.
- **Multi-venue / multi-tenant support** — only if a second restaurant client materializes (see `03-tenancy-model.md`).
- **Discounts/promotions** — deliberately scrapped for MVP; revisit post-validation.
- **Resume order by re-scanning the QR** — recover a lost order link by looking up the table's active Pending order; needs a decision on whether a table may hold >1 concurrent Pending order (new invariant). Deferred from Story 6.

**Rough sequence / dependencies.** Auth (1) and Table setup (2) are prerequisites for everything else. Menu management (3) must exist before the customer menu view (4) has data to show. Order submission (5) depends on 2+3+4. Customer edit/cancel (6) and the staff dashboard (7) both depend on 5. Staff confirm/pay (8) depends on 7. Recommended build order: 1 → 2 → 3 → 4 → 5 → 7 → 8 → 6 (6 last since it's the lowest-risk story to the core loop, and validating confirm/pay end-to-end matters more early).
