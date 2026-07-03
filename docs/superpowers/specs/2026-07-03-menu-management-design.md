# Story 3 — Menu Management (Admin) — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Menu · Follows `02-domain-model.md` (MenuItem aggregate), `05-api-conventions.md`, `06b-engineering-decisions.md`.

## Data model

New `MenuItem` model, additive migration (no existing tables touched):

```prisma
model MenuItem {
  id        String   @id @default(uuid())
  name      String
  price     Decimal  @db.Decimal(10, 2)
  available Boolean  @default(true)
  archived  Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

- `price` uses `Decimal(10,2)` for currency accuracy (no float rounding). Prisma surfaces this as a `Decimal.js` object in JS — convert at the API boundary (`.toNumber()` / `.toString()` as appropriate) rather than passing it through raw.
- `available` (sold out toggle) and `archived` (removed from menu) are independent booleans. Both are meant to be reversible in the domain, but this story only builds the archive direction — no restore/unarchive UI. If a real need for restoring an archived item surfaces later, it's a small follow-up, not part of this story (YAGNI).
- "Delete" never hard-deletes. This replaces the acceptance criterion's "rejected or soft-deleted" choice with soft-delete-always: setting `archived = true` requires no check for OrderItem references (which don't exist until Story 5 anyway) and guarantees `INV-3` price/name snapshots on past orders are never at risk, since the row is never removed.

## Service layer — `lib/menuService.ts`

Mirrors `lib/tableService.ts`'s shape:

- `createMenuItem(name: string, price: Prisma.Decimal): Promise<MenuItem>`
- `updateMenuItem(id: string, data: { name?: string; price?: Prisma.Decimal; available?: boolean }): Promise<MenuItem>` — throws `NotFoundError` if the id doesn't exist.
- `archiveMenuItem(id: string): Promise<void>` — sets `archived = true`; throws `NotFoundError` if the id doesn't exist.
- `listMenuItems(): Promise<MenuItem[]>` — returns non-archived items only, ordered by `name`.

## API routes — `app/api/menu-items/`

Per `05-api-conventions.md` conventions (flat error envelope, status codes, `requireApiRole` guard at the top of each handler, never inline):

- `GET /api/menu-items` → `requireApiRole('staff')` → `200` + array (staff and admin can view; empty array if none, never `404`).
- `POST /api/menu-items` → `requireApiRole('admin')` → validates `name` (non-empty string) and `price` (positive number) are both present → `400 ValidationError` if either is missing/invalid → `201` + created item.
- `PATCH /api/menu-items/:id` → `requireApiRole('admin')` → partial update of any of `name` / `price` / `available` → `404` if not found → `200` + updated item.
- `DELETE /api/menu-items/:id` → `requireApiRole('admin')` → archives the item → `404` if not found → `204`.

No new error types needed — reuses `ValidationError` (400), `NotFoundError` (404), `ForbiddenError` (403, thrown by `requireApiRole`), routed through the existing `handleApiError()` wrapper.

## UI — `app/admin/menu-items/page.tsx`

Mirrors `app/admin/tables/page.tsx`'s shape:

- Server component calls `requireRole('staff')` to gate the page (staff or admin may load it; anyone below `staff` redirects to `/login`).
- Fetches `listMenuItems()` server-side.
- If `session.role === 'admin'`: renders a `CreateMenuItemForm` (name + price inputs) above the list, and each list row renders as an inline edit form — name input, price input, `available` checkbox, and an "Archive" button — each posting to the relevant endpoint via the shared `apiClient`.
- If `session.role === 'staff'`: renders the same list as plain read-only rows (name, price, available badge) — no form, no edit controls, no archive button.

## Testing

Follows `06b` §7 (Vitest unit + "integration" — collapsed MVP form, mocked prisma/service rather than a real DB, matching the existing `tableService.test.ts` / `api/tables/route.test.ts` pattern):

- `lib/menuService.test.ts` — unit tests for all four service functions against a mocked `prisma.menuItem`.
- `app/api/menu-items/route.test.ts` (GET/POST) and `app/api/menu-items/[id]/route.test.ts` (PATCH/DELETE) — mock `menuService` and `requireApiRole`, assert status codes and error envelopes for success, validation failure, not-found, and forbidden-role cases, matching `api/tables/route.test.ts`'s structure.

## Scope boundary

Does not touch: order flow (Story 5), table setup (Story 2/existing), customer menu view (Story 4 — will consume `listMenuItems()`-shaped data later but that page isn't built here).
