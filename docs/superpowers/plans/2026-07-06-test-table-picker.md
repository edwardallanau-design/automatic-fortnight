# Test Table Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-production-only `/order/test` page that lists existing tables by their human-friendly `number` and links each one to its real `/order?table=<id>` ordering flow, so QA doesn't have to copy table UUIDs out of the admin QR view.

**Architecture:** A single new Server Component route (`app/order/test/page.tsx`) that calls the existing, unmodified `listTables()` from `lib/tableService.ts` and renders a plain list of links. No new Prisma model, no new service method, no new API route, no changes to the real order flow (`app/order/page.tsx`, `app/order/Cart.tsx`) or to the admin table list (`app/admin/tables/page.tsx`).

**Tech Stack:** Next.js App Router (Server Components), TypeScript, Vitest + Testing Library (existing project conventions — see `app/order/page.test.tsx` and `lib/tableService.test.ts` for the exact mocking patterns to follow).

## Global Constraints

- Non-production gate: check `process.env.NODE_ENV === 'production'` and render a plain "not available" message instead of table data when true — this is a dev/QA convenience gate, not a security boundary (per the spec's Decisions section).
- Reuse `listTables()` from `lib/tableService.ts` exactly as-is — no new query, no new service method.
- Do not modify `lib/tableService.ts`, `app/order/page.tsx`, `app/order/Cart.tsx`, `app/admin/tables/page.tsx`, or the `Table` Prisma model/migrations.
- No auth guard on the new route — matches `/order`'s existing unauthenticated pattern (same trust level as a real QR link).
- Follow the existing test-mocking pattern: `vi.mock('@/lib/tableService', () => ({ listTables: vi.fn() }))` + `vi.mocked(listTables).mockResolvedValue(...)`, as done in `app/order/page.test.tsx`.

---

### Task 1: `/order/test` picker page

**Files:**
- Create: `app/order/test/page.tsx`
- Test: `app/order/test/page.test.tsx`

**Interfaces:**
- Consumes: `listTables(): Promise<Table[]>` from `@/lib/tableService` (existing, unchanged — `Table` has `id: string`, `number: number`, `createdAt: Date`).
- Produces: nothing consumed by other tasks — this is the only task in the plan.

- [ ] **Step 1: Write the failing tests**

Create `app/order/test/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TestTablePage from './page'
import { listTables } from '@/lib/tableService'

vi.mock('@/lib/tableService', () => ({
  listTables: vi.fn(),
}))

describe('TestTablePage', () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.stubEnv('NODE_ENV', originalEnv ?? 'test')
  })

  it('shows a not-available message in production and does not call listTables', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const ui = await TestTablePage()
    render(ui)

    expect(screen.getByText("This page isn't available.")).toBeInTheDocument()
    expect(listTables).not.toHaveBeenCalled()
  })

  it('renders a link per table labeled with its number, pointing at /order?table=<id>', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.mocked(listTables).mockResolvedValue([
      { id: 't1', number: 1, createdAt: new Date() },
      { id: 't2', number: 2, createdAt: new Date() },
    ] as never)

    const ui = await TestTablePage()
    render(ui)

    const link1 = screen.getByRole('link', { name: 'Table 1' })
    const link2 = screen.getByRole('link', { name: 'Table 2' })
    expect(link1).toHaveAttribute('href', '/order?table=t1')
    expect(link2).toHaveAttribute('href', '/order?table=t2')
  })

  it('shows an empty-state message when there are no tables', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.mocked(listTables).mockResolvedValue([])

    const ui = await TestTablePage()
    render(ui)

    expect(screen.getByText('No tables have been created yet.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/order/test/page.test.tsx`
Expected: FAIL — `Cannot find module './page'` (the page file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `app/order/test/page.tsx`:

```tsx
import Link from 'next/link'
import { listTables } from '@/lib/tableService'

export default async function TestTablePage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="order-page">
        <p className="order-page__error">This page isn&apos;t available.</p>
      </main>
    )
  }

  const tables = await listTables()

  return (
    <main className="order-page">
      <h1>Test table picker</h1>
      {tables.length === 0 ? (
        <p>No tables have been created yet.</p>
      ) : (
        <ul>
          {tables.map((table) => (
            <li key={table.id}>
              <Link href={`/order?table=${table.id}`}>Table {table.number}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/order/test/page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Manually verify the route in dev**

Run: `npm run dev`, then visit `http://localhost:3000/order/test` in a browser.
Expected: a list of any seeded tables (e.g. "Table 1", "Table 2", "Table 3" from `prisma/seed.ts`'s `SEED_TABLES`), each a clickable link. Clicking one loads the real `/order?table=<id>` menu page for that table.

- [ ] **Step 6: Commit**

```bash
git add app/order/test/page.tsx app/order/test/page.test.tsx
git commit -m "feat: add non-production test-table picker at /order/test"
```

## Spec Coverage Check

- "Visiting `/order/test` outside production shows a list of existing tables by number" → Task 1, Step 3/4 (list-rendering test) + Step 5 (manual verification).
- "Clicking a table in the list navigates to that table's real `/order?table=<id>` order flow" → Task 1, Step 1 (href assertion test).
- "Visiting `/order/test` in production shows a plain 'not available' message" → Task 1, Step 1 (production test).
- "No changes to the `Table` model, `tableService`, the real `/order` page, or the admin table list" → satisfied by construction — no task touches those files (see Global Constraints).
