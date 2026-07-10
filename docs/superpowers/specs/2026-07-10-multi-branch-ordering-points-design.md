# Multi-branch table setup + dashboard filtering — Design

**Date.** 2026-07-10
**Source.** User-directed, post-epic — conversation 2026-07-10. Not on the original epic map; this is a scope expansion beyond the documented "single venue, single location" assumption (`docs/design/01-intent-and-constraints.md`) and touches `ADR-003` (`docs/design/04-architecture.md`). Both are called out explicitly below rather than silently overridden.

## Problem

The system is built for one physical venue. There's growing need to run the same app across multiple branches/locations of the same restaurant, with:
- Each branch's own set of tables/QR codes, and its own staff dashboard view.
- Admin able to see every branch (as switchable tabs, plus a combined view) while a staff login only ever sees its own branch.
- Each branch independently openable/closable for new orders.
- A way to model "online orders" (no physical table) without bolting on a separate subsystem — by treating "Online" as just another branch.

Two existing decisions are in tension with this:
- **`ADR-003`**: shared role-based credentials, no per-user staff identity. "Assign staff to a branch" can't mean *individual* assignment without abandoning this ADR. Resolved below by extending the ADR's shared-credential model (one password per branch) rather than replacing it with real user accounts — a materially bigger change this project isn't taking on right now.
- **Scale assumption**: "single venue, single location." This design supersedes that specific assumption; nothing else in `01-intent-and-constraints.md` (kill criteria, non-goals around payment/delivery/loyalty) changes.

## Scope

**In scope.**
- `Branch` entity: name, `acceptingOrders` toggle, admin-managed staff password.
- `Table` generalized to `OrderingPoint`: free-text `label` instead of a numeric `number`, scoped to a branch, no longer required to represent a physical table (enables the "Online" branch's non-physical entry).
- `Order` gains a `branchId`, snapshotted at creation from its `OrderingPoint`, immutable afterward.
- Per-branch menu-item sold-out status (menu items themselves — name/price/archive — stay global/shared).
- Branch-scoped staff login (shared password per branch, admin-settable/rotatable from the UI), admin login unchanged and still sees everything.
- Admin dashboard: per-branch tabs + an "All" combined tab.
- Auto-created "Counter" ordering point on every new branch (carries forward the existing table-0 walk-in convention from Story 11).
- A single migration that folds all existing data into one "Main" branch, preserving every existing QR code, the existing staff password, and existing sold-out state, with zero behavior change for the pilot venue at the moment this ships.
- Keeping the existing venue-wide `VenueSettings.acceptingOrders` flag *in addition to* the new per-branch flags — a branch only accepts orders when both are true.

**Out of scope.**
- Per-person staff accounts, invites, or per-employee audit trails (still `ADR-003`'s shared-credential model, just one password per branch instead of one password total).
- Per-branch menus or pricing — only sold-out status varies by branch; name/price/archive stay global across all branches.
- Any real online-ordering infrastructure (payment gateway, delivery dispatch, address/phone capture). The "Online" branch only changes *where an order is attributed*, not how it's fulfilled — still the same manual staff-confirms flow.
- Scheduled/timed branch hours — manual on/off only, matching the existing venue-wide toggle's precedent (Story 17).
- Reassigning an `OrderingPoint` to a different branch after creation, or any UI for it. Not needed for the "Main" migration (which sets branch once) and not requested — if it's ever needed, `Order.branchId`'s snapshot semantics already make it safe to add later without a data-integrity concern.

## Domain model changes

Amends `docs/design/02-domain-model.md`. Flagged per this project's stop-rule since it touches existing invariants/state machines — this section is what the user is signing off on, not just the schema.

**Glossary changes.**
- **Table** → **Ordering Point** — anywhere an order can originate: a physical table, a counter, or a virtual "Online" entry. Identified by a free-text `label`, unique within its branch (not globally).
- **Branch** (new) — a location, physical or virtual, that owns its own ordering points, its own `acceptingOrders` state, and its own shared staff password. Everything else (menu items, pricing) is shared across all branches.

**Entities.**
- **Branch** — `name`, `acceptingOrders` (boolean, default true).
- **OrderingPoint** (was Table) — `label`, `branch` (ref) — identifies where an order originated; no lifecycle of its own, same as Table had none.
- **Order** — gains `branch` (ref), captured from `orderingPoint.branch` at the moment of creation. All other fields unchanged.
- **MenuItem** — `available` (boolean, global) is **removed**. Sold-out is now purely a per-branch fact (see MenuItemSoldOut below); name/price/archived remain global.
- **MenuItemSoldOut** (new) — `menuItem` (ref), `branch` (ref), unique per pair. Presence of a row means that item is sold out in that branch; absence means available. A newly created branch starts with everything available with no rows to create.

**Invariant changes.**
- `INV-1` (reworded, not behaviorally changed): An Order must reference exactly one existing OrderingPoint.
- `INV-7` (reworded): A MenuItem sold out **in the branch of the order's OrderingPoint** cannot be added as a new OrderItem to that order. (Was: sold out globally blocks it everywhere — now the same rule, scoped per branch.)
- `INV-10` (reworded): A new Order may be created only while **both** `VenueSettings.acceptingOrders` (global) **and** the order's branch's `acceptingOrders` are true.
- **New `INV-13`**: An Order's `branchId` is captured once, from its OrderingPoint's branch, at creation time, and never changes afterward — even if that OrderingPoint is later reassigned to a different branch or deleted. Mirrors the existing snapshot precedent in `INV-3`.
- **New `INV-14`**: An OrderingPoint's `label` must be unique within its branch (not globally — two branches may each have a "Table 1").
- **New `INV-15`**: A branch's staff password must not match any other credential's password in the system (admin's, or any other branch's) — checked at write time by comparing the candidate plaintext against every existing hash. Required because `login()` matches by trying every credential and returning the first hit; a collision would silently route staff into the wrong branch's dashboard.

**State machine — new: `Branch.acceptingOrders`**
- States: `Open` (true), `Closed` (false).
- `Open → Closed` and `Closed → Open` (trigger: Owner/Admin only) — freely reversible, same shape as the existing `VenueSettings.acceptingOrders` machine.

## Data model

```prisma
model Branch {
  id              String          @id @default(uuid())
  name            String
  acceptingOrders Boolean         @default(true)
  createdAt       DateTime        @default(now())
  orderingPoints  OrderingPoint[]
  orders          Order[]
  credential      Credential?
  soldOutItems    MenuItemSoldOut[]
}

model OrderingPoint {
  id        String   @id @default(uuid())
  branchId  String
  branch    Branch   @relation(fields: [branchId], references: [id])
  label     String
  createdAt DateTime @default(now())
  orders    Order[]

  @@unique([branchId, label])
}

model MenuItemSoldOut {
  id         String   @id @default(uuid())
  menuItemId String
  menuItem   MenuItem @relation(fields: [menuItemId], references: [id])
  branchId   String
  branch     Branch   @relation(fields: [branchId], references: [id])
  createdAt  DateTime @default(now())

  @@unique([menuItemId, branchId])
}
```

Changes to existing models:
- `MenuItem` — drop `available Boolean`.
- `Credential` — drop `role @unique`; add `branchId String? @unique` (nullable FK to `Branch`). Admin's row keeps `branchId = null`. Add a partial-uniqueness expectation enforced at the application layer (not the DB) for `INV-15`, since password-collision checking requires `bcrypt.compare`, not a DB constraint.
- `Order` — rename `tableId` → `orderingPointId` (FK to `OrderingPoint`); add `branchId String` (FK to `Branch`), required, set once at creation.

## Migration (needs explicit sign-off — not purely additive)

Existing production data (shared with `dev`/`preprod`/every preview per this project's known DB-sharing caveat) must fold into this model with zero observable behavior change:

1. Create one `Branch` row named **"Main"**.
2. Convert every `Table` row to an `OrderingPoint` row **preserving its `id`** — this is the part that matters most: printed/laminated QR codes encode `/order?table=<id>`, and as long as the id survives the migration unchanged, every already-deployed QR code keeps working with no reprinting. `label` is derived from the old `number` (`0` → `"Counter"`, matching `lib/tableDisplay.ts`'s existing convention; otherwise `"Table {number}"`). All rows attach to `Main`. The `?table=` query parameter name on the customer-facing route is kept as-is on the wire for the same reason, even though the underlying model is renamed internally.
3. The existing `Credential{role:'staff'}` row gets `branchId = Main.id` — same password hash, so today's staff password keeps working unchanged as Main's branch password. The admin credential is untouched.
4. Every `MenuItem{available:false}` becomes a `MenuItemSoldOut(menuItemId, Main.id)` row; then the `MenuItem.available` column is dropped.
5. Every existing `Order` is backfilled `branchId = Main.id`, `orderingPointId` renamed in place from `tableId`; `branchId` is then made required.
6. `VenueSettings` (the existing global singleton) is untouched — it becomes the "AND" partner to each branch's own flag per the reworded `INV-10`.

**Seed-script gotcha to avoid** (extends the precedent already logged as `ISSUE-11`): `prisma/seed.ts` currently reseeds credentials unconditionally on every deploy. After this migration, branch credentials are admin-UI-managed — if the seed script keeps touching them on every deploy, any admin-driven branch password change would be silently reverted on the next deploy, which is worse than `ISSUE-11` because the settings UI would *imply* it's authoritative. Fix as part of this work: the seed script only ever touches the Admin credential from here on; Main's branch credential is created-once-if-missing, never overwritten on subsequent runs.

## Components & data flow

### Auth
- `lib/authService.ts`'s `login()` already iterates every `Credential` row and returns whichever matches (existing code, `lib/authService.ts:6-17`) — extends to N branch rows with no restructuring. Returns `{ role, branchId }` (branchId undefined for admin).
- `lib/session.ts` — JWT payload gains an optional `branchId` claim.
- `lib/authGuard.ts` — `requireRole`/`requireApiRole`/`peekSession` return `branchId` alongside `role`. New helper (or inline check at each order/dashboard route) forces `branchId = session.branchId` for any `role === 'staff'` caller, ignoring/rejecting a client-supplied branch param — admin callers use the query-supplied branch (or none, for "All").

### Admin UX
- New `/admin/branches` — list/create/rename branches, toggle each branch's `acceptingOrders`, set/rotate each branch's staff password (validated against `INV-15` before saving). Creating a branch auto-creates its `OrderingPoint{label:"Counter"}`.
- `/admin/tables` (renamed `/admin/ordering-points`, or kept at the same route with new content — implementation detail for the plan) gains a branch selector; same QR-generation flow as today, scoped per branch.
- `/admin/menu-items` — sold-out toggle becomes branch-scoped (a branch selector or small per-branch matrix per item); name/price/archive stay global and unaffected.
- Staff dashboard (admin view) — branch tab strip plus an **"All"** tab that merges every branch's orders, each row tagged with its branch name.
- `/admin/settings` (existing, Story 17) — unchanged, still the global `VenueSettings.acceptingOrders` master switch.

### Staff UX
Unchanged mental model. A staff session's `branchId` is baked into its JWT; the dashboard silently only ever shows that branch's orders — no tab strip, nothing new to learn or configure. Switching branches means logging in with a different branch's password.

### Customer / online-order flow
Scanning a table's QR is unchanged end-to-end. The "Online" branch is created like any other branch, with one `OrderingPoint{label:"Online"}` whose QR/link can be shared externally (social media, website) — orders placed through it land in the Online branch's dashboard exactly like any table's orders would in theirs.

### API
- `GET /api/orders` — gains branch scoping: admin may pass `?branchId=` (omitted = "All"); staff's `branchId` is always forced server-side from session, regardless of any query param.
- `POST/GET /api/branches`, `PATCH /api/branches/:id` (toggle, rename, rotate password) — admin-only.
- `/api/ordering-points` (replaces `/api/tables`) — branch-scoped CRUD, admin-only.
- `PATCH /api/menu-items/[id]/availability` (existing route from Story 17, extended) — takes `branchId` in the body; staff/admin, forced to the caller's own branch for staff sessions.

## Error handling

- Branch password collision (`INV-15`) on create/rotate → `ConflictError` (409), distinct message ("This password is already in use by another branch or the admin login").
- Order creation when either the branch or the venue is closed → `ConflictError` (409), same shape as today's Story 17 check, message indicates which gate failed.
- Sold-out check (`INV-7`) now resolves per the order's branch — same `ConflictError` shape as today, just branch-aware.
- Staff attempting to pass a foreign `branchId` on any order/dashboard query is silently overridden server-side (not a 403) — since the session's own branch is always authoritative, there's nothing to reject, just nothing to honor from the client.
- Unknown `branchId`/`orderingPointId` anywhere → `NotFoundError` (404), consistent with existing patterns.

## Testing

- `lib/branchService.test.ts` (new) — CRUD, password rotation + collision rejection (`INV-15`), auto-created Counter ordering point on branch creation.
- `lib/orderingPointService.test.ts` (renamed/extended from `lib/tableService.test.ts`) — label uniqueness scoped to branch (`INV-14`), not global.
- `lib/orderService.test.ts` (extended) — `branchId` snapshot captured correctly at creation and unaffected by later ordering-point changes (`INV-13`); sold-out check resolves per-branch (`INV-7`); dual open/closed gate (`INV-10`).
- `lib/authService.test.ts` / `lib/session.test.ts` / `lib/authGuard.test.ts` (extended) — login resolves the correct branch from a branch-scoped password; staff session forces its own `branchId` regardless of query params; admin session is unrestricted.
- `app/api/orders/route.test.ts` (extended) — `?branchId=` filtering for admin; staff's param is ignored/overridden.
- Migration itself — verified against a real `docker compose` build (per this project's established practice, `BUILD_STATUS.md` gotchas): existing QR codes still resolve, existing staff password still logs into Main, existing sold-out items still show sold out in Main after migration.

## Rollout

- Non-additive migration (documented in full above) — requires the explicit sign-off already given in this conversation before landing.
- Work branches off `dev` per the project's pipeline convention, PR/squash back into `dev`.
- Given the size, this will likely be split into multiple implementation-plan tasks (schema/migration first, then auth, then admin UX, then dashboard filtering) rather than one flat task list — left to the `writing-plans` phase to sequence.
