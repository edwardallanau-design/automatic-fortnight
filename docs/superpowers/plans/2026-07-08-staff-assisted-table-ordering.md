# Staff-Assisted Table Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unauthenticated dev-only `/order/test` table picker with a staff-authenticated `/order/new` route, so staff can start an order for any table (or a reserved "Counter" table for walk-ins) on any environment.

**Architecture:** One new server component route (`/order/new`), gated by the existing `requireRole('staff')` guard. One new shared display helper (`formatTableLabel`) applied everywhere a table number is rendered, so table `0` shows as "Counter". One new non-throwing session read (`peekSession`) so the public order page can optionally show a staff-only "back to dashboard" link. The old `/order/test` route and its `ENABLE_TEST_PICKER` env gate are deleted outright.

**Tech Stack:** Next.js 16 (App Router, server components), Prisma 7, Vitest 4 + Testing Library (existing conventions).

## Global Constraints

- No changes to `lib/orderService.ts`, `lib/tableService.ts`, the `Table`/`Order` Prisma schema, or any `INV-*` invariant — spec's Scope section.
- Orders placed via this flow use the exact same `createOrder` path as customer orders, with no marker/flag distinguishing provenance — spec Decision (none needed).
- Table `0` is a pure display convention ("Counter") — no schema or migration change, created manually via the existing Table Setup admin UI — spec Decision 3.
- `/order/new` must accept both `staff` and `admin` sessions (i.e. gate with `requireRole('staff')`, not `requireRole('admin')`) — spec Decision 1.
- Do not add a `Co-Authored-By` trailer to any commit in this plan.

---

### Task 1: `formatTableLabel` display helper

**Files:**
- Create: `lib/tableDisplay.ts`
- Test: `lib/tableDisplay.test.ts`

**Interfaces:**
- Produces: `formatTableLabel(number: number): string` — returns `'Counter'` when `number === 0`, else `` `Table ${number}` ``. Consumed by Tasks 3, 6, 7, 8.

- [ ] **Step 1: Write the failing test**

```ts
// lib/tableDisplay.test.ts
import { describe, it, expect } from 'vitest'
import { formatTableLabel } from './tableDisplay'

describe('formatTableLabel', () => {
  it('renders table number 0 as "Counter"', () => {
    expect(formatTableLabel(0)).toBe('Counter')
  })

  it('renders any other table number as "Table N"', () => {
    expect(formatTableLabel(4)).toBe('Table 4')
    expect(formatTableLabel(12)).toBe('Table 12')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tableDisplay.test.ts`
Expected: FAIL with "Cannot find module './tableDisplay'" (or similar resolve error)

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/tableDisplay.ts
export function formatTableLabel(number: number): string {
  return number === 0 ? 'Counter' : `Table ${number}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tableDisplay.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/tableDisplay.ts lib/tableDisplay.test.ts
git commit -m "Add formatTableLabel table-display helper"
```

---

### Task 2: `peekSession` non-throwing session read

**Files:**
- Modify: `lib/authGuard.ts`
- Test: `lib/authGuard.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE_NAME`, `verifySession` from `lib/session.ts` (existing, already imported in this file).
- Produces: `peekSession(): Promise<{ role: Role } | null>` — reads the session cookie and returns the decoded session, or `null` if absent/invalid. Never redirects or throws. Consumed by Task 9.

- [ ] **Step 1: Write the failing test**

Add this `describe` block to the end of `lib/authGuard.test.ts` (the file already mocks `next/headers`'s `cookies` via `mockCookieGet`, and imports `signSession`/`SESSION_COOKIE_NAME` — reuse those):

```ts
// append to lib/authGuard.test.ts, after the requireApiRole describe block
describe('peekSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = 'test-secret'
  })

  it('returns the session when a valid cookie exists', async () => {
    const token = signSession('staff')
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: token })

    expect(await peekSession()).toEqual({ role: 'staff' })
  })

  it('returns null when no cookie is present', async () => {
    mockCookieGet.mockReturnValue(undefined)

    expect(await peekSession()).toBeNull()
  })

  it('returns null when the cookie is invalid, without redirecting or throwing', async () => {
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: 'garbage' })

    await expect(peekSession()).resolves.toBeNull()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
```

Also update the import line near the top of `lib/authGuard.test.ts`:

```ts
import { requireRole, requireApiRole, peekSession } from './authGuard'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/authGuard.test.ts`
Expected: FAIL — `peekSession` is not exported from `./authGuard`

- [ ] **Step 3: Write minimal implementation**

Add to `lib/authGuard.ts` (after `requireApiRole`):

```ts
export async function peekSession(): Promise<{ role: Role } | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)
  return cookie ? verifySession(cookie.value) : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/authGuard.test.ts`
Expected: PASS (all `requireRole`, `requireApiRole`, and new `peekSession` tests)

- [ ] **Step 5: Commit**

```bash
git add lib/authGuard.ts lib/authGuard.test.ts
git commit -m "Add peekSession non-throwing session read to authGuard"
```

---

### Task 3: Staff-gated `/order/new` table picker

**Files:**
- Create: `app/order/new/page.tsx`
- Test: `app/order/new/page.test.tsx`

**Interfaces:**
- Consumes: `requireRole('staff')` from `lib/authGuard.ts` (returns `{ role: Role }`, redirects to `/login` if unauthenticated — existing behavior, not retested here); `listTables()` from `lib/tableService.ts` (returns `Table[]`, each with `id: string`, `number: number`); `formatTableLabel(number: number): string` from Task 1.

- [ ] **Step 1: Write the failing test**

```tsx
// app/order/new/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NewOrderPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/tableService', () => ({
  listTables: vi.fn(),
}))

describe('NewOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })
  })

  it('renders a link per table labeled with its number, pointing at /order?table=<id>', async () => {
    vi.mocked(listTables).mockResolvedValue([
      { id: 't1', number: 1, createdAt: new Date() },
      { id: 't2', number: 2, createdAt: new Date() },
    ] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Table 1' })).toHaveAttribute('href', '/order?table=t1')
    expect(screen.getByRole('link', { name: 'Table 2' })).toHaveAttribute('href', '/order?table=t2')
  })

  it('renders table number 0 as "Counter"', async () => {
    vi.mocked(listTables).mockResolvedValue([{ id: 't0', number: 0, createdAt: new Date() }] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Counter' })).toHaveAttribute('href', '/order?table=t0')
  })

  it('shows an empty-state message with a link to table setup when there are no tables', async () => {
    vi.mocked(listTables).mockResolvedValue([])

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByText(/No tables yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table setup' })).toHaveAttribute('href', '/admin/tables')
  })

  it('renders for an admin session too', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listTables).mockResolvedValue([{ id: 't1', number: 1, createdAt: new Date() }] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Table 1' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/order/new/page.test.tsx`
Expected: FAIL — cannot find module `./page`

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/order/new/page.tsx
import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'
import { formatTableLabel } from '@/lib/tableDisplay'

export default async function NewOrderPage() {
  await requireRole('staff')

  const tables = await listTables()

  return (
    <main className="table-picker">
      <header className="order-header">
        <span className="order-header__eyebrow">Staff · New order</span>
        <h1 className="order-header__title">Choose a table</h1>
      </header>

      {tables.length === 0 ? (
        <p className="table-picker__empty">
          No tables yet. Create one in <Link href="/admin/tables">Table setup</Link>.
        </p>
      ) : (
        <ul className="table-picker__list">
          {tables.map((table) => (
            <li key={table.id}>
              <Link className="table-picker__row" href={`/order?table=${table.id}`}>
                <span className="table-picker__row-label">{formatTableLabel(table.number)}</span>
                <span className="table-picker__chevron" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/order/new/page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/order/new/page.tsx app/order/new/page.test.tsx
git commit -m "Add staff-gated /order/new table picker"
```

---

### Task 4: Retire `/order/test` and `ENABLE_TEST_PICKER`

**Files:**
- Delete: `app/order/test/page.tsx`
- Delete: `app/order/test/page.test.tsx`
- Modify: `.env.docker.example`
- Modify: `docs/superpowers/specs/2026-07-08-production-deployment-design.md:44`
- Modify: `docs/superpowers/plans/2026-07-08-production-deployment.md:16`

**Interfaces:** None — this task removes code, it doesn't produce anything later tasks consume.

- [ ] **Step 1: Delete the old picker route and its test**

```bash
git rm app/order/test/page.tsx app/order/test/page.test.tsx
```

- [ ] **Step 2: Remove the `ENABLE_TEST_PICKER` block from `.env.docker.example`**

Remove these lines (currently lines 14-17 of `.env.docker.example`):

```
# Dev/QA: set to "true" to expose the /order/test table picker inside this
# (production) container. Leave unset/false on a real deployment to keep it hidden.
ENABLE_TEST_PICKER=true
```

The file should end with the `SEED_ADMIN_PASSWORD` line and no trailing blank env block.

- [ ] **Step 3: Annotate the historical deployment spec**

In `docs/superpowers/specs/2026-07-08-production-deployment-design.md`, find this line (currently line 44):

```
  - `ENABLE_TEST_PICKER` — left **unset** in both environments, keeping `/order/test` (the dev table picker) hidden in production. Already correctly gated by `NODE_ENV` + this flag in `app/order/test/page.tsx` — no code change needed.
```

Append a new sentence to the end of that same line (keep the original text intact as the historical record; add the note after it):

```
  - `ENABLE_TEST_PICKER` — left **unset** in both environments, keeping `/order/test` (the dev table picker) hidden in production. Already correctly gated by `NODE_ENV` + this flag in `app/order/test/page.tsx` — no code change needed. **Superseded 2026-07-08:** `/order/test` and this flag were removed entirely in favor of a staff-authenticated `/order/new` route — see `docs/superpowers/specs/2026-07-08-staff-assisted-table-ordering-design.md`.
```

- [ ] **Step 4: Annotate the historical deployment plan's Global Constraints**

In `docs/superpowers/plans/2026-07-08-production-deployment.md`, find this line (currently line 16):

```
- `ENABLE_TEST_PICKER` must stay unset in both the Production and Preview Vercel environments — spec §2.
```

Replace it with:

```
- `ENABLE_TEST_PICKER` must stay unset in both the Production and Preview Vercel environments — spec §2. **Superseded 2026-07-08:** this env var and `/order/test` no longer exist, replaced by the staff-authenticated `/order/new` route — see `docs/superpowers/specs/2026-07-08-staff-assisted-table-ordering-design.md`.
```

- [ ] **Step 5: Confirm no remaining references and run the full suite**

Run: `grep -rl "ENABLE_TEST_PICKER" --include="*.ts" --include="*.tsx" .`
Expected: no output (no code references remain — only the two annotated historical docs mention it now)

Run: `npx vitest run`
Expected: PASS, with the old `app/order/test/page.test.tsx` suite no longer present in the run

- [ ] **Step 6: Commit**

```bash
git add -A app/order/test .env.docker.example docs/superpowers/specs/2026-07-08-production-deployment-design.md docs/superpowers/plans/2026-07-08-production-deployment.md
git commit -m "Retire /order/test and ENABLE_TEST_PICKER in favor of /order/new"
```

---

### Task 5: Prominent "New order" button on the staff dashboard

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/page.test.tsx`
- Modify: `app/globals.css` (add `.staff-header__new-order`, after the existing `.staff-header__nav a:hover, .staff-header__nav a:focus-visible` rule around line 1125)

**Interfaces:**
- No new exports — this is a UI-only change to an existing page.

- [ ] **Step 1: Write the failing test**

Add to `app/dashboard/page.test.tsx` (inside the existing `describe('DashboardPage', ...)` block):

```tsx
it('shows a prominent New order button for a staff session', async () => {
  vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

  const ui = await DashboardPage()
  render(ui)

  expect(screen.getByRole('link', { name: '+ New order' })).toHaveAttribute('href', '/order/new')
})

it('shows the New order button for an admin session too', async () => {
  vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })

  const ui = await DashboardPage()
  render(ui)

  expect(screen.getByRole('link', { name: '+ New order' })).toHaveAttribute('href', '/order/new')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/dashboard/page.test.tsx`
Expected: FAIL — no element found with role "link" and name "+ New order"

- [ ] **Step 3: Write minimal implementation**

Replace the `<header className="staff-header">` block in `app/dashboard/page.tsx` with:

```tsx
<header className="staff-header">
  <div>
    <span className="staff-header__eyebrow">Order rail</span>
    <h1 className="staff-header__title">Staff Dashboard</h1>
  </div>
  <div className="staff-header__meta">
    <Link href="/order/new" className="staff-header__new-order">
      + New order
    </Link>
    <p className="staff-header__role">Logged in as: {role}</p>
    {role === 'admin' && (
      <nav className="staff-header__nav">
        <Link href="/admin/menu">Menu Management</Link>
        <Link href="/admin/tables">Table Setup</Link>
      </nav>
    )}
  </div>
</header>
```

Add to `app/globals.css`, immediately after the `.staff-header__nav a:hover, .staff-header__nav a:focus-visible` rule:

```css
.staff-header__new-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  background: var(--copper-bright);
  color: var(--espresso);
  font-weight: 700;
  font-size: 0.9rem;
  text-decoration: none;
  transition: transform 0.1s ease;
}

.staff-header__new-order:hover,
.staff-header__new-order:focus-visible {
  background: var(--copper);
  outline: none;
}

.staff-header__new-order:active {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .staff-header__new-order:active {
    transform: none;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/dashboard/page.test.tsx`
Expected: PASS (all 4 tests: staff render, admin nav links, staff New order button, admin New order button)

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/page.test.tsx app/globals.css
git commit -m "Add prominent New order button to staff dashboard"
```

---

### Task 6: Apply the Counter convention to the dashboard's order cards

**Files:**
- Modify: `app/dashboard/OrderCard.tsx`
- Modify: `app/dashboard/OrderCard.test.tsx`

**Interfaces:**
- Consumes: `formatTableLabel(number: number): string` from Task 1.

- [ ] **Step 1: Write the failing test**

Add to `app/dashboard/OrderCard.test.tsx` (inside the existing `describe('OrderCard', ...)` block):

```tsx
it('renders "Counter" instead of "Table 0" for a table number 0 order', () => {
  render(<OrderCard order={{ ...order, table: { number: 0 } }} exiting={false} onOpen={vi.fn()} />)

  expect(screen.getByText('Counter')).toBeInTheDocument()
  expect(screen.queryByText('Table 0')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: FAIL — "Counter" not found in the document (renders "Table 0" instead)

- [ ] **Step 3: Write minimal implementation**

In `app/dashboard/OrderCard.tsx`, add the import:

```tsx
import { formatTableLabel } from '@/lib/tableDisplay'
```

Replace the `aria-label` and table `<span>` in the returned JSX:

```tsx
aria-label={`Order ${order.orderNumber}, ${formatTableLabel(order.table.number)}`}
```

```tsx
<span className="order-card__table">
  {formatTableLabel(order.table.number)}
  {order.customerName && <span className="order-card__customer"> · {order.customerName}</span>}
</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: PASS (all existing tests plus the new Counter test)

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/OrderCard.tsx app/dashboard/OrderCard.test.tsx
git commit -m "Apply Counter display convention to dashboard order cards"
```

---

### Task 7: Apply the Counter convention to the customer menu page header

**Files:**
- Modify: `app/order/OrderHeaderTitle.tsx`
- Modify: `app/order/OrderHeaderTitle.test.tsx`

**Interfaces:**
- Consumes: `formatTableLabel(number: number): string` from Task 1.

- [ ] **Step 1: Write the failing test**

Add to `app/order/OrderHeaderTitle.test.tsx` (inside the existing `describe('OrderHeaderTitle', ...)` block):

```tsx
it('renders "Counter" instead of "Table 0" when tableNumber is 0', () => {
  render(<OrderHeaderTitle tableId="t0" tableNumber={0} />)

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Counter')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/order/OrderHeaderTitle.test.tsx`
Expected: FAIL — heading text is "Table 0", not "Counter"

- [ ] **Step 3: Write minimal implementation**

In `app/order/OrderHeaderTitle.tsx`, add the import:

```tsx
import { formatTableLabel } from '@/lib/tableDisplay'
```

Replace the heading's first line of content:

```tsx
return (
  <h1 className="order-header__title">
    {formatTableLabel(tableNumber)}
    {name && <span className="order-header__name"> · {name}</span>}
  </h1>
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/order/OrderHeaderTitle.test.tsx`
Expected: PASS (all existing tests plus the new Counter test)

- [ ] **Step 5: Commit**

```bash
git add app/order/OrderHeaderTitle.tsx app/order/OrderHeaderTitle.test.tsx
git commit -m "Apply Counter display convention to customer menu page header"
```

---

### Task 8: Apply the Counter convention to the order confirmation page header

**Files:**
- Modify: `app/order/[id]/page.tsx`
- Modify: `app/order/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `formatTableLabel(number: number): string` from Task 1.

- [ ] **Step 1: Write the failing test**

Add to `app/order/[id]/page.test.tsx` (inside the existing `describe('OrderDetailPage', ...)` block):

```tsx
it('renders "Counter" instead of "Table 0" when the order is for table number 0', async () => {
  vi.mocked(getOrderById).mockResolvedValue({
    ...order('Pending'),
    table: { id: 't0', number: 0, createdAt: new Date() },
  } as never)

  const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
  render(ui)

  expect(screen.getByText('Counter')).toBeInTheDocument()
  expect(screen.queryByText('Table 0')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/order/[id]/page.test.tsx`
Expected: FAIL — "Counter" not found (renders "Table 0" instead)

- [ ] **Step 3: Write minimal implementation**

In `app/order/[id]/page.tsx`, add the import:

```tsx
import { formatTableLabel } from '@/lib/tableDisplay'
```

Replace the header's title line:

```tsx
<h1 className="order-header__title">{formatTableLabel(order.table.number)}</h1>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/order/[id]/page.test.tsx`
Expected: PASS (all existing tests plus the new Counter test)

- [ ] **Step 5: Commit**

```bash
git add "app/order/[id]/page.tsx" "app/order/[id]/page.test.tsx"
git commit -m "Apply Counter display convention to order confirmation page"
```

---

### Task 9: Staff back-to-dashboard link on the customer order page

**Files:**
- Modify: `app/order/page.tsx`
- Modify: `app/order/page.test.tsx`

**Interfaces:**
- Consumes: `peekSession(): Promise<{ role: Role } | null>` from Task 2.

- [ ] **Step 1: Write the failing test**

Add this mock near the top of `app/order/page.test.tsx`, alongside the existing `vi.mock` calls:

```tsx
vi.mock('@/lib/authGuard', () => ({
  peekSession: vi.fn(),
}))
```

Add the import:

```tsx
import { peekSession } from '@/lib/authGuard'
```

Update the `beforeEach` to default `peekSession` to no session, so existing tests are unaffected:

```tsx
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(peekSession).mockResolvedValue(null)
})
```

Add these tests (inside the existing `describe('OrderPage', ...)` block):

```tsx
it('does not show a back-to-dashboard link when there is no staff session', async () => {
  vi.mocked(getTableOrThrow).mockResolvedValue({ id: 't1', number: 5, createdAt: new Date() } as never)
  vi.mocked(listMenuItems).mockResolvedValue([])

  const ui = await OrderPage({ searchParams: Promise.resolve({ table: 't1' }) })
  render(ui)

  expect(screen.queryByRole('link', { name: '← Dashboard' })).not.toBeInTheDocument()
})

it('shows a back-to-dashboard link for an authenticated staff session', async () => {
  vi.mocked(getTableOrThrow).mockResolvedValue({ id: 't1', number: 5, createdAt: new Date() } as never)
  vi.mocked(listMenuItems).mockResolvedValue([])
  vi.mocked(peekSession).mockResolvedValue({ role: 'staff' })

  const ui = await OrderPage({ searchParams: Promise.resolve({ table: 't1' }) })
  render(ui)

  expect(screen.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/dashboard')
})

it('shows a back-to-dashboard link for an authenticated admin session', async () => {
  vi.mocked(getTableOrThrow).mockResolvedValue({ id: 't1', number: 5, createdAt: new Date() } as never)
  vi.mocked(listMenuItems).mockResolvedValue([])
  vi.mocked(peekSession).mockResolvedValue({ role: 'admin' })

  const ui = await OrderPage({ searchParams: Promise.resolve({ table: 't1' }) })
  render(ui)

  expect(screen.getByRole('link', { name: '← Dashboard' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/order/page.test.tsx`
Expected: FAIL — no element found with role "link" and name "← Dashboard" (and `peekSession` mock import fails until the mock is wired up)

- [ ] **Step 3: Write minimal implementation**

In `app/order/page.tsx`, update the imports:

```tsx
import Link from 'next/link'
import { getTableOrThrow } from '@/lib/tableService'
import { listMenuItems } from '@/lib/menuService'
import { peekSession } from '@/lib/authGuard'
import { NotFoundError } from '@/lib/errors'
import { Cart } from './Cart'
import { OrderHeaderTitle } from './OrderHeaderTitle'
```

Replace the function body with:

```tsx
export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>
}) {
  const { table: tableId } = await searchParams

  if (!tableId) {
    return (
      <main className="order-page">
        <p role="alert" className="order-page__error">
          This table link isn&apos;t valid. Please ask staff for help.
        </p>
      </main>
    )
  }

  const session = await peekSession()

  try {
    const table = await getTableOrThrow(tableId)
    const items = await listMenuItems()

    return (
      <main className="order-page">
        <header className="order-header">
          <div className="order-header__row">
            <span className="order-header__eyebrow">Now serving</span>
            {session && (
              <Link href="/dashboard" className="order-header__back">
                ← Dashboard
              </Link>
            )}
          </div>
          <OrderHeaderTitle tableId={table.id} tableNumber={table.number} />
        </header>
        {items.length === 0 ? (
          <p className="order-page__empty">No items available right now.</p>
        ) : (
          <Cart
            tableId={table.id}
            items={items.map((item) => ({
              id: item.id,
              name: item.name,
              price: item.price.toString(),
              available: item.available,
            }))}
          />
        )}
      </main>
    )
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="order-page">
          <p role="alert" className="order-page__error">
            This table link isn&apos;t valid. Please ask staff for help.
          </p>
        </main>
      )
    }
    throw error
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/order/page.test.tsx`
Expected: PASS (all existing tests plus the 3 new back-link tests)

- [ ] **Step 5: Commit**

```bash
git add app/order/page.tsx app/order/page.test.tsx
git commit -m "Add staff back-to-dashboard link on the customer order page"
```

---

### Task 10: Full suite verification and BUILD_STATUS.md wrap-up

**Files:**
- Modify: `BUILD_STATUS.md`

**Interfaces:** None.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all suites green, no reference to `app/order/test` remains

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Flip story 11's status from Building to Done in `BUILD_STATUS.md`**

`BUILD_STATUS.md` already has a row for this story (added `Building` when this plan started). In the "MVP epic: Digital Ordering Core Loop" table, change:

```
| 11 | Staff-assisted table ordering (user-directed, post-epic) | Building | Replaces `/order/test` with staff-authenticated `/order/new`; adds a "Counter" (table `0`) convention for walk-in orders. Spec: docs/superpowers/specs/2026-07-08-staff-assisted-table-ordering-design.md · Plan: docs/superpowers/plans/2026-07-08-staff-assisted-table-ordering.md |
```

to:

```
| 11 | Staff-assisted table ordering (user-directed, post-epic) | Done | Replaces `/order/test` with staff-authenticated `/order/new`; adds a "Counter" (table `0`) convention for walk-in orders. Spec: docs/superpowers/specs/2026-07-08-staff-assisted-table-ordering-design.md · Plan: docs/superpowers/plans/2026-07-08-staff-assisted-table-ordering.md |
```

- [ ] **Step 4: Commit**

```bash
git add BUILD_STATUS.md
git commit -m "Mark staff-assisted table ordering Done in BUILD_STATUS.md"
```

## Self-Review Notes

- **Spec coverage:** Decision 1 (replace `/order/test` with `/order/new`) → Tasks 3, 4. Decision 2 (prominent all-staff dashboard entry point) → Task 5. Decision 3 (Counter convention, no schema change) → Tasks 1, 6, 7, 8. Decision 4 (staff back-navigation) → Tasks 2, 9. Testing section's four bullet points → covered across Tasks 3 (requireRole + rendering), 5 (dashboard button, both roles), 9 (back-link presence/absence), 6/7/8 (Counter convention on picker + dashboard, extended to all three table-number display sites for consistency).
- **Placeholder scan:** no TBD/TODO; all code blocks are complete and copy-pasteable.
- **Type/name consistency:** `formatTableLabel(number: number): string` (Task 1) used identically in Tasks 3, 6, 7, 8. `peekSession(): Promise<{ role: Role } | null>` (Task 2) used identically in Task 9. `requireRole('staff')` return shape `{ role: Role }` matches existing usage in `app/dashboard/page.tsx`.
