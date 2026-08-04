# Intent & Constraints

**Build mode.** Product (committed v1) — re-declared 2026-07-25 from the original bundled "Product (MVP / POC)" declaration. The trigger: a pilot client committed, so the bet is made and there is no stop decision left. The Product-mode reconcile (settle assumed decisions, decide deferred scale calls, dial to Full — forward-only) is tracked in `BUILD_STATUS.md`.

**Why this exists (success condition).**
Committed scope: a digital menu & ordering system operated by a committed pilot restaurant/cafe client, deployed as that client's own dedicated instance. Done = it ships and is maintained.

**Adoption signal (retired kill criteria).** The original MVP hypothesis — customers will place their own orders through a digital menu instead of relying on staff to take verbal orders, resulting in fewer order errors and reduced staff load — graduated to a committed bet when the client signed. Its kill criteria (kill < 20% / pivot 20–50% / go > 50% share of orders placed digitally over one live month) are **retired as a stop decision**. The same metric is still measured over the first live month, but as an **iteration signal only**: low digital-order share triggers ordering-flow/UX improvement, never a kill.

**Actors.**
- **Customer** — browses menu, places order, receives an order number
- **Staff** — receives incoming orders in real time, confirms orders, marks items sold out/available
- **Owner/Admin** — manages menu (add/remove items, pricing), has staff capabilities

**Non-goals.**
- No payment *processing* or verification in-app — the customer may declare a payment method (counter, or a self-reported online reference), but the app never handles money or confirms a transaction actually occurred; staff always make the final Paid determination.
- No delivery or takeout logistics
- No multi-tenant support (single restaurant only — see `03-tenancy-model.md`)
- No loyalty programs, reservations, or reviews

**— Product mode only —**

**Who pays / primary user.** A specific restaurant/cafe client (pilot) — committed as of 2026-07-25. The system is built for that client to operate, on a dedicated instance (own Vercel project + database); the vendor's existing dev → main pipeline stays internal.

**Scale assumptions.**
- Up to 20 tables
- 15–20 menu items
- Up to ~20 concurrent order sessions at peak (order of magnitude: tens, not hundreds)
- Single venue, single location

**NFRs.**
- **Availability.** Business-hours reliability; no high-availability infrastructure required at MVP.
- **Latency.** Orders must reach the staff dashboard in real time — target low single-digit seconds from submission to visibility.
- **Consistency.** Order state (submitted → confirmed → fulfilled) must be consistent between customer view and staff dashboard; eventual consistency within a few seconds is acceptable (no strict transactional cross-client sync required).
- **Compliance.** None specific — no payment data, no PII beyond an optional order-session identifier.
