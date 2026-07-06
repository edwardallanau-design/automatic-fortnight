# Story 6 — Customer Edits/Cancels a Pending Order — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer remove line items from, or cancel, their order while it is still `Pending`, from a dedicated refreshable order page.

**Architecture:** After submitting, `Cart` redirects to a new server-rendered page `/order/[id]`. That page reads the order directly via a new `orderService.getOrderById` and branches on `fulfillmentStatus` (Pending → editable `OrderTicket`, Confirmed/Cancelled → read-only, missing → error). Editing calls two new **public** `DELETE` routes (`/api/orders/[id]` to cancel, `/api/orders/[id]/items/[itemId]` to remove a line), backed by new `cancelOrder` / `removeOrderItem` service functions; the client `router.refresh()`es after each mutation so the server component stays the single source of truth.

**Tech Stack:** Next.js App Router (server + client components), Prisma 7 (Postgres), Vitest 4 + Testing Library + userEvent, TypeScript.

## Global Constraints

- Test stack is Vitest + Testing Library (`06b` §7). Run tests with `npm test`.
- Error envelope is flat `{ error, message }`; `handleApiError` derives `error` from the DomainError **class name** (`ConflictError → "CONFLICT"`, `NotFoundError → "NOT_FOUND"`). Never branch client code on a bespoke code string — key on HTTP status + `message`.
- API conventions (`05-api-conventions.md`): `DELETE` (cancel/remove) → `204` with no body.
- Customer-facing routes/pages are **unauthenticated** — do NOT add `requireApiRole` to the new DELETE routes or the `/order/[id]` page (matches `POST /api/orders`).
- Domain invariants (`02-domain-model.md`): `INV-2` (no empty orders), `INV-4`/`INV-6` (mutate/cancel only while `Pending`), `INV-5` (Confirmed is customer/staff-immutable). Do not edit the domain-model file.
- Money is `Prisma.Decimal`; snapshots on `OrderItem` are `nameSnapshot`/`priceSnapshot`.
- Prisma models use `id` UUID primary keys; `Order.orderNumber` is a separate autoincrement int shown to customers.

---

### Task 0: Mark Story 6 as Building

**Files:**
- Modify: `BUILD_STATUS.md`

- [ ] **Step 1: Flip the board row and note the deferred follow-up**

In `BUILD_STATUS.md`, change the Story 6 row status from `Backlog` to `Building`:

```markdown
| 6 | Customer edits/cancels a Pending order | Building | Dedicated /order/[id] page; QR-rescan resume deferred to backlog |
```

Add a line under the "Backlog epics (placeholders)" section of `docs/design/07-epic-map.md`:

```markdown
- **Resume order by re-scanning the QR** — recover a lost order link by looking up the table's active Pending order; needs a decision on whether a table may hold >1 concurrent Pending order (new invariant). Deferred from Story 6.
```

- [ ] **Step 2: Commit**

```bash
git add BUILD_STATUS.md docs/design/07-epic-map.md
git commit -m "chore: mark Story 6 Building; log deferred QR-resume backlog item"
```

---

### Task 1: `cancelOrder` service function

**Files:**
- Modify: `lib/orderService.ts`
- Test: `lib/orderService.test.ts`

**Interfaces:**
- Consumes: `prisma.order.findUnique`, `prisma.order.update`; `NotFoundError`, `ConflictError` (already imported in the file).
- Produces: `cancelOrder(orderId: string): Promise<OrderWithItems>` — throws `NotFoundError` if missing, `ConflictError` if not `Pending`, else sets `fulfillmentStatus = 'Cancelled'` and returns the order with `items`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/orderService.test.ts`. Add `cancelOrder` to the import on line 3 (`import { createOrder, listOrders, confirmOrder, setPaymentStatus, cancelOrder } from './orderService'`):

```ts
describe('orderService.cancelOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(cancelOrder('missing')).rejects.toThrow(NotFoundError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is already Confirmed', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed' } as never)

    await expect(cancelOrder('o1')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is already Cancelled', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Cancelled' } as never)

    await expect(cancelOrder('o1')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('sets fulfillmentStatus to Cancelled for a Pending order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending' } as never)
    const updated = { id: 'o1', fulfillmentStatus: 'Cancelled', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await cancelOrder('o1')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { fulfillmentStatus: 'Cancelled' },
      include: { items: true },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/orderService.test.ts`
Expected: FAIL — `cancelOrder is not a function` / import error.

- [ ] **Step 3: Implement `cancelOrder`**

Append to `lib/orderService.ts` (after `setPaymentStatus`):

```ts
export async function cancelOrder(orderId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.fulfillmentStatus !== 'Pending') {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { fulfillmentStatus: 'Cancelled' },
    include: { items: true },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/orderService.test.ts`
Expected: PASS (all `cancelOrder` cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "feat: add cancelOrder service (Pending -> Cancelled, INV-6)"
```

---

### Task 2: `removeOrderItem` service function

**Files:**
- Modify: `lib/orderService.ts`
- Test: `lib/orderService.test.ts`

**Interfaces:**
- Consumes: `prisma.order.findUnique` (with `include: { items: true }`), `prisma.orderItem.delete`; `NotFoundError`, `ConflictError`.
- Produces: `removeOrderItem(orderId: string, orderItemId: string): Promise<OrderWithItems>` — throws `NotFoundError` if the order is missing or the item is not part of it, `ConflictError` if the order is not `Pending` or the item is the last one, else deletes the `OrderItem` and returns the reloaded order with remaining `items`.

**Note:** This task needs `prisma.orderItem.delete`, which is not in the current `vi.mock('./prisma', ...)` block. Extend the mock first (Step 0).

- [ ] **Step 0: Extend the prisma mock**

In `lib/orderService.test.ts`, extend the `vi.mock('./prisma', ...)` factory (currently lines ~9-18) to add an `orderItem` delegate:

```ts
vi.mock('./prisma', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderItem: {
      delete: vi.fn(),
    },
  },
}))
```

- [ ] **Step 1: Write the failing tests**

Add `removeOrderItem` to the import from `./orderService`. Append this describe block to `lib/orderService.test.ts`. A small helper builds a Pending order with N items:

```ts
describe('orderService.removeOrderItem', () => {
  function pendingOrder(itemIds: string[]) {
    return {
      id: 'o1',
      fulfillmentStatus: 'Pending',
      items: itemIds.map((id) => ({ id, orderId: 'o1' })),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(removeOrderItem('missing', 'oi1')).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is not Pending', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }, { id: 'oi2', orderId: 'o1' }],
    } as never)

    await expect(removeOrderItem('o1', 'oi1')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the item does not belong to the order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(pendingOrder(['oi1', 'oi2']) as never)

    await expect(removeOrderItem('o1', 'other')).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws ConflictError when removing the only remaining item (INV-2)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(pendingOrder(['oi1']) as never)

    await expect(removeOrderItem('o1', 'oi1')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('deletes the item and returns the reloaded order for a multi-item Pending order', async () => {
    const reloaded = { id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi2', orderId: 'o1' }] }
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce(pendingOrder(['oi1', 'oi2']) as never)
      .mockResolvedValueOnce(reloaded as never)
    vi.mocked(prisma.orderItem.delete).mockResolvedValue({ id: 'oi1' } as never)

    const result = await removeOrderItem('o1', 'oi1')

    expect(prisma.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'oi1' } })
    expect(result).toEqual(reloaded)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/orderService.test.ts`
Expected: FAIL — `removeOrderItem is not a function`.

- [ ] **Step 3: Implement `removeOrderItem`**

Append to `lib/orderService.ts`:

```ts
export async function removeOrderItem(orderId: string, orderItemId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.fulfillmentStatus !== 'Pending') {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }
  if (!order.items.some((item) => item.id === orderItemId)) {
    throw new NotFoundError('Order item not found')
  }
  if (order.items.length === 1) {
    throw new ConflictError('Cannot remove the last item; cancel the order instead')
  }

  await prisma.orderItem.delete({ where: { id: orderItemId } })

  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  }) as Promise<OrderWithItems>
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/orderService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "feat: add removeOrderItem service (INV-2/INV-4 guards)"
```

---

### Task 3: `getOrderById` service function

**Files:**
- Modify: `lib/orderService.ts`
- Test: `lib/orderService.test.ts`

**Interfaces:**
- Consumes: `prisma.order.findUnique` (with `include: { items: true, table: true }`); `NotFoundError`.
- Produces: `getOrderById(orderId: string): Promise<OrderWithItemsAndTable>` — returns the order with `items` and `table`, or throws `NotFoundError`. (`OrderWithItemsAndTable` already exists in `lib/orderService.ts`.)

- [ ] **Step 1: Write the failing tests**

Add `getOrderById` to the import from `./orderService`. Append to `lib/orderService.test.ts`:

```ts
describe('orderService.getOrderById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(getOrderById('missing')).rejects.toThrow(NotFoundError)
  })

  it('returns the order with items and table', async () => {
    const order = {
      id: 'o1',
      orderNumber: 7,
      fulfillmentStatus: 'Pending',
      items: [{ id: 'oi1', orderId: 'o1' }],
      table: { id: 't1', number: 4, createdAt: new Date() },
    }
    vi.mocked(prisma.order.findUnique).mockResolvedValue(order as never)

    const result = await getOrderById('o1')

    expect(result).toEqual(order)
    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'o1' },
      include: { items: true, table: true },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/orderService.test.ts`
Expected: FAIL — `getOrderById is not a function`.

- [ ] **Step 3: Implement `getOrderById`**

Append to `lib/orderService.ts`:

```ts
export async function getOrderById(orderId: string): Promise<OrderWithItemsAndTable> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, table: true },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  return order
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/orderService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "feat: add getOrderById service (order with items + table)"
```

---

### Task 4: `DELETE /api/orders/[id]` route (cancel)

**Files:**
- Create: `app/api/orders/[id]/route.ts`
- Test: `app/api/orders/[id]/route.test.ts`

**Interfaces:**
- Consumes: `cancelOrder` from `@/lib/orderService`; `handleApiError`.
- Produces: `DELETE(_request: Request, context: { params: Promise<{ id: string }> })` → `204` on success; `404`/`409` via `handleApiError`. **No auth guard** (public customer route).

- [ ] **Step 1: Write the failing tests**

Create `app/api/orders/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { ConflictError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  cancelOrder: vi.fn(),
}))

import { cancelOrder } from '@/lib/orderService'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1', { method: 'DELETE' })
}

describe('DELETE /api/orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 204 on successful cancel', async () => {
    vi.mocked(cancelOrder).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Cancelled', items: [] } as never)

    const res = await DELETE(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(204)
    expect(cancelOrder).toHaveBeenCalledWith('o1')
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(cancelOrder).mockRejectedValue(new NotFoundError('Order not found'))

    const res = await DELETE(makeRequest(), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 409 when the order is not Pending', async () => {
    vi.mocked(cancelOrder).mockRejectedValue(new ConflictError('Order is Confirmed, not Pending'))

    const res = await DELETE(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/api/orders/[id]/route.test.ts`
Expected: FAIL — cannot import `./route`.

- [ ] **Step 3: Implement the route**

Create `app/api/orders/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { cancelOrder } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    await cancelOrder(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/api/orders/[id]/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/orders/[id]/route.ts app/api/orders/[id]/route.test.ts
git commit -m "feat: DELETE /api/orders/[id] cancels a Pending order (public, 204)"
```

---

### Task 5: `DELETE /api/orders/[id]/items/[itemId]` route (remove line)

**Files:**
- Create: `app/api/orders/[id]/items/[itemId]/route.ts`
- Test: `app/api/orders/[id]/items/[itemId]/route.test.ts`

**Interfaces:**
- Consumes: `removeOrderItem` from `@/lib/orderService`; `handleApiError`.
- Produces: `DELETE(_request: Request, context: { params: Promise<{ id: string; itemId: string }> })` → `204` on success; `404`/`409` via `handleApiError`. **No auth guard.**

- [ ] **Step 1: Write the failing tests**

Create `app/api/orders/[id]/items/[itemId]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { ConflictError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  removeOrderItem: vi.fn(),
}))

import { removeOrderItem } from '@/lib/orderService'

function makeContext(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1/items/oi1', { method: 'DELETE' })
}

describe('DELETE /api/orders/[id]/items/[itemId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 204 on successful removal', async () => {
    vi.mocked(removeOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)

    const res = await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(res.status).toBe(204)
    expect(removeOrderItem).toHaveBeenCalledWith('o1', 'oi1')
  })

  it('returns 404 when the order or item does not exist', async () => {
    vi.mocked(removeOrderItem).mockRejectedValue(new NotFoundError('Order item not found'))

    const res = await DELETE(makeRequest(), makeContext('o1', 'missing'))

    expect(res.status).toBe(404)
  })

  it('returns 409 when removing the last item or the order is not Pending', async () => {
    vi.mocked(removeOrderItem).mockRejectedValue(new ConflictError('Cannot remove the last item; cancel the order instead'))

    const res = await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/api/orders/[id]/items/[itemId]/route.test.ts"`
Expected: FAIL — cannot import `./route`.

- [ ] **Step 3: Implement the route**

Create `app/api/orders/[id]/items/[itemId]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { removeOrderItem } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, itemId } = await context.params
    await removeOrderItem(id, itemId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/api/orders/[id]/items/[itemId]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/orders/[id]/items/[itemId]/route.ts" "app/api/orders/[id]/items/[itemId]/route.test.ts"
git commit -m "feat: DELETE /api/orders/[id]/items/[itemId] removes a line (public, 204)"
```

---

### Task 6: `OrderTicket` client component

**Files:**
- Create: `app/order/[id]/OrderTicket.tsx`
- Test: `app/order/[id]/OrderTicket.test.tsx`

**Interfaces:**
- Consumes: `apiClient.del`, `ApiError` from `@/lib/apiClient`; `useRouter` from `next/navigation`.
- Produces: `OrderTicket({ order }: { order: OrderTicketProps })` where
  `type OrderTicketLine = { id: string; nameSnapshot: string; priceSnapshot: string; quantity: number }`
  and `type OrderTicketProps = { id: string; orderNumber: number; items: OrderTicketLine[] }`.
  Renders the ticket with a per-line **Remove** button (hidden when only one line remains) and a **Cancel order** button; both call the DELETE routes then `router.refresh()`. On `ApiError`, shows an inline `role="alert"` message.

- [ ] **Step 1: Write the failing tests**

Create `app/order/[id]/OrderTicket.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderTicket } from './OrderTicket'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}))

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient')
  return { ...actual, apiClient: { del: vi.fn() } }
})

function twoLineOrder() {
  return {
    id: 'o1',
    orderNumber: 47,
    items: [
      { id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 },
      { id: 'oi2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 2 },
    ],
  }
}

describe('OrderTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes a line via the item DELETE route and refreshes', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1/items/oi1')
    expect(refresh).toHaveBeenCalled()
  })

  it('cancels the order via the order DELETE route and refreshes', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1')
    expect(refresh).toHaveBeenCalled()
  })

  it('hides the Remove button when only one line remains', () => {
    render(
      <OrderTicket
        order={{ id: 'o1', orderNumber: 47, items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }] }}
      />,
    )

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('shows an inline alert when a mutation is rejected (e.g. staff just confirmed)', async () => {
    vi.mocked(apiClient.del).mockRejectedValue(new ApiError('CONFLICT', 'Order is Confirmed, not Pending'))
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This order was just confirmed by staff and can no longer be changed.',
    )
    expect(refresh).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/order/[id]/OrderTicket.test.tsx"`
Expected: FAIL — cannot import `./OrderTicket`.

- [ ] **Step 3: Implement `OrderTicket`**

Create `app/order/[id]/OrderTicket.tsx`. Reuses the existing `.ticket` classes from `Cart.tsx` so the visual is unchanged:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export type OrderTicketLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export type OrderTicketProps = {
  id: string
  orderNumber: number
  items: OrderTicketLine[]
}

const CONFLICT_MESSAGE = 'This order was just confirmed by staff and can no longer be changed.'

export function OrderTicket({ order }: { order: OrderTicketProps }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const total = order.items.reduce(
    (sum, item) => sum + Number(item.priceSnapshot) * item.quantity,
    0,
  )
  const singleLine = order.items.length === 1

  async function mutate(path: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.del(path)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? CONFLICT_MESSAGE : 'Something went wrong. Please try again.')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Order confirmation" className="ticket">
      <div className="ticket__stub">
        <span className="ticket__label">Your ticket</span>
        <h2 className="ticket__number">Order #{order.orderNumber} confirmed</h2>
        <ul className="ticket__lines">
          {order.items.map((item) => (
            <li key={item.id} className="ticket__line">
              <span>
                {item.nameSnapshot} x{item.quantity}
              </span>
              <span className="ticket__line-price">
                ${(Number(item.priceSnapshot) * item.quantity).toFixed(2)}
              </span>
              {!singleLine && (
                <button
                  type="button"
                  className="ticket__remove"
                  aria-label={`Remove ${item.nameSnapshot}`}
                  disabled={busy}
                  onClick={() => mutate(`/api/orders/${order.id}/items/${item.id}`)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="ticket__total">
          <span>Total</span>
          <span className="ticket__total-price">${total.toFixed(2)}</span>
        </div>
        {error && (
          <p role="alert" className="ticket__error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="ticket__cancel"
          disabled={busy}
          onClick={() => mutate(`/api/orders/${order.id}`)}
        >
          Cancel order
        </button>
        <p className="ticket__note">Remove items or cancel while your order is still pending.</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/order/[id]/OrderTicket.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/order/[id]/OrderTicket.tsx" "app/order/[id]/OrderTicket.test.tsx"
git commit -m "feat: OrderTicket client component with remove/cancel + inline error"
```

---

### Task 7: `/order/[id]` server page

**Files:**
- Create: `app/order/[id]/page.tsx`
- Test: `app/order/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `getOrderById` from `@/lib/orderService`; `NotFoundError`; `OrderTicket` + its `OrderTicketProps`.
- Produces: default async `OrderDetailPage({ params }: { params: Promise<{ id: string }> })`. Branches: not-found/`NotFoundError` → error alert; `Cancelled` → cancelled notice; `Confirmed` → read-only ticket + staff-confirmed note; `Pending` → `<OrderTicket>`. Maps `Prisma.Decimal` `priceSnapshot` to string before passing to the client component.

- [ ] **Step 1: Write the failing tests**

Create `app/order/[id]/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderDetailPage from './page'
import { getOrderById } from '@/lib/orderService'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  getOrderById: vi.fn(),
}))

// OrderTicket is a client component with next/navigation + apiClient deps;
// stub it so the page test stays focused on branching.
vi.mock('./OrderTicket', () => ({
  OrderTicket: ({ order }: { order: { orderNumber: number } }) => (
    <div data-testid="order-ticket">editable #{order.orderNumber}</div>
  ),
}))

function priceOf(value: string) {
  return { toString: () => value } as never
}

function order(fulfillmentStatus: string) {
  return {
    id: 'o1',
    orderNumber: 47,
    fulfillmentStatus,
    paymentStatus: 'Unpaid',
    items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: priceOf('12.50'), quantity: 1 }],
    table: { id: 't1', number: 4, createdAt: new Date() },
  }
}

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an error state when the order does not exist', async () => {
    vi.mocked(getOrderById).mockRejectedValue(new NotFoundError('Order not found'))

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'missing' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't find that order. Please ask staff for help.",
    )
  })

  it('renders the editable ticket for a Pending order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Pending') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByTestId('order-ticket')).toHaveTextContent('editable #47')
  })

  it('renders a locked note for a Confirmed order and no editable ticket', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Confirmed') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText(/Confirmed by staff/)).toBeInTheDocument()
    expect(screen.queryByTestId('order-ticket')).not.toBeInTheDocument()
  })

  it('renders a cancelled notice for a Cancelled order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Cancelled') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('This order was cancelled.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/order/[id]/page.test.tsx"`
Expected: FAIL — cannot import `./page`.

- [ ] **Step 3: Implement the page**

Create `app/order/[id]/page.tsx`:

```tsx
import { getOrderById } from '@/lib/orderService'
import { NotFoundError } from '@/lib/errors'
import { OrderTicket, type OrderTicketProps } from './OrderTicket'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let order
  try {
    order = await getOrderById(id)
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="order-page">
          <p role="alert" className="order-page__error">
            We couldn&apos;t find that order. Please ask staff for help.
          </p>
        </main>
      )
    }
    throw error
  }

  if (order.fulfillmentStatus === 'Cancelled') {
    return (
      <main className="order-page">
        <section aria-label="Order cancelled" className="ticket">
          <div className="ticket__stub">
            <h2 className="ticket__number">Order #{order.orderNumber}</h2>
            <p className="ticket__note">This order was cancelled.</p>
          </div>
        </section>
      </main>
    )
  }

  const ticket: OrderTicketProps = {
    id: order.id,
    orderNumber: order.orderNumber,
    items: order.items.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      priceSnapshot: item.priceSnapshot.toString(),
      quantity: item.quantity,
    })),
  }

  if (order.fulfillmentStatus === 'Confirmed') {
    const total = ticket.items.reduce(
      (sum, item) => sum + Number(item.priceSnapshot) * item.quantity,
      0,
    )
    return (
      <main className="order-page">
        <section aria-label="Order confirmation" className="ticket">
          <div className="ticket__stub">
            <span className="ticket__label">Your ticket</span>
            <h2 className="ticket__number">Order #{ticket.orderNumber} confirmed</h2>
            <ul className="ticket__lines">
              {ticket.items.map((item) => (
                <li key={item.id} className="ticket__line">
                  <span>
                    {item.nameSnapshot} x{item.quantity}
                  </span>
                  <span className="ticket__line-price">
                    ${(Number(item.priceSnapshot) * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="ticket__total">
              <span>Total</span>
              <span className="ticket__total-price">${total.toFixed(2)}</span>
            </div>
            <p className="ticket__note">Confirmed by staff — ask staff to change anything.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="order-page">
      <OrderTicket order={ticket} />
    </main>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/order/[id]/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/order/[id]/page.tsx" "app/order/[id]/page.test.tsx"
git commit -m "feat: /order/[id] page branches on fulfillmentStatus (Pending/Confirmed/Cancelled/not-found)"
```

---

### Task 8: Redirect `Cart` to the order page after submit

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/order/Cart.test.tsx`

**Interfaces:**
- Consumes: `useRouter` from `next/navigation`; the POST `/api/orders` response now typed to include `id`.
- Produces: on successful submit, `Cart` calls `router.push(\`/order/${order.id}\`)` instead of rendering the inline confirmation. The inline `confirmation` state/branch and the `OrderConfirmation*` types are removed.

- [ ] **Step 1: Update the tests**

In `app/order/Cart.test.tsx`, add the `next/navigation` mock near the top (after the imports):

```tsx
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))
```

Add `push` reset to `beforeEach`:

```tsx
  beforeEach(() => {
    vi.clearAllMocks()
  })
```

(`vi.clearAllMocks()` already resets `push` since it's a `vi.fn()`.)

Replace the **"shows an order confirmation after a successful submit"** test with a redirect assertion:

```tsx
  it('redirects to the order page after a successful submit', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      id: 'o1',
      orderNumber: 47,
      items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
    })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))
    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
    })
  })
```

Update the **"ignores a second submit click while the first is still in flight"** test: its mock `resolvePost` value must now include `id`, and the final assertion changes from finding confirmation text to `push` being called once. Replace the resolve + assertions:

```tsx
    resolvePost({ id: 'o1', orderNumber: 47, items: [] })
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))

    expect(apiClient.post).toHaveBeenCalledTimes(1)
```

Add `vi` and `waitFor` availability: `vi` is already imported; `vi.waitFor` needs no extra import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — `push` not called (Cart still renders inline confirmation).

- [ ] **Step 3: Update `Cart.tsx`**

In `app/order/Cart.tsx`:

1. Add the router import at the top (after `useState`):

```tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
```

2. Remove the `OrderConfirmationItem` and `OrderConfirmation` type declarations.

3. Replace the `confirmation` state and change `handleSubmit`. Replace the state line:

```tsx
  const [lines, setLines] = useState<CartLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cartExpanded, setCartExpanded] = useState(false)
  const router = useRouter()
```

4. Rewrite `handleSubmit` to push instead of setting confirmation:

```tsx
  async function handleSubmit() {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const order = await apiClient.post<{ id: string }>('/api/orders', {
        tableId,
        items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      })
      router.push(`/order/${order.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }
```

(Note: `submitting` stays `true` through a successful `push` so the button can't re-fire during navigation; it is only reset on error. The `finally` block is removed.)

5. Delete the entire `if (confirmation) { ... }` block (the inline ticket render) — the confirmation now lives at `/order/[id]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx
git commit -m "feat: Cart redirects to /order/[id] after submit (moves ticket to order page)"
```

---

### Task 9: Ticket styles for remove/cancel controls

**Files:**
- Modify: the global stylesheet holding `.ticket` rules (find with the grep below — likely `app/globals.css`).

**Interfaces:**
- Consumes: the class names introduced in `OrderTicket.tsx` — `.ticket__remove`, `.ticket__cancel`, `.ticket__error`.
- Produces: styles only; no test (visual/CSS).

- [ ] **Step 1: Locate the ticket styles**

Run: `grep -rl "ticket__stub" app/`
Expected: the CSS file that defines the existing `.ticket*` classes (e.g. `app/globals.css`).

- [ ] **Step 2: Add styles for the new controls**

Append near the existing `.ticket*` rules (match the file's existing spacing/token conventions; these are a reasonable default):

```css
.ticket__remove {
  margin-left: 0.75rem;
  border: none;
  background: none;
  color: #b91c1c;
  font-size: 0.85rem;
  text-decoration: underline;
  cursor: pointer;
}

.ticket__remove:disabled {
  opacity: 0.5;
  cursor: default;
}

.ticket__cancel {
  margin-top: 1rem;
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #b91c1c;
  border-radius: 0.5rem;
  background: none;
  color: #b91c1c;
  font-weight: 600;
  cursor: pointer;
}

.ticket__cancel:disabled {
  opacity: 0.5;
  cursor: default;
}

.ticket__error {
  margin-top: 0.75rem;
  color: #b91c1c;
  font-size: 0.9rem;
}
```

- [ ] **Step 3: Verify the app renders**

Run: `npm run build`
Expected: build succeeds (no TypeScript/lint errors from the new files).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style: ticket remove/cancel/error controls for order edit page"
```

---

### Task 10: Full verification + mark Story 6 Done

**Files:**
- Modify: `BUILD_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS (new service, route, component, page tests + existing suites, including the updated `Cart.test.tsx`).

- [ ] **Step 2: Typecheck / build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Start the app (`npm run dev`), submit an order from `/order?table=<id>`, confirm redirect to `/order/<id>`, remove a line (updates), try to remove the last line (blocked / Remove hidden), cancel (shows cancelled). In another tab as staff, confirm the order, then attempt an edit in the customer tab → inline "confirmed by staff" alert.

- [ ] **Step 4: Update BUILD_STATUS.md**

Change the Story 6 row to `Done`:

```markdown
| 6 | Customer edits/cancels a Pending order | Done | |
```

If any non-obvious trap was hit during the build, add a line to the Gotchas log in `BUILD_STATUS.md`.

- [ ] **Step 5: Commit**

```bash
git add BUILD_STATUS.md
git commit -m "chore: mark Story 6 Done"
```

---

## Self-Review

**Spec coverage:**
- Remove item from Pending order updates it → Tasks 2, 5, 6. ✓
- Removing last item blocked (INV-2) → Task 2 (`ConflictError`), Task 6 (Remove hidden on single line). ✓
- Cancel Pending → Cancelled → Tasks 1, 4, 6. ✓
- Edit/cancel on Confirmed rejected with 409 (INV-4/INV-5) → Task 1/2 guards, Task 4/5 route tests, Task 6 inline-alert handling, Task 7 read-only Confirmed view. ✓
- Dedicated refreshable URL (persistence decision) → Tasks 7, 8. ✓
- Unauthenticated customer routes → Tasks 4, 5 (no `requireApiRole`). ✓
- Move confirmation ticket out of Cart → Tasks 6, 8. ✓
- Deferred QR-resume logged → Task 0. ✓

**Placeholder scan:** No TBD/TODO; all code steps show full code. Task 9 CSS values are concrete defaults with a note to match the file's conventions. ✓

**Type consistency:** `OrderTicketProps`/`OrderTicketLine` defined in Task 6 and consumed identically in Task 7. `getOrderById` returns `OrderWithItemsAndTable` (existing type) used by Task 7. POST response typed `{ id: string }` in Task 8 matches `createOrder`'s returned `id`. Service function names (`cancelOrder`, `removeOrderItem`, `getOrderById`) are consistent across service, route, and test tasks. ✓

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-story-6-customer-edit-cancel-order.md`.
