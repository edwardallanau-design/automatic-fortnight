# Business hours toggle + staff sold-out access — Design

**Date.** 2026-07-09
**Epic map source.** `docs/design/07-epic-map.md`, backlog item "Business hours / order-acceptance toggle" (raised 2026-07-08), bundled with a related access-control adjustment raised in the same conversation: letting Staff (not just Admin) mark menu items sold out.

## Problem

Two related gaps in the current build:

1. There is no way to stop the venue from accepting new orders. The moment the kitchen closes, is overwhelmed, or the venue simply isn't open yet, customers can still scan a table's QR code and submit an order, and staff can still start a staff-assisted order via `/order/new`. There's no "closed" state anywhere in the system.
2. Marking a menu item sold out currently requires the admin role and lives inside the name/price edit form (`MenuItemRow.tsx`) — a workflow mismatch, since running out of an item is a floor-staff event that happens far more often than a menu edit, and today's flow forces opening a full edit form just to flip one flag.

## Scope

**In scope.**
- A venue-wide `acceptingOrders` flag, admin-controlled, that blocks *all* new order creation (customer QR and staff-assisted alike) when off.
- A dedicated admin settings page (`/admin/settings`) hosting this toggle, styled as a slider switch.
- A customer-facing "closed" screen on `/order` when `acceptingOrders` is false, replacing the menu.
- Extending the existing per-item `available` (sold-out) toggle to the `staff` role, and moving its UI out of the name/price edit form into a standalone slider control on each menu item row, visible to staff and admin alike.

**Out of scope.**
- Scheduled/timed hours (open at X, close at Y) — this is a manual on/off switch only. Explicitly deferred; see epic map's original backlog note.
- Any role-based override of the closed state (e.g. "admin can still order while closed") — closed means closed for everyone, no exceptions.
- Any other venue settings beyond this one flag. The settings page is architected to hold more later but nothing else is being added now.
- Changes to `INV-7` (sold-out blocks new OrderItems) — unchanged, this work only changes who may flip the flag and where the control lives.

## Domain model changes

Additive to `docs/design/02-domain-model.md`.

**New entity.**
> **VenueSettings** — a singleton (`acceptingOrders: boolean`, default `true`) — venue-wide operational state, no lifecycle beyond this one flag today. Owner/Admin is the only actor who may change it.

**New invariant.**
> **`INV-10`** A new Order may be created only while `VenueSettings.acceptingOrders = true`. This applies uniformly regardless of who submits it (customer QR or staff-assisted) — there is no role-based override.

**Existing invariant clarified, not changed.** `INV-7` (sold-out MenuItem blocks new OrderItems) is unaffected. The *state machine* for `MenuItem.available` in `02-domain-model.md` already documents `Staff or Owner/Admin toggles` as the trigger — the current code (admin-only) has been stricter than the documented model; this work brings the implementation in line with the existing model rather than changing it.

## Data model

New Prisma model (additive migration):

```prisma
model VenueSettings {
  id              String   @id @default(uuid())
  acceptingOrders Boolean  @default(true)
  updatedAt       DateTime @updatedAt
}
```

Singleton by convention, not a DB constraint — the service layer looks up the first row and lazily creates one with defaults if none exists yet, matching this codebase's existing light-touch approach to small fixed-row tables (e.g. `Credential`).

No schema change for sold-out — `MenuItem.available` already exists (`prisma/schema.prisma`).

## Components & data flow

### Business hours toggle

- **`lib/venueSettingsService.ts`** (new) — `getVenueSettings()` (get-or-create), `setAcceptingOrders(acceptingOrders: boolean)`.
- **`app/admin/settings/page.tsx`** (new) — `requireRole('admin')`. Server component, reads `getVenueSettings()` directly, renders `AcceptingOrdersToggle` with the current value.
- **`app/admin/settings/AcceptingOrdersToggle.tsx`** (new) — client component. A slider-style toggle switch (visually a sliding switch, not a checkbox — styled to match the café-ticket visual language already established for admin controls). Calls `PATCH /api/venue-settings` with `{ acceptingOrders }`, then `router.refresh()`. Follows the same submitting/error-message pattern as `MenuItemRow.tsx`'s save flow.
- **`app/api/venue-settings/route.ts`** (new) — `PATCH` only, `requireApiRole('admin')`. Validates `acceptingOrders` is a boolean (`ValidationError` otherwise), calls `setAcceptingOrders`. No `GET` route — every consumer that needs the current value is a server component reading `venueSettingsService` directly, matching how `admin/tables` and `admin/menu-items` already read their data.
- **Enforcement point — `lib/orderService.ts`'s `createOrder()`** gains a check at the top: if `!(await getVenueSettings()).acceptingOrders`, throw `ConflictError('Not accepting orders right now')`. Because both the customer QR flow and the staff-assisted flow (`/order/new`'s table picker links into the same `/order?table=<id>` route, which posts to the same `POST /api/orders`) terminate in this one function, a single check covers both — no role branching needed.
- **Customer/staff UX — `app/order/page.tsx`** (existing, modified) also checks `getVenueSettings()` at render time. If closed, renders a "We're not accepting orders right now" message instead of the menu/Cart, mirroring the existing invalid-table-link error branch already in that file. This is the primary UX path; the `createOrder` check is defense-in-depth for any direct API caller (there is no session requirement on `POST /api/orders`, so this matters).

### Staff sold-out access

- **`app/api/menu-items/[id]/availability/route.ts`** (new) — `PATCH` only, `requireApiRole('staff')`. Body `{ available: boolean }` only (`ValidationError` if not boolean). Calls the existing `updateMenuItem(id, { available })`; `NotFoundError` (404) propagates unchanged if the id doesn't exist. The existing `app/api/menu-items/[id]/route.ts` PATCH is untouched and stays `admin`-only for name/price/archive.
- **`app/admin/menu-items/MenuItemRow.tsx`** (existing, modified) — the `Available`/`Sold out` badge becomes a standalone slider toggle rendered outside the edit form, in both view and edit states, enabled for any authenticated staff/admin viewer of the page. Toggling it calls the new availability endpoint directly and independently of Save/Cancel/Edit, then refreshes. The edit form's `available` checkbox (`menu-admin-row__checkbox-label`, lines 140–147 today) is removed entirely — availability is no longer part of the name/price edit flow.
- **`app/admin/menu-items/page.tsx`** (existing, modified) — already uses `requireRole('staff')` to admit staff onto the page at all; no route-guard change needed here. The `editable={isAdmin}` prop passed to each row continues to gate name/price/archive only; the new availability toggle is unconditional for any page viewer (staff or admin), since the page itself already requires at least staff.

## Error handling

- `createOrder`'s new closed-venue check throws `ConflictError` → existing `handleApiError` maps it to `409 CONFLICT`, the same pattern already used for sold-out-item rejection. No new error class.
- `app/order/page.tsx`'s render-time check is the primary defense — in normal operation nobody reaches the 409 path, since the menu/Cart isn't rendered when closed.
- `PATCH /api/venue-settings` — boolean validation → `ValidationError` (400); non-admin caller → `ForbiddenError` (403) via `requireApiRole('admin')`.
- `PATCH /api/menu-items/[id]/availability` — boolean validation → `ValidationError` (400); non-staff caller → `ForbiddenError` (403) via `requireApiRole('staff')`; unknown id → `NotFoundError` (404).
- No interaction with `INV-7` — venue-level (`INV-10`) and item-level (`INV-7`) gates are independent checks; both can independently block order creation for different reasons and both surface as `409 CONFLICT` with a distinct message.

## Testing

- `lib/venueSettingsService.test.ts` — get-or-create behavior (no row exists yet → creates default), `setAcceptingOrders` updates and persists.
- `lib/orderService.test.ts` — new case: `createOrder` throws `ConflictError` when `acceptingOrders=false`, regardless of table/items validity, with no role-based bypass path exercised (there is none).
- `app/api/venue-settings/route.test.ts` (new) — admin PATCH succeeds; staff PATCH gets 403; non-boolean body gets 400.
- `app/api/menu-items/[id]/availability/route.test.ts` (new) — staff PATCH succeeds; admin PATCH succeeds; non-boolean body gets 400; unknown id gets 404.
- `app/order/page.test.tsx` (existing, extended) — closed venue renders the closed message and no Cart; open venue renders the menu as today (existing invalid-table-link test is the template for this branch).
- `app/admin/menu-items/MenuItemRow.test.tsx` (existing, extended) — availability toggle calls the new endpoint independently of Save/Cancel; edit form no longer renders an `available` checkbox.
- `app/admin/settings/page.test.tsx` (new) — non-admin redirected to login (via `requireRole('admin')`); admin sees current state rendered.

## Rollout

- Additive Prisma migration only (`VenueSettings` table). No existing column/type changes — proceeds without a stop-rule pause per `CLAUDE.md`.
- Default `acceptingOrders=true` on the new table means existing behavior is unchanged until an admin explicitly visits `/admin/settings` and flips it off — no deployment-day behavior change.
- Work branches off `dev` per the project's pipeline convention (`BUILD_STATUS.md`), PRs back into `dev`.
