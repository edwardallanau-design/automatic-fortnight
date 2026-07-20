# Menu Management Customer-Mirror Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/admin/menu-items` so it renders the menu with the same category-grouped, customer-styled layout as `/order` — with edit controls layered inline and a dedicated drag-to-reorder mode for categories — so admin sees exactly what customers see while editing.

**Architecture:** Extract one shared presentational component (`MenuGroups`) and one grouping utility (`groupByCategory`) that the customer menu, the staff view, and the admin view all consume, so the two views can't visually drift. Admin item rows and category headings become collapsed/expandable in place; category ordering moves out of a top panel into a focused reorder mode backed by a new batch `PATCH /api/categories/reorder` endpoint (replacing the per-step `move` endpoint, which is deleted).

**Tech Stack:** Next.js 16 App Router (server + client components), Prisma/PostgreSQL, Vitest + Testing Library, hand-rolled Pointer-event drag (no new dependency).

**Spec:** `docs/superpowers/specs/2026-07-20-menu-management-mirror-design.md`

## Global Constraints

- **Shared structure is the single source of truth.** `app/components/MenuGroups.tsx` owns the grouped-list markup (`.menu-categories` → `.menu-category`/heading → `.menu-list`); customer (`Cart.tsx`), staff, and admin all render through it. Never re-implement the grouped-list markup in a consumer.
- **No new dependency.** The category drag is hand-rolled on Pointer events. Do not add `dnd-kit`, `react-beautiful-dnd`, or any drag library. `package.json` dependencies stay as they are.
- **Reorder commits as one batch write.** Both drag and the keyboard up/down controls mutate a single client-side `orderedIds` draft; nothing persists until "Done" fires `PATCH /api/categories/reorder` with the full ordered list; "Cancel" discards with no request.
- **Keyboard accessibility floor.** Each reorder bar keeps small up/down controls (the keyboard path); drag-only is not acceptable. Reduced motion (`prefers-reduced-motion`) is respected in the drag.
- **The "Uncategorized"/"Other" bucket is never interactive and never reorderable** (no rename/delete/drag, always last), but admin gets a "+ Add item" footer on it that creates an item with `categoryId: null`. Its `group.id` is the literal sentinel `'uncategorized'`.
- **Per-surface label:** the shared `groupByCategory` always names the uncategorized group `'Uncategorized'`; each consumer's `renderHeading` chooses the display label — customer shows `'Other'`, admin/staff show `'Uncategorized'` — keyed on `group.id === 'uncategorized'`.
- **Item→category assignment stays the inline `<select>`** on the item's edit form. Only *category order* is drag-reorderable; items are not draggable.
- **No data-model change.** No migration, no edit to `docs/design/02-domain-model.md`'s invariants/state machines. The only new API surface is `PATCH /api/categories/reorder`.
- **Branch:** all work happens on `feature/menu-categories` (the existing branch this redesign extends) — do not create a new branch or touch `dev` directly.
- **Existing route/handler conventions:** every API route calls `requireApiRole(...)` first, validates input shape by hand, delegates to a service module, and wraps the body in `try { ... } catch (error) { return handleApiError(error) }`.

---

### Task 1: `lib/groupByCategory.ts` — shared grouping utility

**Files:**
- Create: `lib/groupByCategory.ts`
- Create: `lib/groupByCategory.test.ts`

**Interfaces:**
- Produces: `groupByCategory<T extends { category: CategoryRef | null }>(items: T[], categories: CategoryRef[], options?: { includeEmptyCategories?: boolean }): Array<{ id: string; name: string; items: T[] }>` and the exported type `CategoryRef = { id: string; name: string; sortOrder: number }`. Consumed by Task 3's `MenuGroups` callers (`Cart.tsx` in Task 4, `page.tsx`/`MenuManager` in Task 9).
- Behavior matches the `groupItemsByCategory` function currently inlined in `app/admin/menu-items/page.tsx` (which Task 9 deletes): group items by `category.id`, iterate `categories` in given order, append an `{ id: 'uncategorized', name: 'Uncategorized', items }` group last only if there are uncategorized items. **Empty-category handling:** by default, categories with no items are dropped (correct for the customer view). With `{ includeEmptyCategories: true }` (the admin view), empty categories are kept — so an admin can see and add into a freshly-created or emptied category rather than having it silently disappear. The uncategorized group is still only appended when it actually has items, regardless of the option (there is no empty "uncategorized" to manage).

- [ ] **Step 1: Write the failing test**

Create `lib/groupByCategory.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupByCategory } from './groupByCategory'

const cats = [
  { id: 'c1', name: 'Mains', sortOrder: 0 },
  { id: 'c2', name: 'Drinks', sortOrder: 1 },
]

function item(id: string, category: { id: string; name: string; sortOrder: number } | null) {
  return { id, category }
}

describe('groupByCategory', () => {
  it('groups items under their category, in the given category order', () => {
    const result = groupByCategory(
      [item('m1', cats[1]), item('m2', cats[0])],
      cats,
    )
    expect(result.map((g) => g.name)).toEqual(['Mains', 'Drinks'])
    expect(result[0].items.map((i) => i.id)).toEqual(['m2'])
    expect(result[1].items.map((i) => i.id)).toEqual(['m1'])
  })

  it('omits categories with no items', () => {
    const result = groupByCategory([item('m1', cats[0])], cats)
    expect(result.map((g) => g.name)).toEqual(['Mains'])
  })

  it('appends an Uncategorized group last, only when uncategorized items exist', () => {
    const result = groupByCategory([item('m1', cats[0]), item('m2', null)], cats)
    expect(result.map((g) => g.name)).toEqual(['Mains', 'Uncategorized'])
    expect(result[result.length - 1].id).toBe('uncategorized')
  })

  it('does not append an Uncategorized group when every item has a category', () => {
    const result = groupByCategory([item('m1', cats[0])], cats)
    expect(result.some((g) => g.id === 'uncategorized')).toBe(false)
  })

  it('returns an empty array when there are no items', () => {
    expect(groupByCategory([], cats)).toEqual([])
  })

  it('keeps empty categories when includeEmptyCategories is set (admin view)', () => {
    const result = groupByCategory([item('m1', cats[0])], cats, { includeEmptyCategories: true })
    expect(result.map((g) => g.name)).toEqual(['Mains', 'Drinks'])
    expect(result[1].items).toEqual([])
  })

  it('with includeEmptyCategories, still omits an empty uncategorized group', () => {
    const result = groupByCategory([], cats, { includeEmptyCategories: true })
    expect(result.map((g) => g.id)).toEqual(['c1', 'c2'])
    expect(result.some((g) => g.id === 'uncategorized')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/groupByCategory.test.ts`
Expected: FAIL — `Cannot find module './groupByCategory'`.

- [ ] **Step 3: Write the implementation**

Create `lib/groupByCategory.ts`:

```ts
export type CategoryRef = { id: string; name: string; sortOrder: number }

export function groupByCategory<T extends { category: CategoryRef | null }>(
  items: T[],
  categories: CategoryRef[],
  options: { includeEmptyCategories?: boolean } = {},
): Array<{ id: string; name: string; items: T[] }> {
  const byCategoryId = new Map<string, T[]>()
  const uncategorized: T[] = []
  for (const item of items) {
    if (item.category) {
      const group = byCategoryId.get(item.category.id) ?? []
      group.push(item)
      byCategoryId.set(item.category.id, group)
    } else {
      uncategorized.push(item)
    }
  }
  const groups = categories
    .map((category) => ({ id: category.id, name: category.name, items: byCategoryId.get(category.id) ?? [] }))
    .filter((group) => options.includeEmptyCategories || group.items.length > 0)
  if (uncategorized.length > 0) {
    groups.push({ id: 'uncategorized', name: 'Uncategorized', items: uncategorized })
  }
  return groups
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/groupByCategory.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/groupByCategory.ts lib/groupByCategory.test.ts
git commit -m "Add shared groupByCategory utility"
```

---

### Task 2: Reorder backend — batch endpoint, remove per-step move

**Files:**
- Modify: `lib/categoryService.ts` (add `reorderCategories`, remove `moveCategory`)
- Modify: `lib/categoryService.test.ts` (add reorder tests, remove move tests)
- Create: `app/api/categories/reorder/route.ts`
- Create: `app/api/categories/reorder/route.test.ts`
- Delete: `app/api/categories/[id]/move/route.ts`
- Delete: `app/api/categories/[id]/move/route.test.ts`
- Modify: `ISSUES.md` (move ISSUE-25 to Resolved)

**Interfaces:**
- Produces: `reorderCategories(orderedIds: string[]): Promise<void>` — validates `orderedIds` is exactly the current set of category ids (throws `ValidationError` otherwise), then rewrites every category's `sortOrder` to its index in one `prisma.$transaction`. Consumed by the new route and by Task 8's `CategoryReorder`.
- Removes: `moveCategory` (no longer referenced after this task; Task 9 confirms nothing else imports it).

**Route-collision note:** `app/api/categories/reorder/route.ts` (static segment) and `app/api/categories/[id]/route.ts` (dynamic segment) coexist safely — Next.js App Router matches the static `reorder` segment before the dynamic `[id]`, so `PATCH /api/categories/reorder` never resolves to the rename handler.

- [ ] **Step 1: Write the failing service tests**

In `lib/categoryService.test.ts`, delete the entire `describe('categoryService.moveCategory', ...)` block and its imports of `moveCategory`. Add `reorderCategories` to the import from `./categoryService`, and add this block:

```ts
describe('categoryService.reorderCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const categories = [
    { id: 'c1', name: 'A', sortOrder: 0, createdAt: new Date() },
    { id: 'c2', name: 'B', sortOrder: 1, createdAt: new Date() },
    { id: 'c3', name: 'C', sortOrder: 2, createdAt: new Date() },
  ]

  it('rewrites sortOrder to match the given order, in one transaction', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)
    vi.mocked(prisma.category.update).mockReturnValue('op' as never)
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never)

    await reorderCategories(['c3', 'c1', 'c2'])

    expect(prisma.category.update).toHaveBeenNthCalledWith(1, { where: { id: 'c3' }, data: { sortOrder: 0 } })
    expect(prisma.category.update).toHaveBeenNthCalledWith(2, { where: { id: 'c1' }, data: { sortOrder: 1 } })
    expect(prisma.category.update).toHaveBeenNthCalledWith(3, { where: { id: 'c2' }, data: { sortOrder: 2 } })
    expect(prisma.$transaction).toHaveBeenCalledWith(['op', 'op', 'op'])
  })

  it('throws ValidationError when an id is missing from the order', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)
    await expect(reorderCategories(['c1', 'c2'])).rejects.toThrow(ValidationError)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the order contains an unknown id', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)
    await expect(reorderCategories(['c1', 'c2', 'nope'])).rejects.toThrow(ValidationError)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the order contains a duplicate id', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)
    await expect(reorderCategories(['c1', 'c1', 'c2'])).rejects.toThrow(ValidationError)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
```

Add `ValidationError` to the existing `import { NotFoundError } from './errors'` line so it reads `import { NotFoundError, ValidationError } from './errors'`. Ensure `reorderCategories` is added to the top `import { ... } from './categoryService'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/categoryService.test.ts`
Expected: FAIL — `reorderCategories` is not exported (and the removed `moveCategory` tests are gone).

- [ ] **Step 3: Update `lib/categoryService.ts`**

Remove the entire `moveCategory` function. Change the errors import to `import { NotFoundError, ValidationError } from './errors'`. Add:

```ts
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const categories = await prisma.category.findMany()
  const existingIds = new Set(categories.map((category) => category.id))
  const uniqueOrdered = new Set(orderedIds)
  const idSetMatches =
    orderedIds.length === categories.length &&
    uniqueOrdered.size === orderedIds.length &&
    orderedIds.every((id) => existingIds.has(id))
  if (!idSetMatches) {
    throw new ValidationError('orderedIds must contain each existing category id exactly once')
  }
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index } })),
  )
}
```

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `npx vitest run lib/categoryService.test.ts`
Expected: PASS.

- [ ] **Step 5: Delete the move route + test, write the reorder route test**

Delete both files:

```bash
git rm app/api/categories/[id]/move/route.ts app/api/categories/[id]/move/route.test.ts
```

Create `app/api/categories/reorder/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError, ValidationError } from '@/lib/errors'

vi.mock('@/lib/categoryService', () => ({
  reorderCategories: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { reorderCategories } from '@/lib/categoryService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/categories/reorder', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/categories/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 200 and forwards orderedIds to reorderCategories', async () => {
    vi.mocked(reorderCategories).mockResolvedValue(undefined)

    const res = await PATCH(makeRequest({ orderedIds: ['c2', 'c1'] }))

    expect(res.status).toBe(200)
    expect(reorderCategories).toHaveBeenCalledWith(['c2', 'c1'])
  })

  it('returns 400 when orderedIds is not an array of strings', async () => {
    const res = await PATCH(makeRequest({ orderedIds: [1, 2] }))

    expect(res.status).toBe(400)
    expect(reorderCategories).not.toHaveBeenCalled()
  })

  it('returns 400 when orderedIds is missing', async () => {
    const res = await PATCH(makeRequest({}))

    expect(res.status).toBe(400)
    expect(reorderCategories).not.toHaveBeenCalled()
  })

  it('maps a service ValidationError (stale id set) to 400', async () => {
    vi.mocked(reorderCategories).mockRejectedValue(new ValidationError('orderedIds must contain each existing category id exactly once'))

    const res = await PATCH(makeRequest({ orderedIds: ['c1'] }))

    expect(res.status).toBe(400)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makeRequest({ orderedIds: ['c1'] }))

    expect(res.status).toBe(403)
    expect(reorderCategories).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run to verify the route test fails**

Run: `npx vitest run app/api/categories/reorder/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Write the reorder route**

Create `app/api/categories/reorder/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { reorderCategories } from '@/lib/categoryService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function PATCH(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (!Array.isArray(body.orderedIds) || body.orderedIds.some((id: unknown) => typeof id !== 'string')) {
      throw new ValidationError('orderedIds must be an array of strings')
    }

    await reorderCategories(body.orderedIds)
    return NextResponse.json({}, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 8: Run the reorder route test to verify it passes**

Run: `npx vitest run app/api/categories/reorder`
Expected: PASS.

- [ ] **Step 9: Resolve ISSUE-25 in `ISSUES.md`**

Cut the `ISSUE-25` row from the `## Open` table and add it to the `## Resolved` table (`| ID | Summary | Found in | Root cause | Fix / commit |` shape):

```markdown
| ISSUE-25 | `categoryService.moveCategory` read the category list then wrote the sortOrder swap in a separate transaction — a non-atomic read-then-write two concurrent admins could interleave and corrupt | Menu categories feature, final whole-branch review | Two-step read-then-transactional-write with no read-write atomicity guard | Resolved by the menu-management mirror redesign: `moveCategory` and its `/api/categories/:id/move` route were removed entirely and replaced by `reorderCategories` / `PATCH /api/categories/reorder`, which validates the full id set and rewrites all sortOrders in a single `prisma.$transaction` — no separate read-then-write remains. |
```

- [ ] **Step 10: Run the full category test surface + type check**

Run: `npx vitest run lib/categoryService.test.ts app/api/categories && npx tsc --noEmit`
Expected: PASS, no type errors (confirms nothing still imports `moveCategory`).

- [ ] **Step 11: Commit**

```bash
git add lib/categoryService.ts lib/categoryService.test.ts app/api/categories/reorder ISSUES.md
git rm app/api/categories/[id]/move/route.ts app/api/categories/[id]/move/route.test.ts
git commit -m "Replace per-step category move with batch reorder endpoint; resolve ISSUE-25"
```

---

### Task 3: `app/components/MenuGroups.tsx` — shared structural component

**Files:**
- Create: `app/components/MenuGroups.tsx`
- Create: `app/components/MenuGroups.test.tsx`

**Interfaces:**
- Produces: `MenuGroups<T extends { id: string }>(props)` and exported type `MenuGroup<T> = { id: string; name: string; items: T[] }`. Props: `groups: Array<MenuGroup<T>>`, `renderHeading: (group: { id: string; name: string }) => ReactNode`, `renderItem: (item: T, index: number) => ReactNode`, `renderGroupFooter?: (group: { id: string; name: string }) => ReactNode`, `footer?: ReactNode`. Consumed by `Cart.tsx` (Task 4) and `MenuManager` (Task 9).
- `renderItem`'s `index` is the item's index within its group (used by the customer view for a per-group stagger; admin ignores it).
- No `'use client'` directive and no state — it is rendered client-side by its (client) consumers.

- [ ] **Step 1: Write the failing test**

Create `app/components/MenuGroups.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MenuGroups } from './MenuGroups'

type Item = { id: string; name: string }

const groups = [
  { id: 'c1', name: 'Mains', items: [{ id: 'm1', name: 'Burger' }] as Item[] },
  { id: 'uncategorized', name: 'Uncategorized', items: [{ id: 'm2', name: 'Mystery' }] as Item[] },
]

function renderBasic(extra?: Partial<React.ComponentProps<typeof MenuGroups<Item>>>) {
  return render(
    <MenuGroups<Item>
      groups={groups}
      renderHeading={(g) => <h2>{g.id === 'uncategorized' ? 'Other' : g.name}</h2>}
      renderItem={(item) => <span>{item.name}</span>}
      {...extra}
    />,
  )
}

describe('MenuGroups', () => {
  it('renders a heading per group in order, via renderHeading', () => {
    renderBasic()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Mains', 'Other'])
  })

  it('renders each group\'s items via renderItem inside a list', () => {
    renderBasic()
    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('Mystery')).toBeInTheDocument()
  })

  it('passes the within-group index to renderItem', () => {
    render(
      <MenuGroups<Item>
        groups={[{ id: 'c1', name: 'Mains', items: [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }] }]}
        renderHeading={(g) => <h2>{g.name}</h2>}
        renderItem={(item, index) => <span>{`${item.name}:${index}`}</span>}
      />,
    )
    expect(screen.getByText('A:0')).toBeInTheDocument()
    expect(screen.getByText('B:1')).toBeInTheDocument()
  })

  it('renders renderGroupFooter after each group\'s items when provided', () => {
    renderBasic({ renderGroupFooter: (g) => <button>{`add-to-${g.id}`}</button> })
    expect(screen.getByRole('button', { name: 'add-to-c1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'add-to-uncategorized' })).toBeInTheDocument()
  })

  it('renders the page-level footer once, after all groups', () => {
    renderBasic({ footer: <button>add-category</button> })
    expect(screen.getByRole('button', { name: 'add-category' })).toBeInTheDocument()
  })

  it('does not render group footers when renderGroupFooter is omitted', () => {
    const { container } = renderBasic()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/components/MenuGroups.test.tsx`
Expected: FAIL — `Cannot find module './MenuGroups'`.

- [ ] **Step 3: Write the implementation**

Create `app/components/MenuGroups.tsx`:

```tsx
import type { ReactNode } from 'react'

export type MenuGroup<T> = { id: string; name: string; items: T[] }

type MenuGroupsProps<T> = {
  groups: Array<MenuGroup<T>>
  renderHeading: (group: { id: string; name: string }) => ReactNode
  renderItem: (item: T, index: number) => ReactNode
  renderGroupFooter?: (group: { id: string; name: string }) => ReactNode
  footer?: ReactNode
}

export function MenuGroups<T extends { id: string }>({
  groups,
  renderHeading,
  renderItem,
  renderGroupFooter,
  footer,
}: MenuGroupsProps<T>) {
  return (
    <div className="menu-categories">
      {groups.map((group) => (
        <div key={group.id} className="menu-category">
          {renderHeading({ id: group.id, name: group.name })}
          <ul className="menu-list">
            {group.items.map((item, index) => (
              <li key={item.id}>{renderItem(item, index)}</li>
            ))}
          </ul>
          {renderGroupFooter?.({ id: group.id, name: group.name })}
        </div>
      ))}
      {footer}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/components/MenuGroups.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MenuGroups.tsx app/components/MenuGroups.test.tsx
git commit -m "Add shared MenuGroups structural component"
```

---

### Task 4: Customer `Cart.tsx` adopts `groupByCategory` + `MenuGroups`

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/order/Cart.test.tsx`

**Interfaces:**
- Consumes: `groupByCategory` (Task 1), `MenuGroups` (Task 3).
- `MenuItemProps` keeps its optional `category?: { id: string; name: string; sortOrder: number } | null` field (already present from the menu-categories feature). Cart maps its `items` (which have `category`) through `groupByCategory`, then renders through `MenuGroups`, with the item button as `renderItem` and the `'Other'`/name heading as `renderHeading`.
- The cross-category stagger counter (`staggerIndex`, an ISSUE-20 lint offender) is removed; the per-group `index` from `MenuGroups` drives the stagger instead (resetting per group). This is an intentional, minor motion simplification.

- [ ] **Step 1: Update the grouping-related tests**

In `app/order/Cart.test.tsx`, replace the existing `it('continues the stagger delay across a category boundary instead of resetting it', ...)` test with this per-group version:

```tsx
  it('applies a per-group stagger delay that resets at each category', () => {
    const twoCategoryItems = [
      { id: 'm1', name: 'Latte', price: '4.50', available: true, category: { id: 'c1', name: 'Drinks', sortOrder: 0 } },
      { id: 'm2', name: 'Croissant', price: '3.00', available: true, category: { id: 'c2', name: 'Pastries', sortOrder: 1 } },
    ]
    const { container } = render(<Cart tableId="t1" items={twoCategoryItems} />)
    const buttons = container.querySelectorAll('.menu-item-button')
    // first item in each group starts the stagger over at 0ms
    expect(buttons[0]).toHaveStyle({ '--stagger-delay': '0ms' })
    expect(buttons[1]).toHaveStyle({ '--stagger-delay': '0ms' })
  })
```

Keep the existing `describe('category grouping', ...)` block from the menu-categories feature as-is (it asserts group order, "Other" last, etc. — all still valid through the new path). Keep every non-grouping cart-interaction test unchanged.

- [ ] **Step 2: Run to verify the changed test fails**

Run: `npx vitest run app/order/Cart.test.tsx`
Expected: FAIL — the old code still emits a continuing (30ms) stagger, so the new `0ms`-per-group assertion fails.

- [ ] **Step 3: Rewrite the menu render in `Cart.tsx`**

In `app/order/Cart.tsx`:

Add imports near the top:

```tsx
import { groupByCategory } from '@/lib/groupByCategory'
import { MenuGroups } from '@/app/components/MenuGroups'
```

Delete the local `groupByCategory` function that currently lives in `Cart.tsx` (the one returning `{ label, items }` with the `Infinity` sentinel) and the `UNCATEGORIZED_LABEL` constant.

Replace the line `const categories = groupByCategory(items)` (the local call) with:

```tsx
  const groups = groupByCategory(items, deriveCategories(items))
```

and add this helper above the component (Cart receives items with `category` but not a separate category list, so derive the ordered category list from the items themselves):

```tsx
function deriveCategories(items: MenuItemProps[]): { id: string; name: string; sortOrder: number }[] {
  const seen = new Map<string, { id: string; name: string; sortOrder: number }>()
  for (const item of items) {
    if (item.category && !seen.has(item.category.id)) {
      seen.set(item.category.id, item.category)
    }
  }
  return [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder)
}
```

Replace the entire `<div className="menu-categories"> ... </div>` block (the IIFE with `staggerIndex`) with:

```tsx
      <MenuGroups
        groups={groups}
        renderHeading={(group) => (
          <h2 className="menu-category__title">{group.id === 'uncategorized' ? 'Other' : group.name}</h2>
        )}
        renderItem={(item, index) => (
          <button
            type="button"
            className="menu-item-button"
            style={{ '--stagger-delay': `${Math.min(index * 30, 300)}ms` } as React.CSSProperties}
            disabled={!item.available}
            onClick={() => addItem(item)}
          >
            <span>
              <span className="menu-item-button__name">{item.name}</span>
              {!item.available && <span className="menu-item-button__sold-out">Sold out</span>}
            </span>
            <span className="menu-item-button__price">${item.price}</span>
          </button>
        )}
      />
```

- [ ] **Step 4: Run the Cart tests to verify they pass**

Run: `npx vitest run app/order/Cart.test.tsx`
Expected: PASS (all cart-interaction + grouping tests green).

- [ ] **Step 5: Run type check + lint on the touched file**

Run: `npx tsc --noEmit && npx eslint app/order/Cart.tsx`
Expected: `tsc` clean; `eslint` on `Cart.tsx` should no longer report the `react-hooks/immutability` (`staggerIndex += 1`) error from ISSUE-20 (that code is gone). Any remaining ISSUE-20 lines are in other files and out of scope here.

- [ ] **Step 6: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx
git commit -m "Customer menu renders through shared MenuGroups + groupByCategory"
```

---

### Task 5: `MenuItemCard.tsx` — customer-styled, click-to-expand item card (replaces `MenuItemRow`)

**Files:**
- Create: `app/admin/menu-items/MenuItemCard.tsx`
- Create: `app/admin/menu-items/MenuItemCard.test.tsx`

(`MenuItemRow.tsx`/`MenuItemRow.test.tsx` are deleted in Task 9, after `page.tsx` stops importing them.)

**Interfaces:**
- Produces: `MenuItemCard({ id, name, price, available, editable, branchId, categoryId, categoryName, categories })` — same prop shape as today's `MenuItemRow` (`categoryId?: string | null`, `categoryName?: string | null`, `categories?: { id: string; name: string }[]`, defaulting to `null`/`null`/`[]`). Rendered by `MenuManager` (Task 9) as the `renderItem` for the admin/staff view.
- Collapsed view is a customer-style row (name + price) plus the availability toggle. For `editable` sessions the collapsed row is a `<button>` that expands the edit form on click; for non-editable (staff) it is non-interactive text with the toggle only. Expanded view = name/price inputs + category `<select>` + Save/Cancel/Archive, identical in behavior to today's `MenuItemRow`.

- [ ] **Step 1: Write the failing test**

Create `app/admin/menu-items/MenuItemCard.test.tsx`. Port every test from the current `app/admin/menu-items/MenuItemRow.test.tsx` verbatim, with two changes: (a) change the imported/rendered component name from `MenuItemRow` to `MenuItemCard`, and (b) the "reveals inputs after clicking Edit" interaction now triggers on clicking the item row itself. Replace the click target `screen.getByRole('button', { name: 'Edit' })` with `screen.getByRole('button', { name: /Edit Burger/ })` (the collapsed row's accessible name — see Step 3). Then add these expand/collapse tests:

```tsx
  describe('expand/collapse via the row', () => {
    it('renders the collapsed row as an Edit button for an editable session', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)
      expect(screen.getByRole('button', { name: /Edit Burger/ })).toBeInTheDocument()
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })

    it('expands the edit form when the collapsed row is clicked', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)
      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      expect(screen.getByLabelText('Name for Burger')).toBeInTheDocument()
    })

    it('does not render an Edit affordance for a non-editable (staff) session', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={false} branchId="b1" />)
      expect(screen.queryByRole('button', { name: /Edit Burger/ })).not.toBeInTheDocument()
      expect(screen.getByText('Burger')).toBeInTheDocument()
      expect(screen.getByRole('switch')).toBeInTheDocument()
    })

    it('toggling availability on the collapsed row does not expand the edit form', () => {
      vi.mocked(apiClient.patch).mockResolvedValue({})
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)
      fireEvent.click(screen.getByRole('switch'))
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })
  })
```

(The ported category/save/archive/availability tests from `MenuItemRow.test.tsx` assert the same behavior — only the reveal trigger changed.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/admin/menu-items/MenuItemCard.test.tsx`
Expected: FAIL — `Cannot find module './MenuItemCard'`.

- [ ] **Step 3: Write the implementation**

Create `app/admin/menu-items/MenuItemCard.tsx`. The state, `handleSave`, `handleArchive`, `handleAvailabilityChange`, `startEditing`, `cancelEditing`, confirm-dialog timer logic, and the `availabilityToggle` element are **identical to the current `app/admin/menu-items/MenuItemRow.tsx`** (read that file and reuse those verbatim). Only the returned JSX changes — the collapsed branch becomes a customer-styled clickable row, and the availability toggle sits outside the clickable area so it doesn't trigger expansion:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'

const CONFIRM_EXIT_MS = 200

type MenuItemCardProps = {
  id: string
  name: string
  price: string
  available: boolean
  editable: boolean
  branchId: string
  categoryId?: string | null
  categoryName?: string | null
  categories?: { id: string; name: string }[]
}

export function MenuItemCard({
  id,
  name,
  price,
  available,
  editable,
  branchId,
  categoryId = null,
  categoryName = null,
  categories = [],
}: MenuItemCardProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [editPrice, setEditPrice] = useState(price)
  const [editCategoryId, setEditCategoryId] = useState(categoryId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [checkedAvailable, setCheckedAvailable] = useState(available)
  const [availabilitySubmitting, setAvailabilitySubmitting] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    }
  }, [])

  function openConfirmArchive() {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirmArchive() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => setConfirmClosing(false), CONFIRM_EXIT_MS)
  }

  async function handleArchive() {
    closeConfirmArchive()
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.del(`/api/menu-items/${id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function startEditing() {
    setEditName(name)
    setEditPrice(price)
    setEditCategoryId(categoryId ?? '')
    setError(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setEditName(name)
    setEditPrice(price)
    setEditCategoryId(categoryId ?? '')
    setError(null)
    setIsEditing(false)
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.patch(`/api/menu-items/${id}`, {
        name: editName,
        price: Number(editPrice),
        categoryId: editCategoryId === '' ? null : editCategoryId,
      })
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAvailabilityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setCheckedAvailable(next)
    setAvailabilityError(null)
    setAvailabilitySubmitting(true)
    try {
      await apiClient.patch(`/api/menu-items/${id}/availability`, { available: next, branchId })
      router.refresh()
    } catch (err) {
      setCheckedAvailable(!next)
      setAvailabilityError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setAvailabilitySubmitting(false)
    }
  }

  const availabilityToggle = (
    <label className="slider-toggle menu-item-card__toggle">
      <input
        type="checkbox"
        role="switch"
        className="slider-toggle__input"
        checked={checkedAvailable}
        disabled={availabilitySubmitting}
        onChange={handleAvailabilityChange}
        aria-label={`Available: ${name}`}
      />
      <span className="slider-toggle__track" aria-hidden="true" />
      <span className="slider-toggle__label">{checkedAvailable ? 'Available' : 'Sold out'}</span>
    </label>
  )

  if (!editable || !isEditing) {
    return (
      <div className="menu-item-card">
        <div className="menu-item-card__row">
          {editable ? (
            <button
              type="button"
              className="menu-item-card__view menu-item-card__view--editable"
              onClick={startEditing}
              aria-label={`Edit ${name}`}
            >
              <span className="menu-item-card__name">{name}</span>
              {!checkedAvailable && <span className="menu-item-card__sold-out">Sold out</span>}
              <span className="menu-item-card__price">${price}</span>
            </button>
          ) : (
            <div className="menu-item-card__view">
              <span className="menu-item-card__name">{name}</span>
              {!checkedAvailable && <span className="menu-item-card__sold-out">Sold out</span>}
              <span className="menu-item-card__price">${price}</span>
            </div>
          )}
          {availabilityToggle}
        </div>
        {availabilityError && (
          <p role="alert" className="menu-item-card__error">
            {availabilityError}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="menu-item-card menu-item-card--editing">
      <div className="menu-item-card__form">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          aria-label={`Name for ${name}`}
          className="menu-item-card__input menu-item-card__input--name"
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={editPrice}
          onChange={(e) => setEditPrice(e.target.value)}
          aria-label={`Price for ${name}`}
          className="menu-item-card__input menu-item-card__input--price"
        />
        <select
          value={editCategoryId}
          onChange={(e) => setEditCategoryId(e.target.value)}
          aria-label={`Category for ${name}`}
          className="menu-item-card__select"
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {availabilityToggle}
        <div className="menu-item-card__actions">
          <button type="button" className="menu-item-card__save" onClick={handleSave} disabled={submitting}>
            Save
          </button>
          <button type="button" className="menu-item-card__cancel" onClick={cancelEditing} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="menu-item-card__archive" onClick={openConfirmArchive} disabled={submitting}>
            Archive
          </button>
        </div>
        {error && (
          <p role="alert" className="menu-item-card__error">
            {error}
          </p>
        )}
        {availabilityError && (
          <p role="alert" className="menu-item-card__error">
            {availabilityError}
          </p>
        )}
      </div>
      {(confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title={`Archive ${name}?`}
          message="It'll be hidden from the menu."
          confirmLabel="Archive"
          busy={submitting}
          exiting={!confirmOpen}
          onConfirm={handleArchive}
          onClose={closeConfirmArchive}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/admin/menu-items/MenuItemCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/menu-items/MenuItemCard.tsx app/admin/menu-items/MenuItemCard.test.tsx
git commit -m "Add MenuItemCard: customer-styled click-to-expand item card"
```

---

### Task 6: `CategoryHeader.tsx` — click-to-expand rename/delete heading (replaces `CategoryRow`)

**Files:**
- Create: `app/admin/menu-items/CategoryHeader.tsx`
- Create: `app/admin/menu-items/CategoryHeader.test.tsx`

(`CategoryRow.tsx`/`CategoryRow.test.tsx` are deleted in Task 9.)

**Interfaces:**
- Produces: `CategoryHeader({ id, name, interactive })` — `interactive: boolean` (admin = true). Rendered by `MenuManager` as the `renderHeading` for real categories. When `interactive` is false (staff, or the `'uncategorized'` group), it renders a plain `<h2 className="menu-category__title">`. When true, `<h2>` is a clickable button that expands a rename input + Save/Cancel + Delete (with the existing `ConfirmDialog`). Rename/delete logic is identical to today's `CategoryRow` (minus all move logic, which is gone).
- Note: `MenuManager` (Task 9) never renders `CategoryHeader` for the `'uncategorized'` group — it renders a plain `<h2>Uncategorized</h2>` directly. `CategoryHeader` is only used for real categories, so it always has a real `id`.

- [ ] **Step 1: Write the failing test**

Create `app/admin/menu-items/CategoryHeader.test.tsx`. Port the rename and delete tests from the current `app/admin/menu-items/CategoryRow.test.tsx` (dropping every move-button test), changing the component to `CategoryHeader` and adding the `interactive` prop. Add:

```tsx
  it('renders a plain, non-interactive heading when interactive is false', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={false} />)
    expect(screen.getByRole('heading', { name: 'Drinks' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Drinks/ })).not.toBeInTheDocument()
  })

  it('renders the heading as an Edit button when interactive is true', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)
    expect(screen.getByRole('button', { name: /Edit Drinks/ })).toBeInTheDocument()
  })

  it('expands rename + delete controls when the heading is clicked', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit Drinks/ }))
    expect(screen.getByLabelText('Name for Drinks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
```

The ported rename/delete tests should open edit mode first (`fireEvent.click(screen.getByRole('button', { name: /Edit Drinks/ }))`) before asserting on Save/Cancel/Delete, since those controls now live behind the expand.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/admin/menu-items/CategoryHeader.test.tsx`
Expected: FAIL — `Cannot find module './CategoryHeader'`.

- [ ] **Step 3: Write the implementation**

Create `app/admin/menu-items/CategoryHeader.tsx`. Reuse `CategoryRow`'s `handleSave` (rename), `handleDelete`, confirm-dialog timer logic, and state verbatim (read `app/admin/menu-items/CategoryRow.tsx`); drop `handleMove` and the move buttons entirely. New JSX:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'

const CONFIRM_EXIT_MS = 200

type CategoryHeaderProps = {
  id: string
  name: string
  interactive: boolean
}

export function CategoryHeader({ id, name, interactive }: CategoryHeaderProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    }
  }, [])

  function openConfirmDelete() {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirmDelete() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => setConfirmClosing(false), CONFIRM_EXIT_MS)
  }

  async function handleDelete() {
    closeConfirmDelete()
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.del(`/api/categories/${id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function startEditing() {
    setEditName(name)
    setError(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setEditName(name)
    setError(null)
    setIsEditing(false)
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.patch(`/api/categories/${id}`, { name: editName })
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!interactive) {
    return <h2 className="menu-category__title">{name}</h2>
  }

  if (!isEditing) {
    return (
      <h2 className="menu-category__title menu-category__title--editable">
        <button type="button" className="menu-category__edit" onClick={startEditing} aria-label={`Edit ${name}`}>
          {name}
        </button>
      </h2>
    )
  }

  return (
    <div className="menu-category__editor">
      <input
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        aria-label={`Name for ${name}`}
        className="menu-category__input"
      />
      <div className="menu-category__actions">
        <button type="button" className="menu-category__save" onClick={handleSave} disabled={submitting}>
          Save
        </button>
        <button type="button" className="menu-category__cancel" onClick={cancelEditing} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className="menu-category__delete" onClick={openConfirmDelete} disabled={submitting}>
          Delete
        </button>
      </div>
      {error && (
        <p role="alert" className="menu-category__error">
          {error}
        </p>
      )}
      {(confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title={`Delete ${name}?`}
          message="Items in this category will become uncategorized."
          confirmLabel="Delete"
          busy={submitting}
          exiting={!confirmOpen}
          onConfirm={handleDelete}
          onClose={closeConfirmDelete}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/admin/menu-items/CategoryHeader.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/menu-items/CategoryHeader.tsx app/admin/menu-items/CategoryHeader.test.tsx
git commit -m "Add CategoryHeader: click-to-expand rename/delete heading"
```

---

### Task 7: `AddItemRow.tsx` + `AddCategoryRow.tsx` — inline add affordances (replace both create forms)

**Files:**
- Create: `app/admin/menu-items/AddItemRow.tsx`
- Create: `app/admin/menu-items/AddItemRow.test.tsx`
- Create: `app/admin/menu-items/AddCategoryRow.tsx`
- Create: `app/admin/menu-items/AddCategoryRow.test.tsx`

(`CreateMenuItemForm.tsx`/`CreateCategoryForm.tsx` are deleted in Task 9.)

**Interfaces:**
- Produces:
  - `AddItemRow({ categoryId })` — `categoryId: string | null` (the enclosing group's id; `null` for the Uncategorized group). Collapsed "+ Add item" button; expanded reveals name + price + Add/Cancel. On Add, POSTs `{ name, price }` to `/api/menu-items`, then — only when `categoryId` is non-null — PATCHes `{ categoryId }` to `/api/menu-items/<newId>`; then `router.refresh()`. Rendered by `MenuManager` as `renderGroupFooter`.
  - `AddCategoryRow()` — no props. Collapsed "+ Add category" button; expanded reveals name + Add/Cancel; POSTs `{ name }` to `/api/categories`, then `router.refresh()`. Rendered by `MenuManager` as `footer`.
- `apiClient.post` returns the created resource; `AddItemRow` reads `created.id` from the item POST response (the `POST /api/menu-items` route returns the created `MenuItem`, which has `id`).

- [ ] **Step 1: Write the failing tests**

Create `app/admin/menu-items/AddItemRow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddItemRow } from './AddItemRow'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { post: vi.fn(), patch: vi.fn() } }
})

describe('AddItemRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a collapsed "+ Add item" button, no form, by default', () => {
    render(<AddItemRow categoryId="c1" />)
    expect(screen.getByRole('button', { name: /Add item/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('New item name')).not.toBeInTheDocument()
  })

  it('reveals name + price fields when expanded', () => {
    render(<AddItemRow categoryId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    expect(screen.getByLabelText('New item name')).toBeInTheDocument()
    expect(screen.getByLabelText('New item price')).toBeInTheDocument()
  })

  it('POSTs the item then PATCHes its categoryId to the enclosing category', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'new1' } as never)
    vi.mocked(apiClient.patch).mockResolvedValue({} as never)
    render(<AddItemRow categoryId="c1" />)

    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'Espresso' } })
    fireEvent.change(screen.getByLabelText('New item price'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/menu-items', { name: 'Espresso', price: 3 }))
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/new1', { categoryId: 'c1' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('skips the categoryId PATCH for the Uncategorized group (categoryId null)', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'new1' } as never)
    render(<AddItemRow categoryId={null} />)

    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'Mystery' } })
    fireEvent.change(screen.getByLabelText('New item price'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled())
    expect(apiClient.patch).not.toHaveBeenCalled()
  })

  it('shows an error and stays expanded when the POST fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('VALIDATION', 'price is required and must be a positive number'))
    render(<AddItemRow categoryId="c1" />)

    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('New item price'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('price is required')
    expect(screen.getByLabelText('New item name')).toBeInTheDocument()
  })

  it('collapses without calling the API when Cancel is clicked', () => {
    render(<AddItemRow categoryId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('New item name')).not.toBeInTheDocument()
    expect(apiClient.post).not.toHaveBeenCalled()
  })
})
```

Create `app/admin/menu-items/AddCategoryRow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddCategoryRow } from './AddCategoryRow'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { post: vi.fn() } }
})

describe('AddCategoryRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a collapsed "+ Add category" button by default', () => {
    render(<AddCategoryRow />)
    expect(screen.getByRole('button', { name: /Add category/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('New category name')).not.toBeInTheDocument()
  })

  it('POSTs the category name and refreshes on Add', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'c9' } as never)
    render(<AddCategoryRow />)

    fireEvent.click(screen.getByRole('button', { name: /Add category/ }))
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Desserts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/categories', { name: 'Desserts' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows an error and stays expanded when the POST fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('VALIDATION', 'name is required'))
    render(<AddCategoryRow />)

    fireEvent.click(screen.getByRole('button', { name: /Add category/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('name is required')
    expect(screen.getByLabelText('New category name')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify both fail**

Run: `npx vitest run app/admin/menu-items/AddItemRow.test.tsx app/admin/menu-items/AddCategoryRow.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Write `AddItemRow.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function AddItemRow({ categoryId }: { categoryId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setName('')
    setPrice('')
    setError(null)
  }

  async function handleAdd() {
    setError(null)
    setSubmitting(true)
    try {
      const created = await apiClient.post<{ id: string }>('/api/menu-items', { name, price: Number(price) })
      if (categoryId !== null) {
        await apiClient.patch(`/api/menu-items/${created.id}`, { categoryId })
      }
      reset()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="menu-add-row" onClick={() => setOpen(true)}>
        + Add item
      </button>
    )
  }

  return (
    <div className="menu-add-row menu-add-row--open">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="New item name"
        placeholder="Name"
        className="menu-add-row__input menu-add-row__input--name"
      />
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        aria-label="New item price"
        placeholder="Price"
        className="menu-add-row__input menu-add-row__input--price"
      />
      <button type="button" className="menu-add-row__save" onClick={handleAdd} disabled={submitting}>
        Add
      </button>
      <button
        type="button"
        className="menu-add-row__cancel"
        onClick={() => {
          reset()
          setOpen(false)
        }}
        disabled={submitting}
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="menu-add-row__error">
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Write `AddCategoryRow.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function AddCategoryRow() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.post('/api/categories', { name })
      setName('')
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="menu-add-row menu-add-row--category" onClick={() => setOpen(true)}>
        + Add category
      </button>
    )
  }

  return (
    <div className="menu-add-row menu-add-row--open menu-add-row--category">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="New category name"
        placeholder="Category name"
        className="menu-add-row__input menu-add-row__input--name"
      />
      <button type="button" className="menu-add-row__save" onClick={handleAdd} disabled={submitting}>
        Add
      </button>
      <button
        type="button"
        className="menu-add-row__cancel"
        onClick={() => {
          setName('')
          setError(null)
          setOpen(false)
        }}
        disabled={submitting}
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="menu-add-row__error">
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run both tests to verify they pass**

Run: `npx vitest run app/admin/menu-items/AddItemRow.test.tsx app/admin/menu-items/AddCategoryRow.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/menu-items/AddItemRow.tsx app/admin/menu-items/AddItemRow.test.tsx app/admin/menu-items/AddCategoryRow.tsx app/admin/menu-items/AddCategoryRow.test.tsx
git commit -m "Add inline AddItemRow (per-category) and AddCategoryRow affordances"
```

---

### Task 8: `CategoryReorder.tsx` — reorder mode (drag + keyboard, batch commit)

**Files:**
- Create: `app/admin/menu-items/CategoryReorder.tsx`
- Create: `app/admin/menu-items/CategoryReorder.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/categories/reorder` (Task 2).
- Produces: `CategoryReorder({ categories, onClose })` — `categories: { id: string; name: string }[]` (real categories in current order), `onClose: () => void` (called on Cancel, and after a successful Done). Rendered by `MenuManager` (Task 9) when reorder mode is active.
- Holds a client-side `order: string[]` draft. The keyboard up/down controls and (in the browser) pointer drag both mutate `order`. "Done" PATCHes `{ orderedIds: order }` then `router.refresh()` + `onClose()`; a failed Done shows an inline error and keeps the draft. "Cancel" calls `onClose()` with no request.
- **Testing boundary:** pointer-drag physics are not simulated in jsdom — unit tests drive the keyboard up/down path (which mutates the same `order` draft) and Done/Cancel. Drag is covered by the Task 11 manual smoke pass.

- [ ] **Step 1: Write the failing test**

Create `app/admin/menu-items/CategoryReorder.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CategoryReorder } from './CategoryReorder'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { patch: vi.fn() } }
})

const categories = [
  { id: 'c1', name: 'Mains' },
  { id: 'c2', name: 'Drinks' },
  { id: 'c3', name: 'Desserts' },
]

describe('CategoryReorder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists every category as a reorder bar in current order', () => {
    render(<CategoryReorder categories={categories} onClose={vi.fn()} />)
    const bars = screen.getAllByTestId('reorder-bar').map((b) => b.textContent)
    expect(bars[0]).toContain('Mains')
    expect(bars[1]).toContain('Drinks')
    expect(bars[2]).toContain('Desserts')
  })

  it('disables move-up on the first bar and move-down on the last', () => {
    render(<CategoryReorder categories={categories} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Move Mains up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Desserts down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Mains down' })).not.toBeDisabled()
  })

  it('keyboard move-down reorders the draft (Mains after Drinks)', () => {
    render(<CategoryReorder categories={categories} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move Mains down' }))
    const bars = screen.getAllByTestId('reorder-bar').map((b) => b.textContent)
    expect(bars[0]).toContain('Drinks')
    expect(bars[1]).toContain('Mains')
  })

  it('Done commits the current draft order and refreshes then closes', async () => {
    const onClose = vi.fn()
    vi.mocked(apiClient.patch).mockResolvedValue({} as never)
    render(<CategoryReorder categories={categories} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Move Mains down' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/api/categories/reorder', { orderedIds: ['c2', 'c1', 'c3'] }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Cancel closes without any request', () => {
    const onClose = vi.fn()
    render(<CategoryReorder categories={categories} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(apiClient.patch).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('a failed Done shows an inline error and keeps the mode open (no close)', async () => {
    const onClose = vi.fn()
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('VALIDATION', 'orderedIds must contain each existing category id exactly once'))
    render(<CategoryReorder categories={categories} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('orderedIds must contain')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getAllByTestId('reorder-bar')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/admin/menu-items/CategoryReorder.test.tsx`
Expected: FAIL — `Cannot find module './CategoryReorder'`.

- [ ] **Step 3: Write the implementation**

Create `app/admin/menu-items/CategoryReorder.tsx`. The pointer drag is hand-rolled: `pointerdown` on a bar's grip records the dragging id and attaches `pointermove`/`pointerup` listeners to `window`; `pointermove` finds the bar whose vertical midpoint the pointer has crossed and splices the dragging id to that index in the `order` draft; `pointerup` clears the drag. The keyboard up/down buttons call `move(id, delta)`, which swaps adjacent entries. Both mutate the single `order` draft; nothing persists until Done.

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type Cat = { id: string; name: string }

export function CategoryReorder({ categories, onClose }: { categories: Cat[]; onClose: () => void }) {
  const router = useRouter()
  const [order, setOrder] = useState<string[]>(categories.map((c) => c.id))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const byId = new Map(categories.map((c) => [c.id, c]))

  function move(id: string, delta: number) {
    setOrder((prev) => {
      const i = prev.indexOf(id)
      const j = i + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // While dragging, listen on window so pointer capture / element boundaries don't
  // drop events; find the bar whose midpoint the pointer has crossed and move the
  // dragging id there. Re-attached whenever the draft order changes (short list).
  useEffect(() => {
    if (!draggingId) return
    function onMove(e: PointerEvent) {
      const list = listRef.current
      if (!list) return
      const bars = Array.from(list.querySelectorAll('[data-cat-id]')) as HTMLElement[]
      let targetIndex = order.length - 1
      for (let k = 0; k < bars.length; k++) {
        const rect = bars[k].getBoundingClientRect()
        if (e.clientY < rect.top + rect.height / 2) {
          targetIndex = k
          break
        }
      }
      setOrder((prev) => {
        const from = prev.indexOf(draggingId!)
        if (from === -1 || from === targetIndex) return prev
        const next = [...prev]
        next.splice(from, 1)
        next.splice(targetIndex, 0, draggingId!)
        return next
      })
    }
    function onUp() {
      setDraggingId(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [draggingId, order])

  async function handleDone() {
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.patch('/api/categories/reorder', { orderedIds: order })
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="category-reorder">
      <p className="category-reorder__hint">Drag to reorder, or use the arrows. Nothing saves until you tap Done.</p>
      <ul className="category-reorder__list" ref={listRef}>
        {order.map((id, index) => {
          const cat = byId.get(id)
          if (!cat) return null
          return (
            <li
              key={id}
              data-cat-id={id}
              data-testid="reorder-bar"
              className={`category-reorder__bar${draggingId === id ? ' category-reorder__bar--dragging' : ''}`}
            >
              <button
                type="button"
                className="category-reorder__grip"
                aria-label={`Drag ${cat.name}`}
                onPointerDown={() => setDraggingId(id)}
              >
                ⠿
              </button>
              <span className="category-reorder__name">{cat.name}</span>
              <button
                type="button"
                className="category-reorder__move"
                aria-label={`Move ${cat.name} up`}
                onClick={() => move(id, -1)}
                disabled={index === 0 || submitting}
              >
                ▲
              </button>
              <button
                type="button"
                className="category-reorder__move"
                aria-label={`Move ${cat.name} down`}
                onClick={() => move(id, 1)}
                disabled={index === order.length - 1 || submitting}
              >
                ▼
              </button>
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="category-reorder__error">
          {error}
        </p>
      )}
      <div className="category-reorder__actions">
        <button type="button" className="category-reorder__done" onClick={handleDone} disabled={submitting}>
          Done
        </button>
        <button type="button" className="category-reorder__cancel" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/admin/menu-items/CategoryReorder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/menu-items/CategoryReorder.tsx app/admin/menu-items/CategoryReorder.test.tsx
git commit -m "Add CategoryReorder: drag + keyboard reorder mode, batch commit"
```

---

### Task 9: `MenuManager.tsx` + `page.tsx` rewrite — wire it together, delete replaced files

**Files:**
- Create: `app/admin/menu-items/MenuManager.tsx`
- Create: `app/admin/menu-items/MenuManager.test.tsx`
- Modify: `app/admin/menu-items/page.tsx`
- Modify: `app/admin/menu-items/page.test.tsx`
- Delete: `app/admin/menu-items/MenuItemRow.tsx`, `app/admin/menu-items/MenuItemRow.test.tsx`
- Delete: `app/admin/menu-items/CategoryRow.tsx`, `app/admin/menu-items/CategoryRow.test.tsx`
- Delete: `app/admin/menu-items/CreateMenuItemForm.tsx`
- Delete: `app/admin/menu-items/CreateCategoryForm.tsx`

**Interfaces:**
- Consumes: `MenuGroups` (Task 3), `groupByCategory` (Task 1), `MenuItemCard` (Task 5), `CategoryHeader` (Task 6), `AddItemRow`/`AddCategoryRow` (Task 7), `CategoryReorder` (Task 8).
- Produces: `MenuManager({ items, categories, branchId, isAdmin })` — a client component holding reorder-mode state and wiring the render props. `page.tsx` (server) fetches and passes serializable props.
- `MenuManagerItem` shape passed from `page.tsx`: `{ id: string; name: string; price: string; available: boolean; category: { id: string; name: string; sortOrder: number } | null }`. `categories` passed as `{ id: string; name: string; sortOrder: number }[]`.

- [ ] **Step 1: Write the failing `MenuManager` test**

Create `app/admin/menu-items/MenuManager.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MenuManager } from './MenuManager'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const categories = [
  { id: 'c1', name: 'Mains', sortOrder: 0 },
  { id: 'c2', name: 'Drinks', sortOrder: 1 },
]
const items = [
  { id: 'm1', name: 'Burger', price: '12.50', available: true, category: categories[0] },
  { id: 'm2', name: 'Cola', price: '3.00', available: true, category: categories[1] },
  { id: 'm3', name: 'Mystery', price: '1.00', available: true, category: null },
]

describe('MenuManager', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders category groups in order with an Uncategorized group last (admin)', () => {
    render(<MenuManager items={items} categories={categories} branchId="b1" isAdmin={true} />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Mains', 'Drinks', 'Uncategorized'])
  })

  it('shows admin affordances: Reorder button, per-group Add item, Add category', () => {
    render(<MenuManager items={items} categories={categories} branchId="b1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: /Reorder categories/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Add item/ }).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('button', { name: /Add category/ })).toBeInTheDocument()
  })

  it('hides all admin affordances for a staff (non-admin) session', () => {
    render(<MenuManager items={items} categories={categories} branchId="b1" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: /Reorder categories/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add item/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add category/ })).not.toBeInTheDocument()
    // staff still sees items + interactive availability toggles
    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getAllByRole('switch').length).toBe(3)
  })

  it('hides the Reorder button when fewer than two categories exist', () => {
    render(<MenuManager items={[items[0]]} categories={[categories[0]]} branchId="b1" isAdmin={true} />)
    expect(screen.queryByRole('button', { name: /Reorder categories/ })).not.toBeInTheDocument()
  })

  it('enters reorder mode when Reorder categories is clicked, showing reorder bars', () => {
    render(<MenuManager items={items} categories={categories} branchId="b1" isAdmin={true} />)
    fireEvent.click(screen.getByRole('button', { name: /Reorder categories/ }))
    expect(screen.getAllByTestId('reorder-bar').length).toBe(2)
    // normal add affordances hidden while reordering
    expect(screen.queryByRole('button', { name: /Add category/ })).not.toBeInTheDocument()
  })

  it('shows empty categories for admin (so items can be added into them)', () => {
    render(<MenuManager items={[]} categories={categories} branchId="b1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: /Edit Mains/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit Drinks/ })).toBeInTheDocument()
    // one "+ Add item" footer per (empty) category
    expect(screen.getAllByRole('button', { name: /Add item/ })).toHaveLength(2)
  })

  it('drops empty categories for staff (customer-like view)', () => {
    render(<MenuManager items={[]} categories={categories} branchId="b1" isAdmin={false} />)
    expect(screen.queryByText('Mains')).not.toBeInTheDocument()
    expect(screen.queryByText('Drinks')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/admin/menu-items/MenuManager.test.tsx`
Expected: FAIL — `Cannot find module './MenuManager'`.

- [ ] **Step 3: Write `MenuManager.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { groupByCategory } from '@/lib/groupByCategory'
import { MenuGroups } from '@/app/components/MenuGroups'
import { MenuItemCard } from './MenuItemCard'
import { CategoryHeader } from './CategoryHeader'
import { AddItemRow } from './AddItemRow'
import { AddCategoryRow } from './AddCategoryRow'
import { CategoryReorder } from './CategoryReorder'

type Category = { id: string; name: string; sortOrder: number }
type ManagedItem = {
  id: string
  name: string
  price: string
  available: boolean
  category: Category | null
}

export function MenuManager({
  items,
  categories,
  branchId,
  isAdmin,
}: {
  items: ManagedItem[]
  categories: Category[]
  branchId: string
  isAdmin: boolean
}) {
  const [reordering, setReordering] = useState(false)
  // Admin sees empty categories too (so a freshly-created or emptied category is
  // still visible + addable); the customer view drops them (Cart, Task 4).
  const groups = groupByCategory(items, categories, { includeEmptyCategories: isAdmin })
  const selectCategories = categories.map((c) => ({ id: c.id, name: c.name }))
  const canReorder = isAdmin && categories.length > 1

  if (reordering) {
    return (
      <CategoryReorder
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        onClose={() => setReordering(false)}
      />
    )
  }

  return (
    <>
      {canReorder && (
        <div className="menu-manager__toolbar">
          <button type="button" className="menu-manager__reorder" onClick={() => setReordering(true)}>
            Reorder categories
          </button>
        </div>
      )}
      <MenuGroups<ManagedItem>
        groups={groups}
        renderHeading={(group) =>
          group.id === 'uncategorized' ? (
            <h2 className="menu-category__title">Uncategorized</h2>
          ) : (
            <CategoryHeader id={group.id} name={group.name} interactive={isAdmin} />
          )
        }
        renderItem={(item) => (
          <MenuItemCard
            id={item.id}
            name={item.name}
            price={item.price}
            available={item.available}
            editable={isAdmin}
            branchId={branchId}
            categoryId={item.category?.id ?? null}
            categoryName={item.category?.name ?? null}
            categories={selectCategories}
          />
        )}
        renderGroupFooter={
          isAdmin
            ? (group) => <AddItemRow categoryId={group.id === 'uncategorized' ? null : group.id} />
            : undefined
        }
        footer={isAdmin ? <AddCategoryRow /> : undefined}
      />
    </>
  )
}
```

- [ ] **Step 4: Run the `MenuManager` test to verify it passes**

Run: `npx vitest run app/admin/menu-items/MenuManager.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rewrite `page.tsx`**

Replace the full contents of `app/admin/menu-items/page.tsx` with (drops the inline `groupItemsByCategory`, the old panels, and every replaced-component import):

```tsx
import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { listCategories } from '@/lib/categoryService'
import { resolveBranchId, getBranchOrThrow } from '@/lib/branchService'
import { MenuManager } from './MenuManager'

export default async function AdminMenuItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'
  const { branch: requestedBranchId } = await searchParams

  const branchId = await resolveBranchId(session, isAdmin ? requestedBranchId : undefined)
  const [branch, items, categories] = await Promise.all([
    getBranchOrThrow(branchId),
    listMenuItemsWithAvailability(branchId),
    listCategories(),
  ])

  const managedItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price.toString(),
    available: item.available,
    category: item.category
      ? { id: item.category.id, name: item.category.name, sortOrder: item.category.sortOrder }
      : null,
  }))
  const managedCategories = categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder }))

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">{branch.name}</span>
        <h1 className="admin-header__title">Menu Management</h1>
      </header>
      {managedItems.length === 0 && managedCategories.length === 0 ? (
        <p className="admin-empty">No menu items yet — add a category or item to start.</p>
      ) : null}
      <MenuManager items={managedItems} categories={managedCategories} branchId={branchId} isAdmin={isAdmin} />
    </main>
  )
}
```

Note: the empty-state `<p>` shows only when there's genuinely nothing, but `MenuManager` still renders below it so an admin sees the "+ Add category" affordance even on an empty menu. (Staff on a truly empty menu see just the empty-state line and no groups — acceptable, matches today's staff empty view.)

- [ ] **Step 6: Rewrite `page.test.tsx`**

Replace `app/admin/menu-items/page.test.tsx` with a version that mocks `MenuManager` (the interaction detail is covered by `MenuManager.test.tsx`) and asserts the server component's wiring:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminMenuItemsPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { listCategories } from '@/lib/categoryService'
import { resolveBranchId, getBranchOrThrow } from '@/lib/branchService'

vi.mock('@/lib/authGuard', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/menuService', () => ({ listMenuItemsWithAvailability: vi.fn() }))
vi.mock('@/lib/categoryService', () => ({ listCategories: vi.fn() }))
vi.mock('@/lib/branchService', () => ({ resolveBranchId: vi.fn(), getBranchOrThrow: vi.fn() }))

vi.mock('./MenuManager', () => ({
  MenuManager: (props: { isAdmin: boolean; items: unknown[]; categories: unknown[] }) => (
    <div data-testid="menu-manager" data-admin={String(props.isAdmin)} data-items={props.items.length} data-categories={props.categories.length} />
  ),
}))

describe('AdminMenuItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
    vi.mocked(getBranchOrThrow).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() } as never)
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([])
    vi.mocked(listCategories).mockResolvedValue([])
  })

  function callPage(role: 'staff' | 'admin', branch?: string) {
    vi.mocked(requireRole).mockResolvedValue({ role })
    return AdminMenuItemsPage({ searchParams: Promise.resolve(branch ? { branch } : {}) })
  }

  it('is gated behind at least a staff session', async () => {
    await callPage('staff')
    expect(requireRole).toHaveBeenCalledWith('staff')
  })

  it('shows the branch name and Menu Management heading', async () => {
    render(await callPage('admin'))
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Menu Management' })).toBeInTheDocument()
  })

  it('resolves the branch from ?branch= for admin, ignoring it for staff', async () => {
    await callPage('admin', 'b2')
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')
    vi.mocked(resolveBranchId).mockClear()
    await callPage('staff', 'b2')
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'staff' }, undefined)
  })

  it('passes isAdmin + mapped items/categories to MenuManager', async () => {
    vi.mocked(listCategories).mockResolvedValue([{ id: 'c1', name: 'Mains', sortOrder: 0, createdAt: new Date() }] as never)
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, available: true, archived: false, createdAt: new Date(), category: { id: 'c1', name: 'Mains', sortOrder: 0, createdAt: new Date() } },
    ] as never)

    render(await callPage('admin'))
    const manager = screen.getByTestId('menu-manager')
    expect(manager).toHaveAttribute('data-admin', 'true')
    expect(manager).toHaveAttribute('data-items', '1')
    expect(manager).toHaveAttribute('data-categories', '1')
  })

  it('shows the empty state when there are no items and no categories', async () => {
    render(await callPage('admin'))
    expect(screen.getByText('No menu items yet — add a category or item to start.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Delete the replaced files**

```bash
git rm app/admin/menu-items/MenuItemRow.tsx app/admin/menu-items/MenuItemRow.test.tsx \
       app/admin/menu-items/CategoryRow.tsx app/admin/menu-items/CategoryRow.test.tsx \
       app/admin/menu-items/CreateMenuItemForm.tsx \
       app/admin/menu-items/CreateCategoryForm.tsx
```

- [ ] **Step 8: Run the full admin-page test surface + type check**

Run: `npx vitest run app/admin/menu-items && npx tsc --noEmit`
Expected: PASS, no type errors (confirms nothing still imports the deleted files).

- [ ] **Step 9: Commit**

```bash
git add app/admin/menu-items/MenuManager.tsx app/admin/menu-items/MenuManager.test.tsx app/admin/menu-items/page.tsx app/admin/menu-items/page.test.tsx
git rm app/admin/menu-items/MenuItemRow.tsx app/admin/menu-items/MenuItemRow.test.tsx app/admin/menu-items/CategoryRow.tsx app/admin/menu-items/CategoryRow.test.tsx app/admin/menu-items/CreateMenuItemForm.tsx app/admin/menu-items/CreateCategoryForm.tsx
git commit -m "Wire admin menu through MenuManager + MenuGroups; remove old panel components"
```

---

### Task 10: Frontend-design visual pass — CSS for the mirrored look

**Files:**
- Modify: `app/globals.css`

**Interfaces:** No behavioral change — this task styles the classnames the Task 3–9 components emit. All logic and tests already pass; this is pure presentation.

**REQUIRED SUB-SKILL:** Load and follow `frontend-design` for this task. The spec explicitly defers pixel-level visual/spacing/motion decisions here rather than pre-specifying them.

- [ ] **Step 1: Inventory the classnames needing styles**

Read the components from Tasks 5–9 and list every new class they emit that isn't already styled in `app/globals.css`. At minimum: `.menu-item-card`, `.menu-item-card__row`, `.menu-item-card__view`, `.menu-item-card__view--editable`, `.menu-item-card__name`, `.menu-item-card__price`, `.menu-item-card__sold-out`, `.menu-item-card__toggle`, `.menu-item-card__form`, `.menu-item-card__input`, `.menu-item-card__select`, `.menu-item-card__actions`, `.menu-item-card__save/__cancel/__archive/__error`; `.menu-category__title--editable`, `.menu-category__edit`, `.menu-category__editor`, `.menu-category__input`, `.menu-category__actions`, `.menu-category__save/__cancel/__delete/__error`; `.menu-add-row`, `.menu-add-row--open`, `.menu-add-row--category`, `.menu-add-row__input`, `.menu-add-row__save/__cancel/__error`; `.menu-manager__toolbar`, `.menu-manager__reorder`; `.category-reorder`, `.category-reorder__hint/__list/__bar/__bar--dragging/__grip/__name/__move/__error/__actions/__done/__cancel`.

- [ ] **Step 2: Apply the frontend-design method**

Following `frontend-design`, style these so the admin item rows read as the **same café-ticket menu** the customer sees (reuse the existing `--espresso`/`--copper`/`--clay`/`--paper` tokens and the `.menu-category__title` / `.menu-item-button` visual language already in `app/globals.css`), with edit affordances that feel layered-on rather than a different UI. Specific requirements to honor:
  - The collapsed `.menu-item-card__view` should visually match the customer `.menu-item-button` (name left, price right) so the two views are recognizably the same menu.
  - `.category-reorder__bar` should read as a compact, grabbable bar; `--dragging` gets a lifted/elevated treatment.
  - **Reduced motion:** wrap any drag-follow or expand/collapse transition in `@media (prefers-reduced-motion: no-preference)` (or guard with `prefers-reduced-motion: reduce` overrides) so motion is opt-out, per the project's a11y floor.
  - Keyboard focus must stay visible on every new interactive element (`:focus-visible` outlines, matching the existing `--copper-bright` outline pattern used elsewhere in `app/globals.css`).
  - Remove any now-dead CSS whose only consumers were the deleted components (`.menu-admin-row*`, `.category-admin-*`, `.category-panel*`, `.menu-admin-groups`, `.menu-admin-list` if unused, `.admin-panel*` if unused) — grep the repo for each class before deleting to confirm no remaining consumer.

- [ ] **Step 3: Verify visually in the browser**

Run the app via Docker (`docker compose up --build -d`; app at `http://localhost:3001`) and take screenshots of `/admin/menu-items` (admin) and `/order?table=<id>` (customer) side by side. Confirm the two read as the same menu. Iterate on the CSS until they do. (This is the one task whose "done" is a visual judgment, not a passing test.)

- [ ] **Step 4: Confirm nothing regressed**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app/admin/menu-items app/components app/order`
Expected: full suite green, `tsc` clean, no new eslint errors in the touched dirs.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "Frontend-design pass: admin menu mirrors the customer menu visual language"
```

---

### Task 11: Full verification pass + docs

**Files:**
- Modify: `BUILD_STATUS.md`

**Interfaces:** None — verification + a story-log line. (`ISSUES.md`'s ISSUE-25 was already resolved in Task 2.)

- [ ] **Step 1: Full automated suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `groupByCategory`, `MenuGroups`, `reorder` route/service, `MenuItemCard`, `CategoryHeader`, `AddItemRow`, `AddCategoryRow`, `CategoryReorder`, `MenuManager`, and rewritten `Cart`/`page` suites.

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: `tsc` clean. `eslint` should show **fewer** errors than the ISSUE-20 baseline — the `Cart.tsx` `staggerIndex += 1` (`react-hooks/immutability`) and `Cart.tsx:83` set-state-in-effect offenders may have shifted or cleared depending on the rewrite; confirm no *new* error was introduced in any file this feature touched, and update `ISSUE-20` in `ISSUES.md` if the `Cart.tsx` lines it names no longer exist.

- [ ] **Step 3: Manual Docker/Playwright smoke pass**

Follow `.claude/skills/verify/SKILL.md`. Verify end-to-end against a real `docker compose up --build`:
  - Admin: expand an item, change its category via the select, Save → it moves to the new group's section without a full reload.
  - Admin: "+ Add item" inside a category → new item appears in that category; "+ Add category" → new empty category appears with its own "+ Add item".
  - Admin: "Reorder categories" → drag a category to a new position (pointer drag, the part not unit-tested) → Done → both `/admin/menu-items` and `/order?table=<id>` show the new order.
  - Admin: reorder via the keyboard up/down controls → Done → order persists.
  - Staff login: sees the grouped menu with interactive availability toggles but no edit/rename/reorder/add affordances.
  - Customer `/order`: unchanged grouping still renders correctly.

- [ ] **Step 4: Update `BUILD_STATUS.md`**

Add a row to the story table (after the Story 21 row) or extend Story 21's notes — record the mirror redesign as a follow-up:

```markdown
| 21a | Menu Management customer-mirror redesign (user-directed, post-epic) | Done | Rebuilds `/admin/menu-items` to render through the same shared `MenuGroups` component + `groupByCategory` utility as the customer menu (`Cart.tsx`), so admin edits against the exact layout customers see. Item rows and category headings are collapsed/click-to-expand; adding items happens inline per category; category ordering moved from a top panel into a focused drag-or-keyboard reorder mode backed by a new batch `PATCH /api/categories/reorder` (the per-step `/move` endpoint + `moveCategory` were removed, resolving ISSUE-25). No data-model change. Spec: `docs/superpowers/specs/2026-07-20-menu-management-mirror-design.md` · Plan: `docs/superpowers/plans/2026-07-20-menu-management-mirror.md` |
```

- [ ] **Step 5: Commit**

```bash
git add BUILD_STATUS.md ISSUES.md
git commit -m "docs: log menu-management mirror redesign (Story 21a)"
```
