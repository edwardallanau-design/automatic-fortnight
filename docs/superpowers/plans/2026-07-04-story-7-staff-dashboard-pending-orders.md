# Story 7 — Staff Dashboard: View Pending Orders (Polling) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give staff/admin a dashboard that polls `GET /api/orders?status=pending` every 3.5s and renders currently-Pending orders (table number, order number, time placed, items+quantities), so new orders appear without a manual reload and Confirmed/Cancelled orders drop off automatically.

**Architecture:** Extend the existing three-layer stack (route handler → service → Prisma) with a `GET /api/orders` route and an `orderService.listOrders()` function, then add a `"use client"` polling component rendered from the existing `app/dashboard/page.tsx` server component. No new dependencies — polling uses plain `setInterval`, matching ADR-001's explicit rejection of WebSockets/managed realtime.

**Tech Stack:** Next.js 16 API routes, Prisma 7 (`@prisma/client`), Vitest 4 (`node` project for `.test.ts`, `jsdom` project for `.test.tsx`), `@testing-library/react`.

## Global Constraints

- Status codes/error envelope per `05-api-conventions.md`: `GET` collection → `200` + array always (never `404` for empty results); errors as `{ error, message }` via the shared `handleApiError()`.
- API routes authorize with `requireApiRole(minRole)` from `lib/authGuard.ts` (throws `ForbiddenError` → `403`), never `requireRole` (that variant calls Next's `redirect()` and is for server components only).
- No new npm dependencies — this story stays within `next`/`react`/`@prisma/client`, per ADR-001's explicit rejection of a realtime library.
- All new/changed logic-layer code goes in `lib/orderService.ts`; the route handler in `app/api/orders/route.ts` only does request parsing, the auth guard call, and response shaping (per `04-architecture.md`'s boundary/logic split).
- Poll interval: 3.5 seconds (midpoint of ADR-001's 3–4s window).
- A failed poll tick is swallowed silently — the dashboard keeps showing the last-known order list and retries on the next tick. No error banner.

---

### Task 1: `apiClient.get`

**Files:**
- Modify: `lib/apiClient.ts`
- Test: `lib/apiClient.test.ts`

**Interfaces:**
- Consumes: nothing new — follows the existing `post`/`patch`/`del` pattern in the same file (fetch wrapper, `ApiError` on non-2xx).
- Produces: `apiClient.get<T>(path: string): Promise<T>` — used by Task 4's dashboard component.

- [ ] **Step 1: Write the failing tests**

Add to `lib/apiClient.test.ts`, after the existing `describe('apiClient.post', ...)` block (before `describe('apiClient.patch', ...)`):

```ts
describe('apiClient.get', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ id: 'o1' }]),
    }))

    const result = await apiClient.get('/api/orders?status=pending')
    expect(result).toEqual([{ id: 'o1' }])
    expect(fetch).toHaveBeenCalledWith('/api/orders?status=pending', {
      credentials: 'include',
    })
  })

  it('throws ApiError with code/message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'FORBIDDEN', message: 'Insufficient role for this action' }),
    }))

    await expect(apiClient.get('/api/orders?status=pending'))
      .rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Insufficient role for this action' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/apiClient.test.ts`
Expected: FAIL — `apiClient.get is not a function`

- [ ] **Step 3: Implement `get` in `lib/apiClient.ts`**

Add this function above `export const apiClient = { post, patch, del }` and update that export line:

```ts
async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.error, data.message)
  }

  return data as T
}
```

```ts
export const apiClient = { get, post, patch, del }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/apiClient.test.ts`
Expected: PASS (all tests in the file, 3 pre-existing describe blocks + the new one)

- [ ] **Step 5: Commit**

```bash
git add lib/apiClient.ts lib/apiClient.test.ts
git commit -m "Add apiClient.get for the staff dashboard's polling fetch"
```

---

### Task 2: `orderService.listOrders`

**Files:**
- Modify: `lib/orderService.ts`
- Test: `lib/orderService.test.ts`

**Interfaces:**
- Consumes: `prisma.order.findMany` (mocked in tests, same pattern as `lib/menuService.test.ts`'s `prisma.menuItem` mocks).
- Produces: `listOrders(options?: { status?: FulfillmentStatus }): Promise<OrderWithItemsAndTable[]>`, and the exported type `OrderWithItemsAndTable = Order & { items: OrderItem[]; table: Table }`, used by Task 3's route handler.

Note: this introduces a *new* type (`OrderWithItemsAndTable`) rather than widening the existing `OrderWithItems` export, so `createOrder`'s return shape (and Story 5's route/tests, which assert on `{ id, orderNumber, tableId, fulfillmentStatus, paymentStatus, items }` with no `table` key) is untouched.

- [ ] **Step 1: Write the failing test**

`lib/orderService.test.ts` currently mocks `prisma.order` with only `create: vi.fn()` (see the `vi.mock('./prisma', ...)` block at the top of the file). Change it to:

```ts
vi.mock('./prisma', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))
```

Then change the import line `import { createOrder } from './orderService'` to `import { createOrder, listOrders } from './orderService'`, and add this new `describe` block after the existing `describe('orderService.createOrder', ...)` block:

```ts
describe('orderService.listOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries with a status filter, ordered oldest-first, including items and table', async () => {
    const orders = [
      {
        id: 'o1',
        orderNumber: 1,
        tableId: 't1',
        fulfillmentStatus: 'Pending',
        paymentStatus: 'Unpaid',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        confirmedAt: null,
        items: [],
        table: { id: 't1', number: 4, createdAt: new Date() },
      },
    ]
    vi.mocked(prisma.order.findMany).mockResolvedValue(orders as never)

    const result = await listOrders({ status: 'Pending' })

    expect(result).toEqual(orders)
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending' },
      include: { items: true, table: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('omits the where filter when no status is given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders()

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {},
      include: { items: true, table: true },
      orderBy: { createdAt: 'asc' },
    })
  })
})
```

Also add the import at the top of the test file: `import { createOrder, listOrders } from './orderService'` (extend the existing import line rather than duplicating it).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/orderService.test.ts`
Expected: FAIL — `listOrders is not a function`

- [ ] **Step 3: Implement `listOrders` in `lib/orderService.ts`**

Add this import at the top (extend the existing `import type { Order, OrderItem } from '@prisma/client'` line):

```ts
import type { Order, OrderItem, Table, FulfillmentStatus } from '@prisma/client'
```

Add below the existing `OrderWithItems` type and `createOrder` function:

```ts
export type OrderWithItemsAndTable = Order & { items: OrderItem[]; table: Table }

export async function listOrders(options: { status?: FulfillmentStatus } = {}): Promise<OrderWithItemsAndTable[]> {
  return prisma.order.findMany({
    where: options.status ? { fulfillmentStatus: options.status } : {},
    include: { items: true, table: true },
    orderBy: { createdAt: 'asc' },
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/orderService.test.ts`
Expected: PASS (all existing `createOrder` tests plus the two new `listOrders` tests)

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "Add orderService.listOrders for the staff dashboard's status-filtered order list"
```

---

### Task 3: `GET /api/orders` route

**Files:**
- Modify: `app/api/orders/route.ts`
- Test: `app/api/orders/route.test.ts`

**Interfaces:**
- Consumes: `listOrders(options?: { status?: FulfillmentStatus })` from Task 2; `requireApiRole(minRole: Role): Promise<{ role: Role }>` from `lib/authGuard.ts` (existing).
- Produces: `GET` export from `app/api/orders/route.ts`, called by the dashboard component in Task 4 via `apiClient.get('/api/orders?status=pending')`.

- [ ] **Step 1: Write the failing tests**

Add to `app/api/orders/route.test.ts`. First, extend the existing `vi.mock('@/lib/orderService', ...)` to also export `listOrders: vi.fn()`, add a `vi.mock('@/lib/authGuard', () => ({ requireApiRole: vi.fn() }))` block (following `app/api/menu-items/route.test.ts`'s pattern), and change the `POST` import line to `import { GET, POST } from './route'`. Also add `import { listOrders } from '@/lib/orderService'` and `import { requireApiRole } from '@/lib/authGuard'` alongside the existing `createOrder` import, and `import { ForbiddenError } from '@/lib/errors'` (extend the existing errors import line).

Then add this new `describe` block:

```ts
function makeGetRequest(query = ''): Request {
  return new Request(`http://localhost/api/orders${query}`)
}

describe('GET /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 200 with the filtered list for status=pending', async () => {
    const orders = [{ id: 'o1', orderNumber: 1, fulfillmentStatus: 'Pending', table: { number: 4 }, items: [] }]
    vi.mocked(listOrders).mockResolvedValue(orders as never)

    const res = await GET(makeGetRequest('?status=pending'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].orderNumber).toBe(1)
    expect(listOrders).toHaveBeenCalledWith({ status: 'Pending' })
  })

  it('returns 200 with an unfiltered call when no status is given', async () => {
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest())

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: undefined })
  })

  it('returns 400 for an invalid status value', async () => {
    const res = await GET(makeGetRequest('?status=bogus'))

    expect(res.status).toBe(400)
    expect(listOrders).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not staff or admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await GET(makeGetRequest('?status=pending'))

    expect(res.status).toBe(403)
    expect(listOrders).not.toHaveBeenCalled()
  })

  it('returns an empty array (not 404) when there are no matching orders', async () => {
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest('?status=pending'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: FAIL — `GET is not exported` (or a TS error on the missing import) from `./route`

- [ ] **Step 3: Implement `GET` in `app/api/orders/route.ts`**

Replace the full file contents with:

```ts
import { NextResponse } from 'next/server'
import type { FulfillmentStatus } from '@prisma/client'
import { createOrder, listOrders } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'

const STATUS_PARAM_MAP: Record<string, FulfillmentStatus> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

export async function GET(request: Request) {
  try {
    await requireApiRole('staff')

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')

    let status: FulfillmentStatus | undefined
    if (statusParam !== null) {
      status = STATUS_PARAM_MAP[statusParam]
      if (!status) {
        throw new ValidationError(`Invalid status: ${statusParam}`)
      }
    }

    const orders = await listOrders({ status })
    return NextResponse.json(orders, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (typeof body.tableId !== 'string' || body.tableId.trim() === '') {
      throw new ValidationError('tableId is required')
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new ValidationError('items must be a non-empty array')
    }
    for (const item of body.items) {
      if (typeof item.menuItemId !== 'string' || item.menuItemId.trim() === '') {
        throw new ValidationError('each item requires a menuItemId')
      }
      if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new ValidationError('each item requires a positive integer quantity')
      }
    }

    const order = await createOrder(body.tableId, body.items)
    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

(This only adds the `GET` export and its two new imports/const — the `POST` body is unchanged from the current file.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: PASS (all existing `POST` tests plus the new `GET` tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "Add GET /api/orders?status= for the staff dashboard"
```

---

### Task 4: Polling dashboard component

**Files:**
- Create: `app/dashboard/PendingOrdersDashboard.tsx`
- Test: `app/dashboard/PendingOrdersDashboard.test.tsx`

**Interfaces:**
- Consumes: `apiClient.get<T>(path: string): Promise<T>` from Task 1; calls `GET /api/orders?status=pending` from Task 3, expecting an array of `{ id: string, orderNumber: number, createdAt: string, table: { number: number }, items: { id: string, nameSnapshot: string, priceSnapshot: string, quantity: number }[] }`.
- Produces: `PendingOrdersDashboard` component, rendered by Task 5's `app/dashboard/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `app/dashboard/PendingOrdersDashboard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'
import { apiClient } from '@/lib/apiClient'

vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: vi.fn() },
}))

const orderA = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  table: { number: 4 },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

const orderB = {
  id: 'o2',
  orderNumber: 102,
  createdAt: '2026-07-04T12:01:00.000Z',
  table: { number: 7 },
  items: [{ id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
}

describe('PendingOrdersDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:02:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders orders returned by the initial fetch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(apiClient.get).toHaveBeenCalledWith('/api/orders?status=pending')
  })

  it('re-fetches on each polling interval and renders newly-arrived orders', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce([orderA])
      .mockResolvedValueOnce([orderA, orderB])
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.queryByText('Table 7')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('Table 7')).toBeInTheDocument()
    expect(apiClient.get).toHaveBeenCalledTimes(2)
  })

  it('keeps showing the last-known orders when a poll tick fails', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce([orderA])
      .mockRejectedValueOnce(new Error('network error'))
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Table 4')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('Table 4')).toBeInTheDocument()
  })

  it('shows "No pending orders" when the list is empty', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([])
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('No pending orders')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — cannot find module `./PendingOrdersDashboard`

- [ ] **Step 3: Implement `PendingOrdersDashboard`**

Create `app/dashboard/PendingOrdersDashboard.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'

const POLL_INTERVAL_MS = 3500

type PendingOrderItem = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

type PendingOrder = {
  id: string
  orderNumber: number
  createdAt: string
  table: { number: number }
  items: PendingOrderItem[]
}

function formatTimeAgo(createdAt: string): string {
  const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago`
}

export function PendingOrdersDashboard() {
  const [orders, setOrders] = useState<PendingOrder[]>([])

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const result = await apiClient.get<PendingOrder[]>('/api/orders?status=pending')
        if (!cancelled) setOrders(result)
      } catch {
        // Transient poll failure: keep the last-known list, retry next tick.
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (orders.length === 0) {
    return <p>No pending orders</p>
  }

  return (
    <ul aria-label="Pending orders">
      {orders.map((order) => (
        <li key={order.id} aria-label={`Order ${order.orderNumber}`}>
          <span>Table {order.table.number}</span>
          <span>#{order.orderNumber}</span>
          <span>{formatTimeAgo(order.createdAt)}</span>
          <ul>
            {order.items.map((item) => (
              <li key={item.id}>
                {item.quantity}x {item.nameSnapshot}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx
git commit -m "Add PendingOrdersDashboard: client-side polling view of Pending orders"
```

---

### Task 5: Wire the dashboard component into the staff dashboard page

**Files:**
- Modify: `app/dashboard/page.tsx`
- Test: `app/dashboard/page.test.tsx` (new)

**Interfaces:**
- Consumes: `PendingOrdersDashboard` from Task 4; `requireRole` from `lib/authGuard.ts` (existing, unchanged).
- Produces: nothing consumed by later tasks — this is the final integration point for Story 7.

- [ ] **Step 1: Write the failing test**

Create `app/dashboard/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardPage from './page'
import { requireRole } from '@/lib/authGuard'
import { apiClient } from '@/lib/apiClient'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: vi.fn() },
}))

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue([])
  })

  it('renders the pending orders dashboard for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByText('Staff Dashboard')).toBeInTheDocument()
    expect(await screen.findByText('No pending orders')).toBeInTheDocument()
  })

  it('still shows admin-only nav links for an admin session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })

    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table Setup' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/page.test.tsx`
Expected: FAIL — `screen.findByText('No pending orders')` never appears (component not yet rendered)

- [ ] **Step 3: Wire the component into the page**

Replace `app/dashboard/page.tsx` with:

```tsx
import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'

export default async function DashboardPage() {
  const { role } = await requireRole('staff')

  return (
    <main>
      <h1>Staff Dashboard</h1>
      <p>Logged in as: {role}</p>
      {role === 'admin' && (
        <nav>
          <Link href="/admin/menu">Menu Management</Link>
          <Link href="/admin/tables">Table Setup</Link>
        </nav>
      )}
      <PendingOrdersDashboard />
    </main>
  )
}
```

(Note: only the `PendingOrdersDashboard` import and its render call are new — everything else in this file, including the `href="/admin/menu"` value, is copied verbatim from the current version. That href doesn't match the actual `app/admin/menu-items` route directory, but that's a pre-existing discrepancy from Story 1/3 — out of scope for Story 7, don't fix it here.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/page.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test file in the project, confirming Task 1–5's changes haven't broken Story 1–5's existing tests (in particular `app/api/orders/route.test.ts`'s existing `POST` tests, `lib/orderService.test.ts`'s `createOrder` tests, and `app/order/Cart.test.tsx`, none of which this plan touches).

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/page.test.tsx
git commit -m "Wire PendingOrdersDashboard into the staff dashboard page"
```

---

## Post-implementation: story bookkeeping

Not a code task, but required by this project's `CLAUDE.md` operating loop:

- [ ] Update `BUILD_STATUS.md`: move Story 7's row from `Backlog` to `Done`.
- [ ] Manually verify Story 7's acceptance criteria against `docs/design/07-epic-map.md`:
  - Dashboard shows all currently Pending orders, refreshing within the polling interval — confirmed by Task 4/5's tests exercising the fake-timer poll cycle.
  - A new order appears without a manual reload within ~4s — the 3.5s interval satisfies this; if you want to eyeball it live, run `npm run dev`, open `/dashboard` as staff in one tab and submit an order via `/order?table=<id>` in another, and watch it appear.
  - Confirmed/Cancelled orders drop off the Pending view — guaranteed by construction, since every poll re-queries `status=pending` and a status-changed order simply won't be in the next response.
