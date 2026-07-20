# Menu Management customer-mirror redesign — Design

**Date.** 2026-07-20
**Source.** User-directed, post-epic. Builds directly on the just-implemented menu-categories feature (`docs/superpowers/specs/2026-07-20-menu-categories-design.md`, branch `feature/menu-categories`) — this is a UI/UX follow-up on the same branch, not a separate story.

## Problem

The admin Menu Management page (`/admin/menu-items`) and the customer-facing menu (`/order`) currently share zero markup or CSS. Customer items render as a simple tappable `.menu-item-button` (name left, price right) grouped under `.menu-category`/`.menu-category__title` headings. Admin items render as boxed `.menu-admin-row` list items with a completely different visual shell (Edit/Save/Archive buttons, a `<select>`, a slider toggle), and category management (rename/reorder/delete) lives in a separate panel above the item list.

The consequence: admin has no way to see what the actual customer menu looks like while editing it — they have to tab over to `/order` and reload to check. There's also no way to add an item "into" a category the way a customer would encounter it; the existing "Add menu item" form is a flat, category-agnostic form at the top of the page.

## Scope

**In scope.**
- A shared `app/components/MenuGroups.tsx` component that owns the grouped-list structure (`.menu-categories` → `.menu-category`/heading → item list), used by the customer menu (`Cart.tsx`), the admin page, and the staff (non-admin) view — heading and item rendering are injected via render props so each consumer supplies its own content while sharing the same structural markup/CSS classes.
- A single `lib/groupByCategory.ts` grouping utility replacing the two independently-written, differently-shaped grouping functions currently in `Cart.tsx` and `app/admin/menu-items/page.tsx`.
- Admin item rows restyled to the customer's collapsed look (name + price), with a small availability toggle, expanding inline on click to reveal edit fields (name, price, category select, Save/Cancel/Archive) — replacing today's boxed `.menu-admin-row` shell.
- Category headings become interactive for admin: click to reveal rename input and delete control — replacing the separate "Categories" panel above the item list. (Reordering is no longer a per-heading control — see the reorder-mode bullet below.)
- A dedicated **reorder mode** for arranging category order (admin only): a "Reorder categories" toggle collapses every category section to a short, draggable heading-only bar (all bars visible at once); admin drags bars into the desired order — or, as the keyboard-accessible path, focuses a bar and uses its small up/down controls — then "Done" commits the new order and expands the sections back. Reordering happens in the mirrored view itself (not a separate panel) so the order admin arranges is literally the order customers will read. Drag reorders a client-side draft; nothing persists until "Done", and "Cancel" discards the draft. This replaces the old up/down-arrow-per-row mechanism entirely.
- Per-category "+ Add item" footer (admin only) that expands an inline create form pre-scoped to that category (no category picker needed) — including for the virtual "Uncategorized" bucket, which creates an item with `categoryId: null`.
- A page-level "+ Add category" footer (admin only) replacing the current `CreateCategoryForm` panel.
- Staff (non-admin) gets the same collapsed row/heading visuals as admin, minus all edit/rename/reorder/delete/add affordances — matching today's `editable`/`isAdmin` gating, just restyled.
- Full rewrite of the affected test suites (`Cart.test.tsx`, admin `page.test.tsx`, and the tests for whatever new components replace `MenuItemRow.tsx`/`CategoryRow.tsx`/`CreateMenuItemForm.tsx`/`CreateCategoryForm.tsx`) targeting the new component boundaries.
- Visual/spacing/motion polish work during implementation follows the `frontend-design` skill's guidance — this spec fixes structure and interaction, not pixel-level detail.

**One new endpoint (everything else reused).** Category reordering moves from the per-step `PATCH /api/categories/:id/move` (one swap per call) to a single batch `PATCH /api/categories/reorder` that takes the full ordered id list and rewrites all `sortOrder` values in one transaction — the natural fit for a drag that can move a category several positions in one gesture. `PATCH /api/menu-items/:id`, `POST /api/menu-items`, `POST/PATCH/DELETE /api/categories` are all reused as-is; only the UI triggering them changes. The old `PATCH /api/categories/:id/move` route + its `moveCategory` service function + their tests are **removed** — nothing calls them after this redesign, and keeping dead endpoints around is exactly the kind of drift this cleanup avoids.

**Out of scope.**
- Drag-and-drop for *items* (reassigning an item to a different category by dragging it) — item→category assignment stays the inline category `<select>` on the item's edit form. Only *category* order is drag-reorderable. Revisit item-drag only if the select proves clumsy in practice.
- Any change to `docs/design/02-domain-model.md` — no new entity, invariant, or state machine. Purely a presentation-layer + one-additive-endpoint change on top of the already-shipped data model.
- Branch-scoped behavior — unaffected; `branchId`/availability-toggle plumbing carries over unchanged into the new row shape.

## Decisions

- **One shared structural component (`MenuGroups`), not three separate near-identical implementations.** With three real consumers (customer, staff, admin) all needing "grouped items under category headings," a shared component is the only way "admin sees what customers see" is a guarantee rather than a maintenance promise. Content (heading, item row, footer rows) is injected via render props rather than a `mode` switch inside one large component, so each consumer's logic (add-to-cart vs. expand-to-edit) stays in its own file rather than branching inside a shared one.
- **One interaction rule for editing: click to expand, click away/Cancel to collapse.** Applies uniformly to item rows, category-heading rename/delete, and both "+ Add" affordances. Category *reordering* is the one deliberate exception — it's a distinct, occasional, whole-list task, so it gets its own focused mode rather than being crammed into the per-heading click behavior.
- **Reordering is a mode, not a per-row control, and drags a client-side draft committed on "Done".** Collapsing sections to short heading bars during reorder means the drag targets stay small and all-visible even when a category holds many items — avoiding the "drag a tall section across a long page" problem of always-draggable sections. Every reorder (drag or keyboard) commits as one batch write of the complete order, which is both the clean fit for multi-position drags and incidentally atomic — this resolves `ISSUE-25` (the old `moveCategory`'s non-atomic read-then-write), since that function and its endpoint are removed.
- **Drag alone would fail the keyboard-accessibility floor, so each reorder bar keeps small up/down controls as the keyboard path.** These live only inside reorder mode (not cluttering normal editing), and mutate the same client-side draft the drag does — so there's one persistence path (the batch commit on "Done"), not two.
- **The "Uncategorized" bucket's heading is never interactive and never reorderable** (no rename/delete/drag — it isn't backed by a real `Category` row and is always pinned last), but it does get its own "+ Add item" footer, consistent with how the customer view's "Other" bucket is also non-interactive display-only.
- **One additive endpoint, no data-model change.** The batch reorder endpoint is the only new API surface; everything else this redesign triggers already has a working endpoint from the menu-categories feature.

## Components & data flow

### `lib/groupByCategory.ts` (new, replaces two existing functions)

```ts
export function groupByCategory<T extends { category: { id: string; name: string; sortOrder: number } | null }>(
  items: T[],
  categories: { id: string; name: string; sortOrder: number }[],
): Array<{ id: string; name: string; items: T[] }>
```

Behavior matches the admin page's current `groupItemsByCategory` (categories iterated in their given order — already `sortOrder`-ascending from `listCategories()` — filtered to non-empty groups, uncategorized items appended last as `{ id: 'uncategorized', name: 'Uncategorized', items }` only if non-empty). `Cart.tsx` switches to this function and adapts its render to the `{id, name, items}` shape (dropping its own `{label, items}`/`Infinity`-sortOrder version); its "Other" label is a prop/constant passed to the render layer, not baked into the grouping function, since the label text ("Other" vs "Uncategorized") is a per-surface presentation choice.

### `app/components/MenuGroups.tsx` (new)

```tsx
type MenuGroups<T> = {
  groups: Array<{ id: string; name: string; items: T[] }>
  renderHeading: (group: { id: string; name: string }) => React.ReactNode
  renderItem: (item: T) => React.ReactNode
  renderGroupFooter?: (group: { id: string; name: string }) => React.ReactNode
  footer?: React.ReactNode
}
```

Renders the `.menu-categories` → (`.menu-category` → `renderHeading` + `.menu-list`/`ul` of `renderItem` + optional `renderGroupFooter`) structure, then the optional page-level `footer` after all groups. No business logic, no state — pure structural/CSS-class ownership.

### Customer (`app/order/Cart.tsx`)

- `renderHeading`: plain `<h2 className="menu-category__title">{group.id === 'uncategorized' ? 'Other' : group.name}</h2>`. The shared `groupByCategory` function's uncategorized entry always carries `name: 'Uncategorized'` (a neutral, surface-agnostic default); each consumer's `renderHeading` is where the "Other" (customer) vs. "Uncategorized" (admin/staff) label choice actually happens, keyed off the group's fixed `id: 'uncategorized'` sentinel rather than its display name.
- `renderItem`: today's existing `.menu-item-button` (tap to add to cart), unchanged behavior.
- No `renderGroupFooter`/`footer` passed (customer gets no add affordances).

### Staff/Admin (`app/admin/menu-items/page.tsx` + new row/header components)

- `app/admin/menu-items/MenuItemCard.tsx` (replaces `MenuItemRow.tsx`): collapsed state = customer-style row (name, price) + availability toggle; admin-editable clicking anywhere on the row except the toggle expands inline edit fields (name, price, category `<select>`, Save/Cancel/Archive), mirroring today's `MenuItemRow`'s existing save/archive/availability logic exactly — only the visual shell and expand trigger change. Staff (non-editable) sees the same collapsed shape with an interactive toggle and no expand behavior.
- `app/admin/menu-items/CategoryHeader.tsx` (replaces the separate Categories panel + `CategoryRow.tsx`): collapsed = plain heading text; admin-clicked expands rename input + delete control, reusing today's `CategoryRow`'s existing rename/delete logic (the move-up/move-down logic is dropped — reordering is now the separate mode below). The virtual "Uncategorized" group renders through a non-interactive plain-heading path (no `CategoryHeader`, just static text), since it has no backing `Category` id to act on.
- `app/admin/menu-items/CategoryReorder.tsx` (new): the reorder-mode UI. Triggered by a "Reorder categories" button in the admin page's header area (admin only, hidden when fewer than two real categories exist — nothing to reorder). While active, the normal `MenuGroups` render is replaced by a vertical list of short, draggable bars, one per real category in current order, each carrying a drag grip and small up/down keyboard controls. Both drag and the up/down controls mutate one local `orderedIds` draft; "Done" sends it to `PATCH /api/categories/reorder` and, on success, `router.refresh()`es back to normal view; "Cancel" discards the draft and exits with no request. The drag itself is hand-rolled on Pointer events (no new dependency — the project's dependency set stays minimal, and a single short single-column list is tractable to hand-roll); auto-scroll near the viewport edges handles a category count taller than the screen. Reduced-motion is respected (no drag-follow animation when the user prefers reduced motion — the bar still reorders, just without the smooth transform).
- `app/admin/menu-items/AddItemRow.tsx` (new, replaces the top-of-page `CreateMenuItemForm.tsx` as the only way to create an item): a collapsed "+ Add item" row; expanded reveals name + price fields, POSTs to `/api/menu-items` then immediately `PATCH`es the new item's `categoryId` to the enclosing group's id (or omits the PATCH entirely for the Uncategorized group, since `categoryId` defaults to unset). Rendered once per group via `renderGroupFooter`, admin-only.
- `app/admin/menu-items/AddCategoryRow.tsx` (new, replaces `CreateCategoryForm.tsx`): a collapsed "+ Add category" row rendered once via `MenuGroups`'s `footer` prop, admin-only; expanded reveals a name field, POSTs to `/api/categories`.

### API + service for reorder (new)

- `PATCH /api/categories/reorder` — admin-only. Body `{ orderedIds: string[] }`. Validates that `orderedIds` is exactly the set of all existing category ids (no missing, no extra, no duplicates) — a stale client whose list doesn't match the current categories is rejected with `400` rather than silently corrupting `sortOrder`. On success, `200`.
- `lib/categoryService.ts` gains `reorderCategories(orderedIds: string[]): Promise<void>` — loads all categories, asserts the id set matches (throwing `ValidationError` otherwise), then in one `prisma.$transaction` sets each category's `sortOrder` to its index in `orderedIds`. Its `moveCategory` function is removed in the same change.
- Removed: `app/api/categories/[id]/move/route.ts` (+ test), `moveCategory` (+ its tests in `categoryService.test.ts`). `ISSUE-25` is marked Resolved, since the non-atomic code it described no longer exists.

### Data flow, unchanged from today

`app/admin/menu-items/page.tsx` still does the same `Promise.all([getBranchOrThrow, listMenuItemsWithAvailability, listCategories])` server-side fetch; only what it renders with that data changes.

## Error handling

Unchanged from today's per-component pattern: each mutating action (`Save`, `Archive`, `Delete`, `+ Add item`, `+ Add category`) shows its own inline `role="alert"` error and keeps its expanded/editing state open on failure, exactly as `MenuItemRow`/`CategoryRow` already do — this redesign moves where that logic lives, not how it behaves. Reorder mode's "Done" commit surfaces a failed `PATCH /api/categories/reorder` as an inline error within the reorder UI and keeps the draft order intact so the admin can retry or Cancel — it does not silently drop the reorder or exit the mode on failure.

## Testing

- `lib/groupByCategory.test.ts` — grouping/ordering/uncategorized-last behavior (supersedes the grouping-specific test coverage currently embedded in `Cart.test.tsx` and the admin `page.test.tsx`).
- `app/components/MenuGroups.test.tsx` — render-prop wiring: groups render in order, `renderHeading`/`renderItem`/`renderGroupFooter`/`footer` are called with the right data and appear in the right structural position.
- `app/order/Cart.test.tsx` — rewritten to drive the new shared component; existing cart-interaction tests (add/remove/quantity/checkout) are unaffected by this redesign and are preserved, only the category-grouping-specific tests change to reflect the new grouping utility.
- `app/admin/menu-items/MenuItemCard.test.tsx`, `CategoryHeader.test.tsx`, `AddItemRow.test.tsx`, `AddCategoryRow.test.tsx` — new test files per new component, covering collapsed/expanded states and each mutating action's success/error paths, following the same coverage shape as today's `MenuItemRow.test.tsx`/`CategoryRow.test.tsx` (which they replace).
- `app/admin/menu-items/CategoryReorder.test.tsx` — new: entering/leaving reorder mode, the keyboard up/down controls mutating the draft order, "Done" firing `PATCH /api/categories/reorder` with the final `orderedIds` and refreshing, "Cancel" discarding with no request, and the commit-failure path keeping the draft + showing an inline error. (Pointer-drag itself is exercised in the manual smoke pass rather than simulated in jsdom, where drag physics don't render — the keyboard path is what's unit-tested, and it shares the same draft/commit logic.)
- `app/api/categories/reorder/route.test.ts` + `reorderCategories` cases in `categoryService.test.ts` — the batch endpoint's admin gating, the id-set-mismatch `400`, and the successful transactional rewrite. The old `move` route/service tests are deleted alongside their code.
- `app/admin/menu-items/page.test.tsx` — rewritten to assert the new component wiring (groups passed to `MenuGroups`, admin-only footers + "Reorder categories" button present/absent, staff sees no edit affordances).
- A manual Docker/Playwright smoke pass (this repo's `.claude/skills/verify/SKILL.md` recipe) verifying: admin can expand an item, change its category, and see it move to the new group's section without a page reload; admin can add a category and an item into it inline; admin can enter reorder mode, drag a category to a new position, click Done, and see both the admin view and the customer `/order` view reflect the new order — since automated tests alone can't confirm the two views visually agree or that pointer-drag physics work.
