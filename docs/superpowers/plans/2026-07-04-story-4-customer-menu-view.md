# Story 4 — Customer Menu View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `/order?table=<id>` page so an unauthenticated customer sees a mobile-first list of menu items — available items shown as selectable-looking buttons, sold-out items visibly disabled — without touching cart/order logic (Story 5) or the staff dashboard.

**Architecture:** `app/order/page.tsx` (already fetches the Table and handles missing/invalid ids) gains a call to `listMenuItems()` and renders the result as a list of buttons. No new routes, no new API endpoints, no client component, no `onClick` handlers.

**Tech Stack:** Next.js 16 App Router (server components), Prisma 7, Vitest 4. This story adds `jsdom` + `@testing-library/react` as new devDependencies — the first UI-rendering tests in this codebase.

## Global Constraints

- No new API routes or client components — `app/order/page.tsx` stays a server component (per the approved design spec, `docs/superpowers/specs/2026-07-04-story-4-customer-menu-view-design.md`).
- Do not touch cart/order submission logic, the staff dashboard, or menu management — out of scope per `07-epic-map.md` Story 4's scope boundary.
- Sold-out items must be rendered, not hidden, and must not be focusable/clickable (native `disabled` attribute).
- Existing missing/invalid table id error behavior in `app/order/page.tsx` must not regress.
- New jsdom-based tests must be scoped to `.test.tsx` files only — existing `.test.ts` service/API tests must keep running in the `node` environment (per `docs/superpowers/specs/2026-07-04-story-4-customer-menu-view-design.md`'s testing section).
- Currency values render via `.toString()` on the Prisma `Decimal`, matching the existing pattern in `app/admin/menu-items/page.tsx:22`.

---

### Task 1: Menu list rendering on the customer order page (TDD)

**Files:**
- Modify: `package.json` (add devDependencies)
- Modify: `vitest.config.ts` (scope a jsdom environment to `.test.tsx` files)
- Create: `vitest.setup.ts`
- Create: `app/order/page.test.tsx`
- Modify: `app/order/page.tsx`

**Interfaces:**
- Consumes: `getTableOrThrow(id: string): Promise<Table>` from `lib/tableService.ts` (throws `NotFoundError`); `listMenuItems(): Promise<MenuItem[]>` from `lib/menuService.ts`, where `MenuItem` has `{ id: string, name: string, price: Prisma.Decimal, available: boolean, archived: boolean, createdAt: Date }`; `NotFoundError` from `lib/errors.ts`.
- Produces: `OrderPage` default export from `app/order/page.tsx` unchanged in signature (`{ searchParams: Promise<{ table?: string }> }`) — no other file depends on new exports from this task.

- [ ] **Step 1: Install test dependencies**

Run:
```bash
npm install --save-dev jsdom @testing-library/react @testing-library/jest-dom @testing-library/dom
```
Expected: `package.json` `devDependencies` gains `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/dom`.

- [ ] **Step 2: Scope a jsdom environment to `.test.tsx` files**

Replace the full contents of `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

- [ ] **Step 3: Add the jest-dom matcher setup file**

Create `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Write the failing tests**

Create `app/order/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderPage from './page'
import { getTableOrThrow } from '@/lib/tableService'
import { listMenuItems } from '@/lib/menuService'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/tableService', () => ({
  getTableOrThrow: vi.fn(),
}))

vi.mock('@/lib/menuService', () => ({
  listMenuItems: vi.fn(),
}))

function priceOf(value: string) {
  return { toString: () => value } as never
}

describe('OrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an error when the table id is missing', async () => {
    const ui = await OrderPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This table link isn't valid. Please ask staff for help.",
    )
  })

  it('shows an error when the table id does not exist', async () => {
    vi.mocked(getTableOrThrow).mockRejectedValue(new NotFoundError('Table not found'))

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 'missing' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This table link isn't valid. Please ask staff for help.",
    )
  })

  it('renders available items as enabled buttons and sold-out items as disabled', async () => {
    vi.mocked(getTableOrThrow).mockResolvedValue({
      id: 't1',
      number: 5,
      createdAt: new Date(),
    } as never)
    vi.mocked(listMenuItems).mockResolvedValue([
      {
        id: 'm1',
        name: 'Burger',
        price: priceOf('12.50'),
        available: true,
        archived: false,
        createdAt: new Date(),
      },
      {
        id: 'm2',
        name: 'Fries',
        price: priceOf('4.00'),
        available: false,
        archived: false,
        createdAt: new Date(),
      },
    ] as never)

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 't1' }) })
    render(ui)

    expect(screen.getByRole('button', { name: /Burger/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Fries/ })).toBeDisabled()
  })

  it('shows an empty-state message when there are no menu items', async () => {
    vi.mocked(getTableOrThrow).mockResolvedValue({
      id: 't1',
      number: 5,
      createdAt: new Date(),
    } as never)
    vi.mocked(listMenuItems).mockResolvedValue([])

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 't1' }) })
    render(ui)

    expect(screen.getByText('No items available right now.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run app/order/page.test.tsx`
Expected: FAIL — the "renders available items..." and "shows an empty-state message..." tests fail because `app/order/page.tsx` still renders the "Menu coming soon." stub instead of any items or empty-state text.

- [ ] **Step 6: Implement the menu list rendering**

Replace the full contents of `app/order/page.tsx`:

```tsx
import { getTableOrThrow } from '@/lib/tableService'
import { listMenuItems } from '@/lib/menuService'
import { NotFoundError } from '@/lib/errors'

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>
}) {
  const { table: tableId } = await searchParams

  if (!tableId) {
    return (
      <main>
        <p role="alert">This table link isn&apos;t valid. Please ask staff for help.</p>
      </main>
    )
  }

  try {
    const table = await getTableOrThrow(tableId)
    const items = await listMenuItems()

    return (
      <main>
        <h1>Table {table.number}</h1>
        {items.length === 0 ? (
          <p>No items available right now.</p>
        ) : (
          <ul className="menu-list">
            {items.map((item) => (
              <li key={item.id} className="menu-list__item">
                <button type="button" className="menu-item-button" disabled={!item.available}>
                  <span className="menu-item-button__name">{item.name}</span>
                  <span className="menu-item-button__price">${item.price.toString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    )
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main>
          <p role="alert">This table link isn&apos;t valid. Please ask staff for help.</p>
        </main>
      )
    }
    throw error
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run app/order/page.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 8: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS — all existing `.test.ts` service/API tests still run under the `node` environment and pass, alongside the new `.test.tsx` file under `jsdom`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts app/order/page.tsx app/order/page.test.tsx
git commit -m "feat: render menu items on the customer order page"
```

---

### Task 2: Mobile-first styling for the menu list

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: the `menu-list`, `menu-list__item`, `menu-item-button`, `menu-item-button__name`, `menu-item-button__price` class names produced by Task 1's `app/order/page.tsx`, and the existing `--background`/`--foreground` CSS variables from `app/globals.css`.
- Produces: nothing consumed by later tasks — this is the terminal task for Story 4.

- [ ] **Step 1: Add mobile-first list styling**

Append to `app/globals.css`:

```css
.menu-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  max-width: 480px;
  margin: 1rem auto;
  padding: 0 1rem 1rem;
}

.menu-item-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0.75rem 1rem;
  border: 1px solid var(--foreground);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  font-size: 1rem;
  text-align: left;
  cursor: pointer;
}

.menu-item-button:hover:not(:disabled),
.menu-item-button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.menu-item-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-item-button:disabled .menu-item-button__name {
  text-decoration: line-through;
}

.menu-item-button__price {
  white-space: nowrap;
  margin-left: 1rem;
}
```

- [ ] **Step 2: Visually verify on a mobile viewport**

Run: `npm run dev`

In a browser, open a table's order URL (e.g. `http://localhost:3000/order?table=<a-real-table-id-from-your-seed-data>`), switch DevTools to a mobile device size (e.g. iPhone SE, 375px wide), and confirm:
- Items lay out in a single column with comfortable tap targets.
- Available items look interactive (visible border, focus outline on Tab).
- Sold-out items look visibly muted/struck-through and cannot be focused via Tab.
- Dark mode (OS-level dark theme, or DevTools "Emulate CSS prefers-color-scheme: dark") keeps text readable against the background.

Stop the dev server (`Ctrl+C`) once confirmed.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: mobile-first layout for the customer menu list"
```
