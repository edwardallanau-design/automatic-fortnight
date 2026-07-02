# Intent & Constraints

**Build mode.** Product (MVP / POC)

**Why this exists (success condition).**
Hypothesis: We believe customers at a restaurant/cafe will place their own orders through a digital menu (instead of relying on staff to take verbal orders), resulting in fewer order errors and reduced staff load.

Kill criteria: Measured over one month of live operation at the pilot restaurant, tracking the % of total orders placed through the digital menu vs. taken verbally by staff:
- **< 20%** → Kill. Adoption too low to justify continuing.
- **20–50%** → Pivot. Improve the ordering flow/UX before re-measuring (does not validate as-is, but signal is real enough to iterate).
- **> 50%** → Go. Continue building against the same foundation.

**Actors.**
- **Customer** — browses menu, places order, receives an order number
- **Staff** — receives incoming orders in real time, confirms orders, marks items sold out/available
- **Owner/Admin** — manages menu (add/remove items, pricing), has staff capabilities

**Non-goals.**
- No in-app payment — customer orders, gets a number, pays staff at the counter/table
- No delivery or takeout logistics
- No multi-tenant support (single restaurant only — see `03-tenancy-model.md`)
- No loyalty programs, reservations, or reviews

**— Product mode only —**

**Who pays / primary user.** A specific restaurant/cafe client (pilot). The system is built for that client to operate; a live pilot is required for the kill criteria to be measurable — building this without a committed pilot restaurant invalidates the validation gate.

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
