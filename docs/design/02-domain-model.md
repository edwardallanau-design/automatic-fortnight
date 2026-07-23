# Domain Model

**Glossary.**
- **Table** → **Ordering Point** — anywhere an order can originate: a physical table, a counter, or a virtual "Online" entry. Identified by a free-text `label`, unique within its branch (not globally).
- **Branch** (new) — a location, physical or virtual, that owns its own ordering points, its own `acceptingOrders` state, and its own shared staff password. Everything else (menu items, pricing) is shared across all branches.
- **Menu Item** — a single item available for order, with a name, price, and availability status.
- **Category** — an admin-managed grouping for menu items (e.g. "Drinks", "Mains"), with a manually-controlled display order. Global, not branch-scoped, matching Menu Item's own scope. A Menu Item may belong to at most one Category, or none.
- **Order** — a set of items submitted by a customer at a specific table, tracked through fulfillment and payment independently.
- **Order Item** — one line within an order: a reference to a menu item, a quantity, and a **price snapshot** captured at the moment it was added.
- **Fulfillment status** — where an order stands in the kitchen/staff workflow: Pending → Confirmed, or Pending → Cancelled.
- **Payment status** — whether an order has been paid: Unpaid → Paid. Tracked independently of fulfillment status, because the restaurant supports both pay-as-you-order and pay-at-the-end.
- **Venue Settings** — a vestigial venue-wide singleton; its `acceptingOrders` flag is no longer read by any code path (see `INV-10`) and no UI exposes it. Kept in the schema only to avoid a destructive migration.
- **Payment Method** — an admin-managed way a customer can pay online (e.g. an e-wallet or bank transfer), each with a name and either a QR image, an account/wallet number, or both.
- **Payment Choice** — how a customer said they'd pay for their own order: unset, at the counter, or online (with a chosen Payment Method + a self-reported reference number). Independent of, and never a substitute for, staff's own `paymentStatus` determination.
- **Receipt** (new, 2026-07-22) — a printable, on-demand view of an Order for Staff/Admin, not a persisted entity: no schema, no `printedAt`/print count, unlimited reprints. Available only once `paymentStatus = Paid` (independent of `fulfillmentStatus`, same axis-independence as `INV-8`) — deliberately proof-of-payment, which is why it's called Receipt and not Invoice. This gate is enforced client-side only (a disabled button), since printing involves no API call or persisted state for a server to guard. Narrower than the "end-of-day transaction printout / invoices / receipts for accounting" item `07-epic-map.md`'s backlog previously rejected — this is a per-order slip with no tax computation or fiscal numbering, not an accounting feature. See `docs/superpowers/specs/2026-07-22-receipt-printing-design.md`.

**High-level flow.**

*Customer:* scans table QR (identifies the table) → views menu (available items only shown as orderable; sold-out items visible but disabled) → adds items to cart, may add/remove/adjust freely before submitting → submits order → order is created as **Pending**, customer receives an order number → customer may still cancel the order **while it remains Pending**, but item-level changes (add/remove/adjust) are staff/admin-only from this point on → pays at the cashier (before or after staff confirmation, per this venue's flow) → once staff confirms, the order is locked from customer-side changes entirely (no cancel either).

*Staff:* watches a real-time dashboard of incoming Pending orders → reviews an order → confirms it (Pending → Confirmed), after which the customer/staff can no longer add or remove items → independently marks the order Paid once payment is received (this can happen before or after confirmation) → cannot modify a Confirmed order's contents.

*Owner/Admin:* manages the menu — adds/removes menu items, sets prices, toggles an item Available ↔ Sold Out → has all Staff capabilities → is the **only** actor who may modify a Confirmed order (correcting a staff/customer mistake after the fact) → is the **only** actor who may open or close the venue for new orders (`acceptingOrders`).

**Entities.**
- **Branch** — `name`, `acceptingOrders` (boolean, default true).
- **OrderingPoint** (was Table) — `label`, `branch` (ref) — identifies where an order originated; no lifecycle of its own, same as Table had none.
- **MenuItem** — `name`, `price`, `categoryId` (optional, ref to Category) — the sellable item; `available` (boolean, global) is **removed**. Sold-out is now purely a per-branch fact (see MenuItemSoldOut below); price changes and sold-out toggles apply only to *future* order items, never retroactively.
- **Category** (new) — `name`, `sortOrder` (integer, manually reordered by admin). Deleting a Category unassigns it from any Menu Item referencing it (`onDelete: SetNull`) rather than being blocked.
- **MenuItemSoldOut** (new) — `menuItem` (ref), `branch` (ref), unique per pair. Presence of a row means that item is sold out in that branch; absence means available. A newly created branch starts with everything available with no rows to create.
- **Order** — `orderingPoint` (ref), `branch` (ref, captured from `orderingPoint.branch` at the moment of creation), `fulfillmentStatus`, `paymentStatus`, `paymentChoice`, `paymentMethod` (ref, optional), `paymentMethodNameSnapshot` (optional), `paymentReference` (optional), `orderNumber`, `customerName` (optional, captured at submission, immutable afterward), `createdAt`, `confirmedAt` — the aggregate root for a customer's visit.
- **OrderItem** — `menuItem` (ref), `nameSnapshot`, `priceSnapshot`, `quantity` — a line item belonging to exactly one Order.
- **VenueSettings** — a singleton, `acceptingOrders` (boolean) — vestigial: no code reads or writes it after 2026-07-11's branch-context redesign (see `INV-10`); retained in the schema only to avoid a destructive migration.
- **PaymentMethod** — `name`, `active` (boolean), `qrImageUrl` (optional), `accountInfo` (optional) — admin-managed; deactivated (not deleted) once an Order references it, to preserve history.

**Aggregates.**
- **Order** (root) → contains its OrderItems. Everything inside — item list, quantities, fulfillment status, payment status — is consistent together and mutated only through the Order. OrderItems never exist independent of an Order and are never shared across orders.
- **MenuItem** (root, standalone) — its own aggregate. Menu changes (price, availability) are eventually consistent with respect to existing orders: an Order's OrderItems hold their own price/name snapshot and are never rewritten by a later MenuItem change. This is *why* MenuItem and Order are separate aggregates rather than one — they must be free to evolve independently.
- **OrderingPoint** — a simple reference value, not an aggregate; no invariants beyond uniqueness of `label` within its branch (`INV-14`).

**Invariants.**
- `INV-1` An Order must reference exactly one existing OrderingPoint.
- `INV-2` An Order must contain at least one OrderItem to be submitted — empty orders cannot be created.
- `INV-3` An OrderItem's `priceSnapshot` and `nameSnapshot` are captured at the moment it is added to the Order and never change afterward, regardless of subsequent MenuItem price or name edits.
- `INV-4` OrderItems may be added, removed, or have their quantity changed **only by Staff or Owner/Admin**, and **only while** the parent Order's `fulfillmentStatus = Pending`. The customer's only self-service action on their own order after submission is cancellation (`INV-6`).
- `INV-5` Once an Order's `fulfillmentStatus = Confirmed`, its OrderItems are immutable to Customer and Staff. Only Owner/Admin may modify a Confirmed order.
- `INV-6` An Order may be cancelled only while `fulfillmentStatus = Pending`.
- `INV-7` A MenuItem sold out **in the branch of the order's OrderingPoint** cannot be added as a new OrderItem to that order. (Was: sold out globally blocks it everywhere — now the same rule, scoped per branch.) Existing OrderItems referencing it are unaffected (their snapshot already exists — see `INV-3`).
- `INV-8` `paymentStatus` transitions independently of `fulfillmentStatus` — an order can be marked Paid while Pending or while Confirmed. There is no rule tying payment timing to confirmation.
- `INV-9` Reverting `paymentStatus` from Paid back to Unpaid may be performed by any authenticated staff or admin session — no role restriction. (Originally Owner/Admin-only; relaxed 2026-07-08 so staff can self-correct a mis-marked payment without needing an admin.)
- `INV-10` A new Order may be created only while the order's branch's `acceptingOrders` is true. (Until 2026-07-11 this also required `VenueSettings.acceptingOrders` (global); that gate was removed as part of the admin UI branch-context redesign — see `docs/superpowers/specs/2026-07-11-admin-ui-branch-context-redesign-design.md`.)
- `INV-11` An Order's `paymentChoice` transitions `None → Counter` or `None → Online` exactly once; attempting to set it again, or while `fulfillmentStatus = Cancelled`, is rejected.
- `INV-12` Setting `paymentChoice = Online` requires a non-empty `paymentReference` and a `paymentMethodId` referencing an `active` PaymentMethod at request time; all four fields (`paymentChoice`, `paymentMethodId`, `paymentMethodNameSnapshot`, `paymentReference`) are written in the same database update. Note: the preceding read-then-write (checking `paymentChoice = None` and `fulfillmentStatus ≠ Cancelled`) is not wrapped in a transaction or guarded by a conditional-update clause, so a concurrent duplicate-choice race is theoretically possible but not prevented; acceptable for now given this is low-stakes choice-tracking, not a security or payment-processing operation.
- `INV-13` An Order's `branchId` is captured once, from its OrderingPoint's branch, at creation time, and never changes afterward — even if that OrderingPoint is later reassigned to a different branch or deleted. Mirrors the existing snapshot precedent in `INV-3`.
- `INV-14` An OrderingPoint's `label` must be unique within its branch (not globally — two branches may each have a "Table 1").
- `INV-15` A branch's staff password must not match any other credential's password in the system (admin's, or any other branch's). `login()` matches by trying every credential's bcrypt hash via an unordered `findMany` and returning the first hit, so a collision would silently route staff into the wrong branch's dashboard. This must be enforced at branch-password-write time (comparing the candidate plaintext against every existing hash before saving); that write path doesn't exist yet — branch creation/password management is Plan 2. Until then only the two seeded credentials exist, each from a distinct env var, so no collision is possible.

- `INV-16` An Order's OrderItems may not be added, removed, or have their quantity changed while `paymentStatus = Paid`, **except by Owner/Admin**. Staff must first revert `paymentStatus` to `Unpaid` (permitted by `INV-9`) before changing a Paid order's contents. This gate is independent of `INV-4`/`INV-5`'s fulfillment gate — **both** must pass. Added 2026-07-23 to close a silent money hole: `addOrderItem` previously had no `paymentStatus` guard, and `INV-8` makes `Paid + Pending` legal, so staff could raise an order's total above what was collected — and `Print receipt`, gated only on Paid, would then attest to the higher figure (Receipt is deliberately proof-of-payment). The Owner/Admin exception mirrors `INV-5`: admin is this system's correction path, and `Paid + Confirmed` is precisely the state in which a mistake is most likely to be discovered. See `docs/superpowers/specs/2026-07-23-counter-add-items-design.md`.

**State machines.**

*Order — `fulfillmentStatus`*
- States: `Pending`, `Confirmed`, `Cancelled`
- `Pending → Confirmed` (trigger: Staff or Owner/Admin confirms)
- `Pending → Cancelled` (trigger: Customer or Staff cancels)
- `Confirmed` and `Cancelled` are terminal — no transitions out of either.
- **Illegal:** `Confirmed → Cancelled`, `Confirmed → Pending`, `Cancelled → anything`.
- **Exception path (not a state transition):** Owner/Admin may edit the *contents* (OrderItems) of a Confirmed order without changing its status — this is a content override, not a fulfillment-state change.

*Order — `paymentStatus`* (independent axis)
- States: `Unpaid`, `Paid`
- `Unpaid → Paid` (trigger: Staff or Owner/Admin marks paid) — valid regardless of `fulfillmentStatus`.
- `Paid → Unpaid` (trigger: Owner/Admin only — correction).
- **Illegal:** Staff performing `Paid → Unpaid`.

*MenuItem — sold-out state, per branch (via `MenuItemSoldOut` row presence)*
- States: `Available` (no row), `SoldOut` (row exists for that MenuItem + Branch pair)
- `Available → SoldOut` and `SoldOut → Available` (trigger: Staff or Owner/Admin toggles, scoped to their branch) — freely reversible, no restriction.

*VenueSettings — `acceptingOrders`* (vestigial as of 2026-07-11 — see `INV-10`)
- States: `Open` (true), `Closed` (false)
- No longer reachable via any UI or API; the flag stays permanently `true` (its schema default) since nothing can transition it anymore.

*Order — `paymentChoice`* (independent axis, separate from `paymentStatus`)
- States: `None`, `Counter`, `Online`
- `None → Counter` (trigger: Customer, on the order confirmation page).
- `None → Online` (trigger: Customer, selecting a Payment Method and supplying a reference number).
- `Counter` and `Online` are terminal — no transitions out of either (`INV-11`).
- This never sets `paymentStatus` — staff/admin still independently mark `paymentStatus = Paid` via the existing mechanism (`INV-8`/`INV-9`, unchanged).

*Branch — `acceptingOrders`* (new)
- States: `Open` (true), `Closed` (false).
- `Open → Closed` and `Closed → Open` (trigger: Owner/Admin only) — freely reversible, same shape as the existing `VenueSettings.acceptingOrders` machine.
