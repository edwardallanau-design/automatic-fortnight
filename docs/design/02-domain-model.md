# Domain Model

**Glossary.**
- **Table** — a physical table in the restaurant, identified by a table number, with its own QR code that encodes that table's identity.
- **Menu Item** — a single item available for order, with a name, price, and availability status.
- **Order** — a set of items submitted by a customer at a specific table, tracked through fulfillment and payment independently.
- **Order Item** — one line within an order: a reference to a menu item, a quantity, and a **price snapshot** captured at the moment it was added.
- **Fulfillment status** — where an order stands in the kitchen/staff workflow: Pending → Confirmed, or Pending → Cancelled.
- **Payment status** — whether an order has been paid: Unpaid → Paid. Tracked independently of fulfillment status, because the restaurant supports both pay-as-you-order and pay-at-the-end.

**High-level flow.**

*Customer:* scans table QR (identifies the table) → views menu (available items only shown as orderable; sold-out items visible but disabled) → adds items to cart, may add/remove/adjust freely → submits order → order is created as **Pending**, customer receives an order number → customer may still cancel the order or remove items **while it remains Pending** → pays at the cashier (before or after staff confirmation, per this venue's flow) → once staff confirms, the order is locked from customer-side changes.

*Staff:* watches a real-time dashboard of incoming Pending orders → reviews an order → confirms it (Pending → Confirmed), after which the customer/staff can no longer add or remove items → independently marks the order Paid once payment is received (this can happen before or after confirmation) → cannot modify a Confirmed order's contents.

*Owner/Admin:* manages the menu — adds/removes menu items, sets prices, toggles an item Available ↔ Sold Out → has all Staff capabilities → is the **only** actor who may modify a Confirmed order (correcting a staff/customer mistake after the fact).

**Entities.**
- **Table** — `number` (unique), `qrCode` — identifies where an order originated; no lifecycle of its own.
- **MenuItem** — `name`, `price`, `available` (boolean) — the sellable item; price changes and sold-out toggles apply only to *future* order items, never retroactively.
- **Order** — `table` (ref), `fulfillmentStatus`, `paymentStatus`, `orderNumber`, `customerName` (optional, captured at submission, immutable afterward), `createdAt`, `confirmedAt` — the aggregate root for a customer's visit.
- **OrderItem** — `menuItem` (ref), `nameSnapshot`, `priceSnapshot`, `quantity` — a line item belonging to exactly one Order.

**Aggregates.**
- **Order** (root) → contains its OrderItems. Everything inside — item list, quantities, fulfillment status, payment status — is consistent together and mutated only through the Order. OrderItems never exist independent of an Order and are never shared across orders.
- **MenuItem** (root, standalone) — its own aggregate. Menu changes (price, availability) are eventually consistent with respect to existing orders: an Order's OrderItems hold their own price/name snapshot and are never rewritten by a later MenuItem change. This is *why* MenuItem and Order are separate aggregates rather than one — they must be free to evolve independently.
- **Table** — a simple reference value, not an aggregate; no invariants beyond uniqueness of `number`.

**Invariants.**
- `INV-1` An Order must reference exactly one existing Table.
- `INV-2` An Order must contain at least one OrderItem to be submitted — empty orders cannot be created.
- `INV-3` An OrderItem's `priceSnapshot` and `nameSnapshot` are captured at the moment it is added to the Order and never change afterward, regardless of subsequent MenuItem price or name edits.
- `INV-4` OrderItems may be added, removed, or have their quantity changed **only while** the parent Order's `fulfillmentStatus = Pending`.
- `INV-5` Once an Order's `fulfillmentStatus = Confirmed`, its OrderItems are immutable to Customer and Staff. Only Owner/Admin may modify a Confirmed order.
- `INV-6` An Order may be cancelled only while `fulfillmentStatus = Pending`.
- `INV-7` A MenuItem with `available = false` (sold out) cannot be added as a new OrderItem to any order. Existing OrderItems referencing it are unaffected (their snapshot already exists — see `INV-3`).
- `INV-8` `paymentStatus` transitions independently of `fulfillmentStatus` — an order can be marked Paid while Pending or while Confirmed. There is no rule tying payment timing to confirmation.
- `INV-9` Reverting `paymentStatus` from Paid back to Unpaid may only be performed by Owner/Admin (correcting a staff error) — Staff cannot un-mark a payment.

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

*MenuItem — `available`*
- States: `Available`, `SoldOut`
- `Available → SoldOut` and `SoldOut → Available` (trigger: Staff or Owner/Admin toggles) — freely reversible, no restriction.
