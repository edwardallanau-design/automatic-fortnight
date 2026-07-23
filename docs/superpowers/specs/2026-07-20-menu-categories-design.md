# Menu categories — Design

**Date.** 2026-07-20
**Source.** User-directed, post-epic (matches the naming convention `BUILD_STATUS.md` uses for stories added after the MVP epic). Not tied to a numbered story in `07-epic-map.md`.

## Problem

The menu is currently a flat list — every `MenuItem` (`prisma/schema.prisma`) has no notion of grouping. The customer-facing menu (`app/order/Cart.tsx`) fakes categorization today via a hardcoded regex table (`CATEGORIES`, lines 23-29) that matches item *names* against patterns like `/espresso|americano|cappuccino/i` to guess a label such as "Espresso Drinks." This is:
- **Coffee-shop-specific** — silently mis-groups (or dumps into the "More" catch-all) any menu for a different kind of restaurant.
- **Not admin-controlled** — there is no way to create, rename, reorder, or assign categories; the grouping is entirely inferred from naming conventions nobody chose on purpose.

This design replaces the regex hack with a real `Category` entity that admin manages in Menu Management and assigns items to, consistently reflected on both the admin and customer views.

## Scope

**In scope.**
- New `Category` entity: name + manually-controlled display order (`sortOrder`).
- `MenuItem` gains an optional `categoryId` — items may remain uncategorized.
- Admin CRUD for categories (create, rename, reorder via up/down, delete) inside the existing Menu Management page (`/admin/menu-items`).
- Assigning/reassigning an item's category from its row in Menu Management.
- Customer menu (`Cart.tsx`) groups items by real category data instead of the regex hack; uncategorized items render under a generic "Other" group, always last.
- Admin menu list also groups by category, mirroring the customer view.

**Out of scope.**
- Category uniqueness enforcement — considered and deliberately rejected (see Decisions below).
- Per-branch categories — `MenuItem` is already a global aggregate (`02-domain-model.md`), not branch-scoped; categories follow the same scope. Only per-branch sold-out status exists today, and this design doesn't touch that.
- Drag-and-drop reordering — a handful of categories on a single-restaurant menu doesn't need it; up/down buttons are sufficient.
- Any change to `02-domain-model.md`'s existing invariants or state machines. This is a new, additive concept (a `Category` grouping) layered on top of `MenuItem`, not a change to how `MenuItem`, `Order`, or any existing entity behaves.
- Multi-level/nested categories (category-of-categories) — flat list only, matches every existing grouping concept in this app (branches, ordering points are all flat lists).

## Decisions

- **No uniqueness constraint on category name.** Initially proposed matching `OrderingPoint.label`'s uniqueness (`INV-14`), but that invariant exists because a duplicate *table* label creates real operational risk (an order or QR code pointing to the wrong physical location). A duplicate *category* name has no such consequence — categories aren't used for analysis or reporting, only presentation — so the worst case is a cosmetically confusing customer menu (two "Desserts" headers), which admin caused and can fix with the same rename/delete tools used for anything else. Enforcing uniqueness would add a service-layer check, a `409` error path, and tests for a purely cosmetic scenario. Rejected per YAGNI.
- **Category assignment happens after item creation, not during.** `POST /api/menu-items` stays name+price only; a new item lands uncategorized and gets assigned via its row's category selector afterward. Keeps the create form unchanged rather than growing a category picker for what's a secondary, optional action.
- **Deleting a category unassigns its items rather than being blocked.** Enforced at the DB level via `onDelete: SetNull` on `MenuItem.categoryId` — no service-layer cleanup code needed, no risk of forgetting it.

## Data model

```prisma
model Category {
  id        String     @id @default(uuid())
  name      String
  sortOrder Int
  createdAt DateTime   @default(now())
  menuItems MenuItem[]
}
```

`MenuItem` gains:
```prisma
categoryId String?
category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
```

Both changes are additive (new table, new nullable column) — no existing column type changes, no destructive migration.

`lib/menuService.ts`'s `listMenuItems`/`listMenuItemsWithAvailability` add `include: { category: true }` so both the admin and customer pages get category data in the same query, no extra round-trip.

## Components & data flow

### Service layer — `lib/categoryService.ts` (new)

```ts
listCategories(): Promise<Category[]>          // ordered by sortOrder

createCategory(name: string): Promise<Category>
// - trims name, rejects empty (ValidationError)
// - sortOrder = (max existing sortOrder) + 1, or 0 if none exist

renameCategory(id: string, name: string): Promise<Category>
// - NotFoundError if id doesn't exist

moveCategory(id: string, direction: 'up' | 'down'): Promise<void>
// - swaps sortOrder with the adjacent sibling in that direction
// - no-op if already at the top/bottom

deleteCategory(id: string): Promise<void>
// - hard delete; onDelete: SetNull unassigns items automatically
// - NotFoundError if id doesn't exist
```

### API — new routes, following `05-api-conventions.md`

No `GET /api/categories` route — `/admin/menu-items` is a server component that reads `categoryService.listCategories()` directly and passes the list down as props (to the new Categories panel, the per-row `<select>`, etc.), matching the existing `VenueSettings`/`branchService` precedent (see `docs/superpowers/specs/2026-07-11-multi-branch-admin-ux-design.md`'s "no `GET /api/branches` route" note) — no client-side fetch of the category list ever happens.

- `POST /api/categories` — `requireApiRole('admin')`, body `{ name }`, `201` + created category. `400` if name missing/empty.
- `PATCH /api/categories/:id` — `requireApiRole('admin')`, body `{ name }`, `200` + updated category. `404` if unknown id.
- `PATCH /api/categories/:id/move` — `requireApiRole('admin')`, body `{ direction: 'up' | 'down' }`, `200`. `400` if direction isn't one of those two values. `404` if unknown id.
- `DELETE /api/categories/:id` — `requireApiRole('admin')`, `204` regardless of prior state (matches existing `DELETE` convention).

Existing `PATCH /api/menu-items/:id` gains an optional `categoryId` field (`string | null`): `null` unassigns, a string is validated against `Category` existing (`404` if not) before the update.

### Admin UX — `/admin/menu-items` (`app/admin/menu-items/page.tsx`)

- **New "Categories" panel** (admin-only), positioned above the existing "Add menu item" form: a list of category rows, each with inline rename (same edit-toggle pattern as `MenuItemRow`), up/down reorder buttons, and a delete button. Delete opens the existing `ConfirmDialog` component (already used for item Archive), warning that items in the category will become uncategorized.
- **New "Add category" form**, mirroring `CreateMenuItemForm`'s shape: name input + submit.
- **Item list becomes grouped**: items render under their category's heading in `sortOrder`, with an "Uncategorized" group last (shown only if non-empty). Within a group, items keep the existing alphabetical-by-name sort — unchanged.
- **`MenuItemRow` gains a category `<select>`**, admin-editable only (same `editable` gate already used for name/price/archive): options are every category plus "No category." Staff (view-only) sees the assigned category as plain text, matching how they already see read-only name/price.

### Customer UX — `app/order/Cart.tsx`

- The `CATEGORIES`/`categorize()` regex hack (lines 23-48) is deleted entirely.
- Items already carry their real `category` (name + `sortOrder`, or `null`) from the server; `Cart` groups by `category.id`, ordered by `category.sortOrder`.
- Uncategorized items form a final group under a generic heading ("Other"), always rendered last regardless of where `sortOrder` values land among real categories — so it reads as a deliberate catch-all, not a mis-sorted category.
- A category with zero items doesn't render — same behavior as today's `categorize()`, which already filters empty groups.
- Sold-out items keep showing (disabled, not hidden) within their group — unchanged.

## Error handling

- Empty/missing category name (create or rename) → `ValidationError` (400).
- Unknown category id (rename, move, delete, or assigning via `PATCH /api/menu-items/:id`) → `NotFoundError` (404).
- Invalid `direction` value on move → `ValidationError` (400).
- No new `ConflictError` (409) path — duplicate names are allowed per the Decisions section above.

## Testing

Following this repo's existing Vitest-per-layer pattern:
- `lib/categoryService.test.ts` — create/rename/move/delete behavior, including delete-unassigns-items and move-at-boundary no-ops.
- `app/api/categories/route.test.ts`, `app/api/categories/[id]/route.test.ts`, `app/api/categories/[id]/move/route.test.ts` — auth gating (admin vs staff vs unauthenticated), validation, status codes.
- `MenuItemRow.test.tsx` — category select renders and submits correctly for admin; renders as read-only text for staff.
- `Cart.test.tsx` — grouping by real category data (replacing the existing regex-based grouping tests), uncategorized-last ordering, empty-category omission.
- `page.test.tsx` (admin menu-items) — grouped rendering, uncategorized bucket, category panel CRUD.

No new Playwright/e2e script — the existing MVP e2e path (scan → order → confirm → pay) doesn't touch menu management and this feature only changes item presentation within that flow, not its mechanics.
