# Staff/Admin Order Edits & Dashboard Back-Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin add/remove/adjust-quantity items on a Confirmed order (`INV-5`'s documented exception), let staff do the same plus Cancel on a still-Pending order via the dashboard, and add a "← Dashboard" back-link to every staff/admin screen that's missing one.

**Architecture:** One shared service-layer gate (`assertOrderEditable`) parameterized by `fulfillmentStatus` + an optional `actorRole`, backing three order-item service functions (`removeOrderItem` extended, `addOrderItem` and `updateOrderItemQuantity` new) and their API routes. One shared dashboard component (`OrderItemsEditor`) renders the add/remove/quantity controls inside `OrderDetailModal`, gated by the same status×role rule the service enforces server-side. `ConfirmDialog` is promoted from `app/order/[id]/` to `app/components/` since both the customer page and the dashboard now need it.

**Tech Stack:** Next.js API routes, Prisma, Vitest + React Testing Library — matching the repo's existing conventions exactly (see `lib/orderService.ts`, `app/dashboard/OrderDetailModal.tsx`, `app/order/[id]/OrderTicket.tsx` for precedent).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-09-staff-admin-order-edits-design.md` — follow its Decisions 1-6 exactly.
- `app/order/[id]/OrderTicket.tsx` and its API-calling behavior for the customer stay unchanged (remove-only + cancel, no add/quantity UI).
- No `INV-*` invariant changes. `INV-5`'s exception is being implemented, not altered. `INV-2` (no empty orders) and `INV-6` (cancel only while Pending) remain hard floors for every caller, including admin.
- Every new/changed API route keeps its existing response shape for pre-existing callers (`DELETE` routes still return `204`; existing `removeOrderItem`/`cancelOrder` 2-arg call sites keep working since the new param is optional).
- Error envelope stays `{ error, message }` per `05-api-conventions.md` — no new error shape.
- Per `06b-engineering-decisions.md` §7: Vitest for service/API logic, RTL for components, no new Playwright script needed.

---

### Task 1: `removeOrderItem` — admin-on-Confirmed exception

**Files:**
- Modify: `lib/orderService.ts:1-6` (imports), `lib/orderService.ts:122-146` (`removeOrderItem`)
- Test: `lib/orderService.test.ts:353-410` (`describe('orderService.removeOrderItem'`)

**Interfaces:**
- Produces: `assertOrderEditable(order: { fulfillmentStatus: FulfillmentStatus }, actorRole?: Role): void` (throws `ConflictError`) — private helper, reused by Tasks 2 and 3.
- Produces: `removeOrderItem(orderId: string, orderItemId: string, actorRole?: Role): Promise<OrderWithItems>` — third param is new and optional; existing 2-arg callers are unaffected.

- [ ] **Step 1: Write the failing tests**

Add to `lib/orderService.test.ts` inside `describe('orderService.removeOrderItem', ...)`, after the existing `'deletes the item and returns the reloaded order...'` test:

```ts
  it('allows an admin to remove an item from a Confirmed order', async () => {
    const confirmed = {
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }, { id: 'oi2', orderId: 'o1' }],
    }
    const reloaded = { id: 'o1', fulfillmentStatus: 'Confirmed', items: [{ id: 'oi2', orderId: 'o1' }] }
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce(confirmed as never)
      .mockResolvedValueOnce(reloaded as never)
    vi.mocked(prisma.orderItem.delete).mockResolvedValue({ id: 'oi1' } as never)

    const result = await removeOrderItem('o1', 'oi1', 'admin')

    expect(prisma.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'oi1' } })
    expect(result).toEqual(reloaded)
  })

  it('throws ConflictError when a non-admin actor removes an item from a Confirmed order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }, { id: 'oi2', orderId: 'o1' }],
    } as never)

    await expect(removeOrderItem('o1', 'oi1', 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('blocks removing the last item from a Confirmed order even for an admin (INV-2)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }],
    } as never)

    await expect(removeOrderItem('o1', 'oi1', 'admin')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/orderService.test.ts -t "removeOrderItem"`
Expected: the 3 new tests FAIL (the first two because `removeOrderItem` doesn't accept/honor a third argument yet — the admin one throws `ConflictError` when it shouldn't; the "blocks removing the last item" one currently passes already, which is fine, it's a regression guard for the next step).

- [ ] **Step 3: Implement `assertOrderEditable` and extend `removeOrderItem`**

In `lib/orderService.ts`, change the import line to include `Role`:

```ts
import type { Order, OrderItem, Table, FulfillmentStatus, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getTableOrThrow } from './tableService'
import { findMenuItemsByIds } from './menuService'
import { NotFoundError, ConflictError, ValidationError } from './errors'
import type { Role } from './types'
```

Add this helper directly above `removeOrderItem`:

```ts
function assertOrderEditable(order: { fulfillmentStatus: FulfillmentStatus }, actorRole?: Role): void {
  const adminOverride = order.fulfillmentStatus === 'Confirmed' && actorRole === 'admin'
  if (order.fulfillmentStatus !== 'Pending' && !adminOverride) {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }
}
```

Replace the body of `removeOrderItem`:

```ts
export async function removeOrderItem(
  orderId: string,
  orderItemId: string,
  actorRole?: Role,
): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  assertOrderEditable(order, actorRole)
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

Run: `npx vitest run lib/orderService.test.ts -t "removeOrderItem"`
Expected: all `removeOrderItem` tests PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "Allow admin to remove items from a Confirmed order (INV-5)"
```

---

### Task 2: `addOrderItem` service function

**Files:**
- Modify: `lib/orderService.ts` (new exported function, after `removeOrderItem`)
- Test: `lib/orderService.test.ts` (new `describe('orderService.addOrderItem', ...)` block; extend the `vi.mock('./prisma', ...)` at the top)

**Interfaces:**
- Consumes: `assertOrderEditable` from Task 1, `findMenuItemsByIds` from `./menuService` (already imported).
- Produces: `addOrderItem(orderId: string, menuItemId: string, quantity: number, actorRole?: Role): Promise<OrderWithItems>` — increments an existing line's quantity if the menu item is already on the order, otherwise creates a new snapshotted line.

- [ ] **Step 1: Write the failing tests**

Extend the `vi.mock('./prisma', ...)` block at the top of `lib/orderService.test.ts` to add `create` and `update` to `orderItem`:

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
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))
```

Add a new `import { addOrderItem } from './orderService'` to the existing import line at the top (extend the destructured import list). Then add this new `describe` block at the end of the file, after `describe('orderService.getOrderById', ...)`:

```ts
describe('orderService.addOrderItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws ValidationError for a non-positive-integer quantity', async () => {
    await expect(addOrderItem('o1', 'm1', 0)).rejects.toThrow(ValidationError)
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(addOrderItem('missing', 'm1', 1)).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the order is Confirmed and the actor is not admin', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [],
    } as never)

    await expect(addOrderItem('o1', 'm1', 1, 'staff')).rejects.toThrow(ConflictError)
  })

  it('throws NotFoundError when the menu item does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([])

    await expect(addOrderItem('o1', 'missing', 1)).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the menu item is sold out', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Fries', price: new Prisma.Decimal('4.00'), available: false, archived: false, createdAt: new Date() },
    ] as never)

    await expect(addOrderItem('o1', 'm1', 1)).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.create).not.toHaveBeenCalled()
  })

  it('creates a new line with a snapshot when the item is not already on the order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)
      .mockResolvedValueOnce({
        id: 'o1',
        fulfillmentStatus: 'Pending',
        items: [{ id: 'oi1', menuItemId: 'm1', quantity: 2 }],
      } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() },
    ] as never)

    const result = await addOrderItem('o1', 'm1', 2)

    expect(prisma.orderItem.create).toHaveBeenCalledWith({
      data: { orderId: 'o1', menuItemId: 'm1', quantity: 2, nameSnapshot: 'Burger', priceSnapshot: new Prisma.Decimal('12.50') },
    })
    expect(result).toEqual({
      id: 'o1',
      fulfillmentStatus: 'Pending',
      items: [{ id: 'oi1', menuItemId: 'm1', quantity: 2 }],
    })
  })

  it('increments the existing line instead of creating a duplicate when the item is already on the order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({
        id: 'o1',
        fulfillmentStatus: 'Pending',
        items: [{ id: 'oi1', menuItemId: 'm1', quantity: 2 }],
      } as never)
      .mockResolvedValueOnce({
        id: 'o1',
        fulfillmentStatus: 'Pending',
        items: [{ id: 'oi1', menuItemId: 'm1', quantity: 3 }],
      } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() },
    ] as never)

    const result = await addOrderItem('o1', 'm1', 1)

    expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: 'oi1' }, data: { quantity: 3 } })
    expect(prisma.orderItem.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: 'o1',
      fulfillmentStatus: 'Pending',
      items: [{ id: 'oi1', menuItemId: 'm1', quantity: 3 }],
    })
  })

  it('allows an admin to add an item to a Confirmed order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [] } as never)
      .mockResolvedValueOnce({
        id: 'o1',
        fulfillmentStatus: 'Confirmed',
        items: [{ id: 'oi1', menuItemId: 'm1', quantity: 1 }],
      } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() },
    ] as never)

    const result = await addOrderItem('o1', 'm1', 1, 'admin')

    expect(prisma.orderItem.create).toHaveBeenCalled()
    expect(result.fulfillmentStatus).toBe('Confirmed')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/orderService.test.ts -t "addOrderItem"`
Expected: FAIL with "addOrderItem is not a function" (or a TypeScript compile error from the missing export).

- [ ] **Step 3: Implement `addOrderItem`**

Add to `lib/orderService.ts`, after `removeOrderItem`:

```ts
export async function addOrderItem(
  orderId: string,
  menuItemId: string,
  quantity: number,
  actorRole?: Role,
): Promise<OrderWithItems> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError('quantity must be a positive integer')
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  assertOrderEditable(order, actorRole)

  const [menuItem] = await findMenuItemsByIds([menuItemId])
  if (!menuItem) {
    throw new NotFoundError('Menu item not found')
  }
  if (!menuItem.available) {
    throw new ConflictError(`${menuItem.name} is no longer available`)
  }

  const existingLine = order.items.find((item) => item.menuItemId === menuItemId)
  if (existingLine) {
    await prisma.orderItem.update({
      where: { id: existingLine.id },
      data: { quantity: existingLine.quantity + quantity },
    })
  } else {
    await prisma.orderItem.create({
      data: {
        orderId,
        menuItemId,
        quantity,
        nameSnapshot: menuItem.name,
        priceSnapshot: menuItem.price,
      },
    })
  }

  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  }) as Promise<OrderWithItems>
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/orderService.test.ts`
Expected: entire file PASSES (all prior tests plus the new `addOrderItem` block).

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "Add addOrderItem service function for staff/admin item editing"
```

---

### Task 3: `updateOrderItemQuantity` service function

**Files:**
- Modify: `lib/orderService.ts` (new exported function, after `addOrderItem`)
- Test: `lib/orderService.test.ts` (new `describe('orderService.updateOrderItemQuantity', ...)` block)

**Interfaces:**
- Consumes: `assertOrderEditable` from Task 1.
- Produces: `updateOrderItemQuantity(orderId: string, orderItemId: string, quantity: number, actorRole?: Role): Promise<OrderWithItems>`.

- [ ] **Step 1: Write the failing tests**

Add `updateOrderItemQuantity` to the destructured import from `./orderService` at the top of `lib/orderService.test.ts`. Add this `describe` block at the end of the file:

```ts
describe('orderService.updateOrderItemQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws ValidationError for a non-positive-integer quantity', async () => {
    await expect(updateOrderItemQuantity('o1', 'oi1', 0)).rejects.toThrow(ValidationError)
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(updateOrderItemQuantity('missing', 'oi1', 2)).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the order is Confirmed and the actor is not admin', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', quantity: 1 }],
    } as never)

    await expect(updateOrderItemQuantity('o1', 'oi1', 2, 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.update).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the item does not belong to the order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Pending',
      items: [{ id: 'oi1', quantity: 1 }],
    } as never)

    await expect(updateOrderItemQuantity('o1', 'other', 2)).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.update).not.toHaveBeenCalled()
  })

  it('updates the quantity for a Pending order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi1', quantity: 1 }] } as never)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi1', quantity: 3 }] } as never)

    const result = await updateOrderItemQuantity('o1', 'oi1', 3)

    expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: 'oi1' }, data: { quantity: 3 } })
    expect(result).toEqual({ id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi1', quantity: 3 }] })
  })

  it('allows an admin to update quantity on a Confirmed order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [{ id: 'oi1', quantity: 1 }] } as never)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [{ id: 'oi1', quantity: 2 }] } as never)

    const result = await updateOrderItemQuantity('o1', 'oi1', 2, 'admin')

    expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: 'oi1' }, data: { quantity: 2 } })
    expect(result.items[0].quantity).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/orderService.test.ts -t "updateOrderItemQuantity"`
Expected: FAIL ("updateOrderItemQuantity is not a function").

- [ ] **Step 3: Implement `updateOrderItemQuantity`**

Add to `lib/orderService.ts`, after `addOrderItem`:

```ts
export async function updateOrderItemQuantity(
  orderId: string,
  orderItemId: string,
  quantity: number,
  actorRole?: Role,
): Promise<OrderWithItems> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError('quantity must be a positive integer')
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  assertOrderEditable(order, actorRole)
  if (!order.items.some((item) => item.id === orderItemId)) {
    throw new NotFoundError('Order item not found')
  }

  await prisma.orderItem.update({ where: { id: orderItemId }, data: { quantity } })

  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  }) as Promise<OrderWithItems>
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/orderService.test.ts`
Expected: entire file PASSES.

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "Add updateOrderItemQuantity service function"
```

---

### Task 4: `DELETE /api/orders/:id/items/:itemId` passes the caller's role

**Files:**
- Modify: `app/api/orders/[id]/items/[itemId]/route.ts`
- Test: `app/api/orders/[id]/items/[itemId]/route.test.ts`

**Interfaces:**
- Consumes: `removeOrderItem(orderId, itemId, actorRole?)` from Task 1, `peekSession(): Promise<{ role: Role } | null>` from `lib/authGuard.ts` (already exists, unchanged).

- [ ] **Step 1: Write the failing test**

Replace `app/api/orders/[id]/items/[itemId]/route.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { ConflictError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  removeOrderItem: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  peekSession: vi.fn(),
}))

import { removeOrderItem } from '@/lib/orderService'
import { peekSession } from '@/lib/authGuard'

function makeContext(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1/items/oi1', { method: 'DELETE' })
}

describe('DELETE /api/orders/[id]/items/[itemId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(peekSession).mockResolvedValue(null)
  })

  it('returns 204 on successful removal, passing undefined role for an unauthenticated caller', async () => {
    vi.mocked(removeOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)

    const res = await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(res.status).toBe(204)
    expect(removeOrderItem).toHaveBeenCalledWith('o1', 'oi1', undefined)
  })

  it('passes the session role through to the service call', async () => {
    vi.mocked(peekSession).mockResolvedValue({ role: 'admin' })
    vi.mocked(removeOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [] } as never)

    await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(removeOrderItem).toHaveBeenCalledWith('o1', 'oi1', 'admin')
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/orders/[id]/items/[itemId]/route.test.ts`
Expected: the first two tests FAIL (`removeOrderItem` currently called with only 2 args, so `toHaveBeenCalledWith('o1', 'oi1', undefined)` doesn't match).

- [ ] **Step 3: Update the route handler**

Replace `app/api/orders/[id]/items/[itemId]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { removeOrderItem } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { peekSession } from '@/lib/authGuard'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, itemId } = await context.params
    const session = await peekSession()
    await removeOrderItem(id, itemId, session?.role)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/orders/[id]/items/[itemId]/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/orders/[id]/items/[itemId]/route.ts" "app/api/orders/[id]/items/[itemId]/route.test.ts"
git commit -m "Pass caller role through to removeOrderItem"
```

---

### Task 5: `POST /api/orders/:id/items` (new route)

**Files:**
- Create: `app/api/orders/[id]/items/route.ts`
- Test: `app/api/orders/[id]/items/route.test.ts`

**Interfaces:**
- Consumes: `addOrderItem(orderId, menuItemId, quantity, actorRole?)` from Task 2, `peekSession()` from `lib/authGuard.ts`.

- [ ] **Step 1: Write the failing test**

Create `app/api/orders/[id]/items/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ConflictError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  addOrderItem: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  peekSession: vi.fn(),
}))

import { addOrderItem } from '@/lib/orderService'
import { peekSession } from '@/lib/authGuard'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/o1/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/orders/[id]/items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(peekSession).mockResolvedValue(null)
  })

  it('returns 201 with the updated order on success', async () => {
    vi.mocked(addOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)

    const res = await POST(makeRequest({ menuItemId: 'm1', quantity: 2 }), makeContext('o1'))

    expect(res.status).toBe(201)
    expect(addOrderItem).toHaveBeenCalledWith('o1', 'm1', 2, undefined)
  })

  it('passes the session role through to the service call', async () => {
    vi.mocked(peekSession).mockResolvedValue({ role: 'admin' })
    vi.mocked(addOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [] } as never)

    await POST(makeRequest({ menuItemId: 'm1', quantity: 1 }), makeContext('o1'))

    expect(addOrderItem).toHaveBeenCalledWith('o1', 'm1', 1, 'admin')
  })

  it('returns 400 when menuItemId is missing', async () => {
    const res = await POST(makeRequest({ quantity: 1 }), makeContext('o1'))

    expect(res.status).toBe(400)
    expect(addOrderItem).not.toHaveBeenCalled()
  })

  it('returns 400 when quantity is not a positive integer', async () => {
    const res = await POST(makeRequest({ menuItemId: 'm1', quantity: 0 }), makeContext('o1'))

    expect(res.status).toBe(400)
    expect(addOrderItem).not.toHaveBeenCalled()
  })

  it('returns 409 when the service rejects the order as not editable', async () => {
    vi.mocked(addOrderItem).mockRejectedValue(new ConflictError('Order is Confirmed, not Pending'))

    const res = await POST(makeRequest({ menuItemId: 'm1', quantity: 1 }), makeContext('o1'))

    expect(res.status).toBe(409)
  })

  it('returns 404 when the menu item does not exist', async () => {
    vi.mocked(addOrderItem).mockRejectedValue(new NotFoundError('Menu item not found'))

    const res = await POST(makeRequest({ menuItemId: 'missing', quantity: 1 }), makeContext('o1'))

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/orders/[id]/items/route.test.ts`
Expected: FAIL (`./route` has no `POST` export / file doesn't exist).

- [ ] **Step 3: Create the route handler**

Create `app/api/orders/[id]/items/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { addOrderItem } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { peekSession } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = await request.json()

    if (typeof body.menuItemId !== 'string' || body.menuItemId.trim() === '') {
      throw new ValidationError('menuItemId is required')
    }
    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new ValidationError('quantity must be a positive integer')
    }

    const session = await peekSession()
    const order = await addOrderItem(id, body.menuItemId, body.quantity, session?.role)
    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/orders/[id]/items/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/orders/[id]/items/route.ts" "app/api/orders/[id]/items/route.test.ts"
git commit -m "Add POST /api/orders/:id/items route"
```

---

### Task 6: `PATCH /api/orders/:id/items/:itemId` (new handler, same file as Task 4)

**Files:**
- Modify: `app/api/orders/[id]/items/[itemId]/route.ts`
- Test: `app/api/orders/[id]/items/[itemId]/route.test.ts`

**Interfaces:**
- Consumes: `updateOrderItemQuantity(orderId, itemId, quantity, actorRole?)` from Task 3.

- [ ] **Step 1: Write the failing tests**

Add `updateOrderItemQuantity` to the mocked `@/lib/orderService` module and its import in `app/api/orders/[id]/items/[itemId]/route.test.ts`:

```ts
vi.mock('@/lib/orderService', () => ({
  removeOrderItem: vi.fn(),
  updateOrderItemQuantity: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  peekSession: vi.fn(),
}))

import { removeOrderItem, updateOrderItemQuantity } from '@/lib/orderService'
import { peekSession } from '@/lib/authGuard'
```

Add a `makePatchRequest` helper and a new `describe` block at the end of the file:

```ts
function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/o1/items/oi1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/orders/[id]/items/[itemId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(peekSession).mockResolvedValue(null)
  })

  it('returns 200 with the updated order on success', async () => {
    vi.mocked(updateOrderItemQuantity).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)

    const res = await PATCH(makePatchRequest({ quantity: 3 }), makeContext('o1', 'oi1'))

    expect(res.status).toBe(200)
    expect(updateOrderItemQuantity).toHaveBeenCalledWith('o1', 'oi1', 3, undefined)
  })

  it('passes the session role through to the service call', async () => {
    vi.mocked(peekSession).mockResolvedValue({ role: 'admin' })
    vi.mocked(updateOrderItemQuantity).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [] } as never)

    await PATCH(makePatchRequest({ quantity: 2 }), makeContext('o1', 'oi1'))

    expect(updateOrderItemQuantity).toHaveBeenCalledWith('o1', 'oi1', 2, 'admin')
  })

  it('returns 400 when quantity is not a positive integer', async () => {
    const res = await PATCH(makePatchRequest({ quantity: 0 }), makeContext('o1', 'oi1'))

    expect(res.status).toBe(400)
    expect(updateOrderItemQuantity).not.toHaveBeenCalled()
  })

  it('returns 409 when the service rejects the order as not editable', async () => {
    vi.mocked(updateOrderItemQuantity).mockRejectedValue(new ConflictError('Order is Confirmed, not Pending'))

    const res = await PATCH(makePatchRequest({ quantity: 2 }), makeContext('o1', 'oi1'))

    expect(res.status).toBe(409)
  })
})
```

Add `PATCH` to the top import: `import { DELETE, PATCH } from './route'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/api/orders/[id]/items/[itemId]/route.test.ts"`
Expected: new tests FAIL (`PATCH` is not exported from `./route`).

- [ ] **Step 3: Add the `PATCH` handler**

Update `app/api/orders/[id]/items/[itemId]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { removeOrderItem, updateOrderItemQuantity } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { peekSession } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, itemId } = await context.params
    const session = await peekSession()
    await removeOrderItem(id, itemId, session?.role)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, itemId } = await context.params
    const body = await request.json()

    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new ValidationError('quantity must be a positive integer')
    }

    const session = await peekSession()
    const order = await updateOrderItemQuantity(id, itemId, body.quantity, session?.role)
    return NextResponse.json(order, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/orders/[id]/items/[itemId]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/orders/[id]/items/[itemId]/route.ts" "app/api/orders/[id]/items/[itemId]/route.test.ts"
git commit -m "Add PATCH /api/orders/:id/items/:itemId route"
```

---

### Task 7: Promote `ConfirmDialog` to `app/components/`

**Files:**
- Create: `app/components/ConfirmDialog.tsx`, `app/components/ConfirmDialog.test.tsx`
- Delete: `app/order/[id]/ConfirmDialog.tsx`, `app/order/[id]/ConfirmDialog.test.tsx`
- Modify: `app/order/[id]/OrderTicket.tsx:7` (import path)

**Interfaces:**
- Produces: `ConfirmDialog` — same props as before (`title, message, confirmLabel, busy, exiting, onConfirm, onClose`), now importable from `@/app/components/ConfirmDialog`. Task 9 and Task 10 (dashboard) will import it from here.

This is a pure move — the component's only import (`@/app/components/Modal`) is already an absolute path, so no internal changes are needed.

- [ ] **Step 1: Create the new files with identical content**

Create `app/components/ConfirmDialog.tsx`:

```tsx
'use client'

import { Modal } from '@/app/components/Modal'

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  exiting,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  busy: boolean
  exiting: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      ariaLabel={title}
      backdropClassName={`confirm-dialog__backdrop${exiting ? ' confirm-dialog__backdrop--exiting' : ''}`}
      backdropTestId="confirm-dialog-backdrop"
      dialogClassName={`confirm-dialog${exiting ? ' confirm-dialog--exiting' : ''}`}
      onClose={onClose}
    >
      <h2 className="confirm-dialog__title">{title}</h2>
      <p className="confirm-dialog__message">{message}</p>
      <div className="confirm-dialog__actions">
        <button type="button" className="confirm-dialog__cancel" onClick={onClose} disabled={busy}>
          Never mind
        </button>
        <button type="button" className="confirm-dialog__confirm" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
```

Create `app/components/ConfirmDialog.test.tsx` with the exact same content as the current `app/order/[id]/ConfirmDialog.test.tsx` (only the file location changes — its `import { ConfirmDialog } from './ConfirmDialog'` line stays correct since the component moves alongside it):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders the title, message, and confirm label', () => {
    render(
      <ConfirmDialog
        title="Cancel this order?"
        message="Staff won't receive it."
        confirmLabel="Yes, cancel"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()
    expect(screen.getByText("Staff won't receive it.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes, cancel' })).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when "Never mind" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click but not on a click inside the dialog', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('confirm-dialog-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons when busy', () => {
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={true}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Never mind' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('adds an exiting class to the dialog when exiting is true', () => {
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveClass('confirm-dialog--exiting')
  })
})
```

- [ ] **Step 2: Delete the old files and update `OrderTicket.tsx`'s import**

```bash
git rm "app/order/[id]/ConfirmDialog.tsx" "app/order/[id]/ConfirmDialog.test.tsx"
```

In `app/order/[id]/OrderTicket.tsx`, change:

```ts
import { ConfirmDialog } from './ConfirmDialog'
```

to:

```ts
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
```

- [ ] **Step 3: Run the full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: all tests PASS, including the relocated `app/components/ConfirmDialog.test.tsx` and `app/order/[id]/OrderTicket.test.tsx` (which exercises `ConfirmDialog` indirectly).

- [ ] **Step 4: Commit**

```bash
git add app/components/ConfirmDialog.tsx app/components/ConfirmDialog.test.tsx "app/order/[id]/OrderTicket.tsx"
git commit -m "Promote ConfirmDialog to app/components, shared by dashboard and customer pages"
```

---

### Task 8: `OrderItemsEditor` component

**Files:**
- Create: `app/dashboard/OrderItemsEditor.tsx`, `app/dashboard/OrderItemsEditor.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` from `@/app/components/ConfirmDialog` (Task 7), `OrderCardItem` type from `./OrderCard` (existing: `{ id: string; nameSnapshot: string; priceSnapshot: string; quantity: number }`).
- Produces: `OrderItemsEditor` component and `AvailableMenuItem` type (`{ id: string; name: string; price: string }`) — consumed by Task 10's `OrderDetailModal`.

- [ ] **Step 1: Write the failing test**

Create `app/dashboard/OrderItemsEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderItemsEditor } from './OrderItemsEditor'
import type { OrderCardItem } from './OrderCard'

const twoItems: OrderCardItem[] = [
  { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 },
  { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 },
]

const menuItems = [{ id: 'm3', name: 'Cola', price: '3.00' }]

describe('OrderItemsEditor', () => {
  it('renders each line with its name, quantity, and price', () => {
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
    expect(screen.getByText('Fries')).toBeInTheDocument()
    expect(screen.getByText('$4.00')).toBeInTheDocument()
  })

  it('calls onAdjustQuantity with quantity+1/-1 when the stepper buttons are clicked', async () => {
    const onAdjustQuantity = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={onAdjustQuantity}
        onRemoveItem={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    expect(onAdjustQuantity).toHaveBeenCalledWith('i1', 3)

    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    expect(onAdjustQuantity).toHaveBeenCalledWith('i1', 1)
  })

  it('disables the decrease button at quantity 1', () => {
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Decrease Fries quantity' })).toBeDisabled()
  })

  it('hides the remove button for the only remaining line (INV-2)', () => {
    render(
      <OrderItemsEditor
        items={[twoItems[0]]}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Remove Burger' })).not.toBeInTheDocument()
  })

  it('opens a confirm dialog before removing a line, and calls onRemoveItem only after confirming', async () => {
    const onRemoveItem = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={onRemoveItem}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Fries' }))
    expect(onRemoveItem).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Remove item?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemoveItem).toHaveBeenCalledWith('i2')
  })

  it('adds an item from the picker and resets the selection', async () => {
    const onAddItem = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={onAddItem}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Add an item' }), 'm3')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAddItem).toHaveBeenCalledWith('m3')
    expect(screen.getByRole('combobox', { name: 'Add an item' })).toHaveValue('')
  })

  it('disables the Add button until an item is selected', () => {
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/dashboard/OrderItemsEditor.test.tsx`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Implement `OrderItemsEditor`**

Create `app/dashboard/OrderItemsEditor.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import type { OrderCardItem } from './OrderCard'

export type AvailableMenuItem = { id: string; name: string; price: string }

function lineTotal(item: OrderCardItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

export function OrderItemsEditor({
  items,
  busy,
  menuItems,
  onAddItem,
  onAdjustQuantity,
  onRemoveItem,
}: {
  items: OrderCardItem[]
  busy: boolean
  menuItems: AvailableMenuItem[]
  onAddItem: (menuItemId: string) => void
  onAdjustQuantity: (itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
}) {
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const singleLine = items.length === 1

  function handleAdd() {
    if (!selectedMenuItemId) return
    onAddItem(selectedMenuItemId)
    setSelectedMenuItemId('')
  }

  function handleConfirmRemove() {
    if (!confirmRemove) return
    onRemoveItem(confirmRemove.id)
    setConfirmRemove(null)
  }

  return (
    <>
      <ul className="order-items-editor__lines">
        {items.map((item) => (
          <li key={item.id} className="order-items-editor__line">
            <span className="order-items-editor__line-name">{item.nameSnapshot}</span>
            <button
              type="button"
              className="order-items-editor__stepper"
              aria-label={`Decrease ${item.nameSnapshot} quantity`}
              disabled={busy || item.quantity <= 1}
              onClick={() => onAdjustQuantity(item.id, item.quantity - 1)}
            >
              -
            </button>
            <span className="order-items-editor__line-qty">{item.quantity}</span>
            <button
              type="button"
              className="order-items-editor__stepper"
              aria-label={`Increase ${item.nameSnapshot} quantity`}
              disabled={busy}
              onClick={() => onAdjustQuantity(item.id, item.quantity + 1)}
            >
              +
            </button>
            <span className="order-items-editor__line-price">${lineTotal(item).toFixed(2)}</span>
            {!singleLine && (
              <button
                type="button"
                className="order-items-editor__remove"
                aria-label={`Remove ${item.nameSnapshot}`}
                disabled={busy}
                onClick={() => setConfirmRemove({ id: item.id, name: item.nameSnapshot })}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="order-items-editor__add">
        <select
          className="order-items-editor__add-select"
          aria-label="Add an item"
          value={selectedMenuItemId}
          disabled={busy || menuItems.length === 0}
          onChange={(event) => setSelectedMenuItemId(event.target.value)}
        >
          <option value="">Add an item…</option>
          {menuItems.map((menuItem) => (
            <option key={menuItem.id} value={menuItem.id}>
              {menuItem.name} — ${menuItem.price}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="order-items-editor__add-button"
          disabled={busy || !selectedMenuItemId}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove item?"
          message={`Remove ${confirmRemove.name} from this order?`}
          confirmLabel="Remove"
          busy={busy}
          exiting={false}
          onConfirm={handleConfirmRemove}
          onClose={() => setConfirmRemove(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/dashboard/OrderItemsEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add CSS**

In `app/globals.css`, find the end of the `.table-picker__footnote` rule (the last rule in the file) and append:

```css

/* Order items editor (dashboard) */

.order-items-editor__lines {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.order-items-editor__line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed var(--clay-faint);
}

.order-items-editor__line-name {
  flex: 1;
}

.order-items-editor__stepper {
  min-width: 32px;
  min-height: 32px;
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  background: transparent;
  color: var(--espresso);
  font-size: 1rem;
  cursor: pointer;
}

.order-items-editor__stepper:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.order-items-editor__stepper:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.order-items-editor__line-qty {
  font-family: var(--font-mono), monospace;
  min-width: 2ch;
  text-align: center;
}

.order-items-editor__line-price {
  font-family: var(--font-mono), monospace;
  white-space: nowrap;
  min-width: 4ch;
  text-align: right;
}

.order-items-editor__remove {
  border: none;
  background: transparent;
  color: var(--clay);
  font-size: 1.2rem;
  cursor: pointer;
  min-width: 32px;
  min-height: 32px;
}

.order-items-editor__remove:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.order-items-editor__add {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.order-items-editor__add-select {
  flex: 1;
  min-height: 44px;
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  background: var(--paper);
  color: var(--espresso);
  padding: 0 0.5rem;
}

.order-items-editor__add-button {
  min-height: 44px;
  padding: 0 1rem;
  border-radius: 8px;
  border: 1px solid var(--espresso);
  background: var(--espresso);
  color: var(--crema);
  font-weight: 600;
  cursor: pointer;
}

.order-items-editor__add-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/OrderItemsEditor.tsx app/dashboard/OrderItemsEditor.test.tsx app/globals.css
git commit -m "Add OrderItemsEditor component for staff/admin item editing"
```

---

### Task 9: Role plumbing + Cancel-order action in the dashboard

**Files:**
- Modify: `app/dashboard/page.tsx`, `app/dashboard/PendingOrdersDashboard.tsx`, `app/dashboard/OrderDetailModal.tsx`, `app/globals.css`
- Test: `app/dashboard/OrderDetailModal.test.tsx`, `app/dashboard/PendingOrdersDashboard.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` from `@/app/components/ConfirmDialog` (Task 7).
- Produces: `OrderDetailModal` gains `role?: Role` (default `'staff'`) and `onCancelOrder: () => void` props, plus an internal Cancel-confirm flow. `PendingOrdersDashboard` gains an optional `role?: Role` prop (default `'staff'`) and a `handleCancel` handler. `app/dashboard/page.tsx` passes its real `role` down.

This task deliberately does **not** yet touch the read-only `<ul>` of item lines — that's Task 10. This task only adds the Cancel button/flow so it can be reviewed independently of the (larger) items-editing change.

- [ ] **Step 1: Write the failing tests**

In `app/dashboard/OrderDetailModal.test.tsx`, replace the whole file (adds the two new required props everywhere via a shared `baseProps` object, and adds Cancel-specific tests):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderDetailModal } from './OrderDetailModal'
import type { OrderCardOrder } from './OrderCard'

const pendingOrder: OrderCardOrder = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  customerName: 'Edward',
  table: { number: 4 },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

function baseProps(overrides: Partial<React.ComponentProps<typeof OrderDetailModal>> = {}) {
  return {
    order: pendingOrder,
    busy: false,
    error: null,
    exiting: false,
    menuItems: [],
    onConfirm: vi.fn(),
    onSetPaymentStatus: vi.fn(),
    onCancelOrder: vi.fn(),
    onAddItem: vi.fn(),
    onAdjustQuantity: vi.fn(),
    onRemoveItem: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('OrderDetailModal', () => {
  it('renders items, line totals, and the order total', () => {
    render(<OrderDetailModal {...baseProps()} />)

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    const allTotals = screen.getAllByText('$25.00')
    expect(allTotals.length).toBeGreaterThanOrEqual(2) // line + order total
  })

  it('shows Confirm and Mark Paid for a Pending order, and calls the right callback for each', async () => {
    const onConfirm = vi.fn()
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ onConfirm, onSetPaymentStatus })} />)

    await user.click(screen.getByRole('button', { name: 'Confirm order' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Mark Paid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Paid')
  })

  it('hides Confirm for a Confirmed & Unpaid order but keeps Mark Paid', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' } })} />)

    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()
  })

  it('shows Mark Unpaid for any role on a Paid order', async () => {
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, paymentStatus: 'Paid' }, onSetPaymentStatus })} />)

    await user.click(screen.getByRole('button', { name: 'Mark Unpaid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Unpaid')
  })

  it('shows the error message and disables actions when busy', () => {
    render(<OrderDetailModal {...baseProps({ busy: true, error: 'Order is Confirmed, not Pending' })} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Order is Confirmed, not Pending')
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDisabled()
  })

  it('renders "Counter" instead of "Table 0" for a table number 0 order', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, table: { number: 0 } } })} />)

    expect(screen.getByText('Counter', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('Table 0', { exact: false })).not.toBeInTheDocument()
  })

  it('shows a Cancel order button for a Pending order', () => {
    render(<OrderDetailModal {...baseProps()} />)

    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('hides the Cancel order button for a Confirmed order', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' } })} />)

    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('opens a confirm dialog before cancelling, and calls onCancelOrder only after confirming', async () => {
    const onCancelOrder = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ onCancelOrder })} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    expect(onCancelOrder).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))
    expect(onCancelOrder).toHaveBeenCalledTimes(1)
  })

  it('does not cancel when "Never mind" is clicked', async () => {
    const onCancelOrder = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ onCancelOrder })} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Never mind' }))

    expect(onCancelOrder).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Cancel this order?' })).not.toBeInTheDocument()
  })
})
```

Note: the first test's assertion changes from `screen.getByText('2x Burger')` to `screen.getByText('Burger')` because Task 10 (next) will replace the plain read-only line with `OrderItemsEditor`'s separate name/qty/price spans for a Pending order — writing that expectation now keeps this test file internally consistent across both tasks instead of touching it twice.

In `app/dashboard/PendingOrdersDashboard.test.tsx`, extend the `apiClient` mock to add `del`:

```ts
vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  }
})
```

Add these two tests after the existing `'closes the modal on backdrop click...'` test:

```ts
  it('shows a Cancel order button for a Pending order and cancels it after confirming', async () => {
    mockTabs({ pending: [orderA] })
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }))
    })

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Table 4')).not.toBeInTheDocument()
  })

  it('does not show a Cancel order button for a Confirmed order', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })
```

In `app/dashboard/page.test.tsx`, add a test that `role` reaches the dashboard (indirectly verified via the Cancel button showing up on a Pending order — but since `page.test.tsx` mocks `apiClient.get` to always return `[]`, there's nothing to open a modal on. Instead, assert the ISSUE-5 link fix from Task 15 covers page.tsx's own behavior — no new assertion is needed here for role plumbing itself, since `PendingOrdersDashboard`'s own tests in Task 9/10 already cover role-gated rendering directly). No change to `page.test.tsx` in this task.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — `OrderDetailModal` doesn't accept the new required props yet (TypeScript compile error) and there's no "Cancel order" button.

- [ ] **Step 3: Update `OrderDetailModal.tsx`**

Replace `app/dashboard/OrderDetailModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Modal } from '@/app/components/Modal'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import { formatTableLabel } from '@/lib/tableDisplay'
import type { Role } from '@/lib/types'
import type { OrderCardItem, OrderCardOrder } from './OrderCard'

function lineTotal(item: OrderCardItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

export function OrderDetailModal({
  order,
  role = 'staff',
  busy,
  error,
  exiting,
  menuItems,
  onConfirm,
  onSetPaymentStatus,
  onCancelOrder,
  onAddItem,
  onAdjustQuantity,
  onRemoveItem,
  onClose,
}: {
  order: OrderCardOrder
  role?: Role
  busy: boolean
  error: string | null
  exiting: boolean
  menuItems: { id: string; name: string; price: string }[]
  onConfirm: () => void
  onSetPaymentStatus: (paymentStatus: 'Paid' | 'Unpaid') => void
  onCancelOrder: () => void
  onAddItem: (menuItemId: string) => void
  onAdjustQuantity: (itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
  onClose: () => void
}) {
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  const total = order.items.reduce((sum, item) => sum + lineTotal(item), 0)

  function handleCancelConfirm() {
    setCancelConfirmOpen(false)
    onCancelOrder()
  }

  return (
    <>
      <Modal
        ariaLabel={`Order ${order.orderNumber}`}
        backdropClassName={`order-detail-modal__backdrop${exiting ? ' order-detail-modal__backdrop--exiting' : ''}`}
        backdropTestId="order-detail-modal-backdrop"
        dialogClassName={`order-detail-modal${exiting ? ' order-detail-modal--exiting' : ''}`}
        onClose={onClose}
      >
        <h2 className="order-detail-modal__title">
          {formatTableLabel(order.table.number)} · #{order.orderNumber}
        </h2>
        {order.customerName && <p className="order-detail-modal__customer">{order.customerName}</p>}

        <ul className="order-detail-modal__lines">
          {order.items.map((item) => (
            <li key={item.id} className="order-detail-modal__line">
              <span className="order-detail-modal__line-name">
                {item.quantity}x {item.nameSnapshot}
              </span>
              <span className="order-detail-modal__line-price">${lineTotal(item).toFixed(2)}</span>
            </li>
          ))}
        </ul>

        <div className="order-detail-modal__total">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>

        {error && (
          <p role="alert" className="order-detail-modal__error">
            {error}
          </p>
        )}

        <div className="order-detail-modal__actions">
          {order.fulfillmentStatus === 'Pending' && (
            <button type="button" className="order-detail-modal__confirm" disabled={busy} onClick={onConfirm}>
              Confirm order
            </button>
          )}
          {order.fulfillmentStatus === 'Pending' && (
            <button
              type="button"
              className="order-detail-modal__cancel"
              disabled={busy}
              onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel order
            </button>
          )}
          {order.paymentStatus === 'Unpaid' ? (
            <button
              type="button"
              className="order-detail-modal__pay"
              disabled={busy}
              onClick={() => onSetPaymentStatus('Paid')}
            >
              Mark Paid
            </button>
          ) : (
            <button
              type="button"
              className="order-detail-modal__pay order-detail-modal__pay--revert"
              disabled={busy}
              onClick={() => onSetPaymentStatus('Unpaid')}
            >
              Mark Unpaid
            </button>
          )}
        </div>
      </Modal>

      {cancelConfirmOpen && (
        <ConfirmDialog
          title="Cancel this order?"
          message="Staff won't receive it, and this can't be undone."
          confirmLabel="Yes, cancel"
          busy={busy}
          exiting={false}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelConfirmOpen(false)}
        />
      )}
    </>
  )
}
```

Note: `role`, `menuItems`, `onAddItem`, `onAdjustQuantity`, `onRemoveItem` are accepted here but not yet used in the item-list rendering — that wiring is Task 10. Keeping them in the props signature now (rather than adding them again in Task 10) means Task 10 only changes the item-list JSX, not the function signature.

- [ ] **Step 4: Update `PendingOrdersDashboard.tsx`**

In `app/dashboard/PendingOrdersDashboard.tsx`:

Change the component signature and add a `handleCancel` function. Replace:

```ts
export function PendingOrdersDashboard() {
```

with:

```ts
import type { Role } from '@/lib/types'

export function PendingOrdersDashboard({ role = 'staff' }: { role?: Role } = {}) {
```

(Add the `Role` import to the existing import block at the top of the file, alongside the other imports.)

Add `handleCancel` after `handleConfirm`:

```ts
  async function handleCancel(order: DashboardOrder) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      await apiClient.del(`/api/orders/${order.id}`)
      setExitingIds((current) => new Set(current).add(order.id))
      setModal((current) => (current ? { ...current, closing: true } : current))
      const timerId: ReturnType<typeof setTimeout> = setTimeout(() => {
        closeTimersRef.current.delete(timerId)
        setPendingOrders((current) => current.filter((o) => o.id !== order.id))
        setExitingIds((current) => {
          const next = new Set(current)
          next.delete(order.id)
          return next
        })
        setModal((current) => (current && current.orderId === order.id && current.closing ? null : current))
      }, EXIT_MS)
      closeTimersRef.current.add(timerId)
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }
```

Update the `OrderDetailModal` render call to pass the new props (temporary no-op stubs for the Task 10 props, which Task 10 will replace):

```tsx
      {modal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          role={role}
          busy={modal.busy}
          error={modal.error}
          exiting={modal.closing}
          menuItems={[]}
          onConfirm={() => handleConfirm(selectedOrder)}
          onSetPaymentStatus={(paymentStatus) => handleSetPaymentStatus(selectedOrder, paymentStatus)}
          onCancelOrder={() => handleCancel(selectedOrder)}
          onAddItem={() => {}}
          onAdjustQuantity={() => {}}
          onRemoveItem={() => {}}
          onClose={closeModal}
        />
      )}
```

- [ ] **Step 5: Update `app/dashboard/page.tsx` to pass `role`**

Change:

```tsx
      <PendingOrdersDashboard />
```

to:

```tsx
      <PendingOrdersDashboard role={role} />
```

- [ ] **Step 6: Add CSS for the Cancel button**

In `app/globals.css`, find:

```css
.order-detail-modal__actions {
  display: flex;
  gap: 0.75rem;
}
```

and replace with:

```css
.order-detail-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.order-detail-modal__cancel {
  flex: 1;
  min-height: 48px;
  border-radius: 10px;
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
}

.order-detail-modal__cancel:hover:not(:disabled) {
  background: var(--danger);
  color: var(--paper);
}

.order-detail-modal__cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.order-detail-modal__cancel:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/dashboard/page.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/PendingOrdersDashboard.tsx app/dashboard/OrderDetailModal.tsx app/dashboard/OrderDetailModal.test.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/globals.css
git commit -m "Add staff/admin Cancel-order action and role plumbing to the dashboard"
```

---

### Task 10: Wire `OrderItemsEditor` into the dashboard

**Files:**
- Modify: `app/dashboard/OrderDetailModal.tsx`, `app/dashboard/PendingOrdersDashboard.tsx`
- Test: `app/dashboard/OrderDetailModal.test.tsx`, `app/dashboard/PendingOrdersDashboard.test.tsx`

**Interfaces:**
- Consumes: `OrderItemsEditor` + `AvailableMenuItem` from Task 8, `addOrderItem`/`updateOrderItemQuantity`/`removeOrderItem` API routes from Tasks 4-6.

- [ ] **Step 1: Write the failing tests**

Add to `app/dashboard/OrderDetailModal.test.tsx`, after the existing Cancel-order tests:

```tsx
  it('renders the editable item list (stepper + remove) for a Pending order regardless of role', () => {
    render(<OrderDetailModal {...baseProps({ role: 'staff' })} />)

    expect(screen.getByRole('button', { name: 'Increase Burger quantity' })).toBeInTheDocument()
  })

  it('renders the editable item list for a Confirmed order when role is admin', () => {
    render(
      <OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' }, role: 'admin' })} />,
    )

    expect(screen.getByRole('button', { name: 'Increase Burger quantity' })).toBeInTheDocument()
  })

  it('renders the read-only item list for a Confirmed order when role is staff', () => {
    render(
      <OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' }, role: 'staff' })} />,
    )

    expect(screen.queryByRole('button', { name: 'Increase Burger quantity' })).not.toBeInTheDocument()
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
  })

  it('calls onAddItem, onAdjustQuantity, and onRemoveItem from the editable item list', async () => {
    const onAdjustQuantity = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ onAdjustQuantity })} />)

    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    expect(onAdjustQuantity).toHaveBeenCalledWith('i1', 3)
  })
```

Update the earlier "renders items, line totals, and the order total" test's fixture to be non-editable (Confirmed + staff) so it exercises the still-supported read-only rendering path with its original assertions, and add a matching Pending-editable version:

```tsx
  it('renders items, line totals, and the order total for a Confirmed (read-only) order', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' }, role: 'staff' })} />)

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    const allTotals = screen.getAllByText('$25.00')
    expect(allTotals.length).toBeGreaterThanOrEqual(2) // line + order total
  })

  it('renders items, line totals, and the order total for a Pending (editable) order', () => {
    render(<OrderDetailModal {...baseProps()} />)

    expect(screen.getByText('Burger')).toBeInTheDocument()
    const allTotals = screen.getAllByText('$25.00')
    expect(allTotals.length).toBeGreaterThanOrEqual(2) // line + order total
  })
```

(Remove the single "renders items, line totals, and the order total" test written in Task 9's Step 1 — it's superseded by these two more specific tests.)

Now extend `app/dashboard/PendingOrdersDashboard.test.tsx`. First, extend `mockTabs` to support a `menuItems` fixture and extend the `apiClient` mock to add `post`:

```ts
vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { get: vi.fn(), patch: vi.fn(), del: vi.fn(), post: vi.fn() },
  }
})

type Tabs = { pending?: unknown[]; confirmed?: unknown[]; menuItems?: unknown[] }

function mockTabs({ pending = [], confirmed = [], menuItems = [] }: Tabs = {}) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path.includes('/api/menu-items')) return Promise.resolve(menuItems)
    if (path.includes('status=confirmed')) return Promise.resolve(confirmed)
    return Promise.resolve(pending)
  })
}
```

Add these tests after the Cancel-order tests added in Task 9:

```ts
  it('adds an item from the picker, calling POST and refreshing the tabs', async () => {
    mockTabs({ pending: [orderA], menuItems: [{ id: 'm2', name: 'Fries', price: '4.00', available: true }] })
    vi.mocked(apiClient.post).mockResolvedValue({})
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    fireEvent.change(screen.getByRole('combobox', { name: 'Add an item' }), { target: { value: 'm2' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })

    expect(apiClient.post).toHaveBeenCalledWith('/api/orders/o1/items', { menuItemId: 'm2', quantity: 1 })
  })

  it('adjusts a line item quantity with the stepper, calling PATCH', async () => {
    mockTabs({ pending: [orderA] })
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/items/i1', { quantity: 3 })
  })

  it('removes a line item after confirming, calling DELETE', async () => {
    const twoItemOrder = {
      ...orderA,
      items: [...orderA.items, { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
    }
    mockTabs({ pending: [twoItemOrder] })
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Remove Fries' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    })

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1/items/i2')
  })

  it('does not render editable item controls for a Confirmed order when the session role is staff', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    expect(screen.queryByRole('button', { name: 'Increase Burger quantity' })).not.toBeInTheDocument()
  })

  it('renders editable item controls for a Confirmed order when the session role is admin', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard role="admin" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    expect(screen.getByRole('button', { name: 'Increase Burger quantity' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — the modal still renders the plain read-only list for every status, and the dashboard still passes no-op stubs for add/adjust/remove.

- [ ] **Step 3: Update `OrderDetailModal.tsx`'s item-list rendering**

In `app/dashboard/OrderDetailModal.tsx`, add the import and `editable` calculation, then swap the item-list JSX:

```ts
import { OrderItemsEditor } from './OrderItemsEditor'
```

Add right after the `total` calculation:

```ts
  const editable = order.fulfillmentStatus === 'Pending' || (order.fulfillmentStatus === 'Confirmed' && role === 'admin')
```

Replace:

```tsx
        <ul className="order-detail-modal__lines">
          {order.items.map((item) => (
            <li key={item.id} className="order-detail-modal__line">
              <span className="order-detail-modal__line-name">
                {item.quantity}x {item.nameSnapshot}
              </span>
              <span className="order-detail-modal__line-price">${lineTotal(item).toFixed(2)}</span>
            </li>
          ))}
        </ul>
```

with:

```tsx
        {editable ? (
          <OrderItemsEditor
            items={order.items}
            busy={busy}
            menuItems={menuItems}
            onAddItem={onAddItem}
            onAdjustQuantity={onAdjustQuantity}
            onRemoveItem={onRemoveItem}
          />
        ) : (
          <ul className="order-detail-modal__lines">
            {order.items.map((item) => (
              <li key={item.id} className="order-detail-modal__line">
                <span className="order-detail-modal__line-name">
                  {item.quantity}x {item.nameSnapshot}
                </span>
                <span className="order-detail-modal__line-price">${lineTotal(item).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
```

- [ ] **Step 4: Wire real handlers in `PendingOrdersDashboard.tsx`**

Add a `refreshTabs` helper and the three handlers after `handleCancel`:

```ts
  async function refreshTabs() {
    try {
      const tabs = await fetchTabs()
      setPendingOrders(tabs.pending)
      setConfirmedOrders(tabs.confirmed)
    } catch {
      // Keep last-known lists; the next scheduled poll will retry.
    }
  }

  async function handleAddItem(order: DashboardOrder, menuItemId: string) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      await apiClient.post(`/api/orders/${order.id}/items`, { menuItemId, quantity: 1 })
      await refreshTabs()
      setModal((current) => (current ? { ...current, busy: false, error: null } : current))
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  async function handleAdjustQuantity(order: DashboardOrder, itemId: string, quantity: number) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      await apiClient.patch(`/api/orders/${order.id}/items/${itemId}`, { quantity })
      await refreshTabs()
      setModal((current) => (current ? { ...current, busy: false, error: null } : current))
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  async function handleRemoveItem(order: DashboardOrder, itemId: string) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      await apiClient.del(`/api/orders/${order.id}/items/${itemId}`)
      await refreshTabs()
      setModal((current) => (current ? { ...current, busy: false, error: null } : current))
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }
```

Add a `menuItems` state and fetch-on-mount effect, near the top of the component body (after the existing `useState` declarations):

```ts
  const [menuItems, setMenuItems] = useState<{ id: string; name: string; price: string }[]>([])

  useEffect(() => {
    let cancelled = false
    apiClient
      .get<{ id: string; name: string; price: string; available: boolean }[]>('/api/menu-items')
      .then((items) => {
        if (!cancelled) setMenuItems(items.filter((item) => item.available).map((item) => ({ id: item.id, name: item.name, price: item.price })))
      })
      .catch(() => {
        // Non-critical: the add-item picker just stays empty until the next mount.
      })
    return () => {
      cancelled = true
    }
  }, [])
```

Replace the stubbed props in the `OrderDetailModal` render call:

```tsx
          menuItems={menuItems}
          onCancelOrder={() => handleCancel(selectedOrder)}
          onAddItem={(menuItemId) => handleAddItem(selectedOrder, menuItemId)}
          onAdjustQuantity={(itemId, quantity) => handleAdjustQuantity(selectedOrder, itemId, quantity)}
          onRemoveItem={(itemId) => handleRemoveItem(selectedOrder, itemId)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS — no regressions in `app/order/[id]/` (untouched) or elsewhere.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/OrderDetailModal.tsx app/dashboard/OrderDetailModal.test.tsx app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx
git commit -m "Wire OrderItemsEditor into the dashboard for staff/admin item editing"
```

---

### Task 11: Back-link on `app/order/[id]/page.tsx`

**Files:**
- Modify: `app/order/[id]/page.tsx`, `app/globals.css`
- Test: `app/order/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `peekSession()` from `@/lib/authGuard` (existing, unchanged).

- [ ] **Step 1: Write the failing tests**

Add to `app/order/[id]/page.test.tsx`. First add the mock (alongside the existing `getOrderById`/`OrderStatusPoller` mocks):

```ts
vi.mock('@/lib/authGuard', () => ({
  peekSession: vi.fn(),
}))
```

Import it: `import { peekSession } from '@/lib/authGuard'`. Add `vi.mocked(peekSession).mockResolvedValue(null)` to the `beforeEach`. Then add these two tests after the existing "shows the table header and a back-to-menu link for a Pending order" test:

```ts
  it('does not show a back-to-dashboard link when there is no staff session', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Pending') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.queryByRole('link', { name: '← Dashboard' })).not.toBeInTheDocument()
  })

  it('shows a back-to-dashboard link for an authenticated staff or admin session', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Pending') as never)
    vi.mocked(peekSession).mockResolvedValue({ role: 'staff' })

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/dashboard')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/order/[id]/page.test.tsx"`
Expected: FAIL (no `peekSession` call or "← Dashboard" link exists yet).

- [ ] **Step 3: Update the page**

In `app/order/[id]/page.tsx`, add the import and session read:

```ts
import { peekSession } from '@/lib/authGuard'
```

Add after the `const { id } = await params` line:

```ts
  const session = await peekSession()
```

Update the `header` JSX:

```tsx
  const header = (
    <header className="order-header">
      <div className="order-header__row">
        <span className="order-header__eyebrow">Your order</span>
        <span className="order-header__links">
          {session && (
            <Link href="/dashboard" className="order-header__back">
              ← Dashboard
            </Link>
          )}
          <Link href={`/order?table=${order.table.id}`} className="order-header__back">
            ← Menu
          </Link>
        </span>
      </div>
      <h1 className="order-header__title">{formatTableLabel(order.table.number)}</h1>
    </header>
  )
```

- [ ] **Step 4: Add CSS for the link wrapper**

In `app/globals.css`, find:

```css
.order-header__row .order-header__eyebrow {
  margin-bottom: 0;
}
```

and add directly after it:

```css

.order-header__links {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run "app/order/[id]/page.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/order/[id]/page.tsx" "app/order/[id]/page.test.tsx" app/globals.css
git commit -m "Add staff/admin back-to-dashboard link on the order confirmation page"
```

---

### Task 12: Back-link on `app/order/new/page.tsx`

**Files:**
- Modify: `app/order/new/page.tsx`
- Test: `app/order/new/page.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `app/order/new/page.test.tsx`, after the "renders for an admin session too" test:

```ts
  it('shows an unconditional back-to-dashboard link (page is already staff-gated)', async () => {
    vi.mocked(listTables).mockResolvedValue([])

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/dashboard')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/order/new/page.test.tsx`
Expected: FAIL (no such link yet).

- [ ] **Step 3: Update the page**

Replace the `header` block in `app/order/new/page.tsx`:

```tsx
      <header className="order-header">
        <div className="order-header__row">
          <span className="order-header__eyebrow">Staff · New order</span>
          <Link href="/dashboard" className="order-header__back">
            ← Dashboard
          </Link>
        </div>
        <h1 className="order-header__title">Choose a table</h1>
      </header>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/order/new/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/order/new/page.tsx app/order/new/page.test.tsx
git commit -m "Add back-to-dashboard link on the New order table picker"
```

---

### Task 13: Back-link on `app/admin/menu-items/page.tsx`

**Files:**
- Modify: `app/admin/menu-items/page.tsx`
- Test: Create `app/admin/menu-items/page.test.tsx` (none exists today)

**Interfaces:**
- Consumes: `requireRole` from `@/lib/authGuard`, `listMenuItems` from `@/lib/menuService` (both existing).

- [ ] **Step 1: Write the failing test**

Create `app/admin/menu-items/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminMenuItemsPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listMenuItems } from '@/lib/menuService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/menuService', () => ({
  listMenuItems: vi.fn(),
}))

describe('AdminMenuItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listMenuItems).mockResolvedValue([])
  })

  it('shows an unconditional back-to-dashboard link for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await AdminMenuItemsPage()
    render(ui)

    expect(screen.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('shows the back-to-dashboard link for an admin session too', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })

    const ui = await AdminMenuItemsPage()
    render(ui)

    expect(screen.getByRole('link', { name: '← Dashboard' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/menu-items/page.test.tsx`
Expected: FAIL (no link exists yet).

- [ ] **Step 3: Update the page**

Replace `app/admin/menu-items/page.tsx`:

```tsx
import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { listMenuItems } from '@/lib/menuService'
import { CreateMenuItemForm } from './CreateMenuItemForm'
import { MenuItemRow } from './MenuItemRow'

export default async function AdminMenuItemsPage() {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'

  const items = await listMenuItems()

  return (
    <main>
      <div className="order-header__row">
        <h1>Menu Management</h1>
        <Link href="/dashboard" className="order-header__back">
          ← Dashboard
        </Link>
      </div>
      {isAdmin && <CreateMenuItemForm />}
      <ul>
        {items.map((item) => (
          <MenuItemRow
            key={item.id}
            id={item.id}
            name={item.name}
            price={item.price.toString()}
            available={item.available}
            editable={isAdmin}
          />
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/menu-items/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/menu-items/page.tsx app/admin/menu-items/page.test.tsx
git commit -m "Add back-to-dashboard link on the Menu Management page"
```

---

### Task 14: Back-link on `app/admin/tables/page.tsx`

**Files:**
- Modify: `app/admin/tables/page.tsx`
- Test: Create `app/admin/tables/page.test.tsx` (none exists today)

**Interfaces:**
- Consumes: `requireRole`, `listTables`, `generateQrDataUrl` (all existing).

- [ ] **Step 1: Write the failing test**

Create `app/admin/tables/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminTablesPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'
import { generateQrDataUrl } from '@/lib/qrCode'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/tableService', () => ({
  listTables: vi.fn(),
}))

vi.mock('@/lib/qrCode', () => ({
  generateQrDataUrl: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([['host', 'localhost:3000']])),
}))

describe('AdminTablesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listTables).mockResolvedValue([])
    vi.mocked(generateQrDataUrl).mockResolvedValue('data:image/png;base64,x')
  })

  it('shows an unconditional back-to-dashboard link', async () => {
    const ui = await AdminTablesPage()
    render(ui)

    expect(screen.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/dashboard')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/tables/page.test.tsx`
Expected: FAIL. If the `next/headers` mock's `.get()` call shape doesn't match (the real `headers()` return value supports `.get(name)`), adjust the mock to `{ get: (key: string) => (key === 'host' ? 'localhost:3000' : null) }` instead of a `Map` — verify against how `headers()` is actually called in `app/admin/tables/page.tsx:11-12` (`headerList.get('host')`) before finalizing.

- [ ] **Step 3: Update the page**

Replace `app/admin/tables/page.tsx`:

```tsx
import Link from 'next/link'
import { headers } from 'next/headers'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'
import { generateQrDataUrl } from '@/lib/qrCode'
import { CreateTableForm } from './CreateTableForm'

export default async function AdminTablesPage() {
  await requireRole('admin')

  const tables = await listTables()
  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const origin = `${protocol}://${host}`

  const tablesWithQr = await Promise.all(
    tables.map(async (table) => {
      const orderUrl = `${origin}/order?table=${table.id}`
      const qrDataUrl = await generateQrDataUrl(orderUrl)
      return { ...table, orderUrl, qrDataUrl }
    }),
  )

  return (
    <main>
      <div className="order-header__row">
        <h1>Table Setup</h1>
        <Link href="/dashboard" className="order-header__back">
          ← Dashboard
        </Link>
      </div>
      <CreateTableForm />
      <ul>
        {tablesWithQr.map((table) => (
          <li key={table.id}>
            <p>Table {table.number}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
            <img src={table.qrDataUrl} alt={`QR code for table ${table.number}`} width={200} height={200} />
            <p>{table.orderUrl}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/tables/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/tables/page.tsx app/admin/tables/page.test.tsx
git commit -m "Add back-to-dashboard link on the Table Setup page"
```

---

### Task 15: Fix `ISSUE-5` (dashboard nav link)

**Files:**
- Modify: `app/dashboard/page.tsx`, `ISSUES.md`
- Test: `app/dashboard/page.test.tsx`

**Interfaces:** None new — this is a one-line `href` fix plus moving the issue to `ISSUES.md`'s Resolved table.

- [ ] **Step 1: Write the failing test**

Add to `app/dashboard/page.test.tsx`, after the "still shows admin-only nav links for an admin session" test:

```ts
  it('links Menu Management to the real /admin/menu-items route (ISSUE-5)', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })

    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute('href', '/admin/menu-items')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/dashboard/page.test.tsx`
Expected: FAIL (current `href` is `/admin/menu`).

- [ ] **Step 3: Fix the link**

In `app/dashboard/page.tsx`, change:

```tsx
              <Link href="/admin/menu">Menu Management</Link>
```

to:

```tsx
              <Link href="/admin/menu-items">Menu Management</Link>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/dashboard/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Move ISSUE-5 to Resolved in `ISSUES.md`**

Remove this row from the Open table:

```
| ISSUE-5 | Staff Dashboard's "Menu Management" nav link points to `/admin/menu`, but the actual route is `/admin/menu-items` — clicking it 404s | Story 7 planning, noticed while wiring `PendingOrdersDashboard` into `app/dashboard/page.tsx` | Major | Open |
```

Add this row to the Resolved table (after the `ISSUE-10` row):

```
| ISSUE-5 | Staff Dashboard's "Menu Management" nav link points to `/admin/menu`, but the actual route is `/admin/menu-items` — clicking it 404s | Story 7 planning, noticed while wiring `PendingOrdersDashboard` into `app/dashboard/page.tsx` | Hardcoded `href` never matched the real route created in a later story | Changed `href` to `/admin/menu-items` in `app/dashboard/page.tsx`; fixed alongside Stories 12-13's dashboard work |
```

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/page.test.tsx ISSUES.md
git commit -m "Fix ISSUE-5: dashboard Menu Management link now points to /admin/menu-items"
```

---

### Task 16: Close out tracking (BUILD_STATUS.md, epic map)

**Files:**
- Modify: `BUILD_STATUS.md`, `docs/design/07-epic-map.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Mark Stories 12 and 13 Done in `BUILD_STATUS.md`**

Change the `Building` status for both rows to `Done`, keeping their existing notes:

```
| 12 | Admin edits to Confirmed orders (UI) (user-directed, post-epic) | Done | Implements the already-documented `INV-5` exception: admin can add/remove/adjust-quantity items on a Confirmed order. Spec: docs/superpowers/specs/2026-07-09-staff-admin-order-edits-design.md |
| 13 | Staff edits to a Pending order (user-directed, post-epic) | Done | Staff gains add/remove/adjust-quantity item editing plus a Cancel action on Pending orders via the dashboard; shares the Story 12 editor/service layer. Also sweeps the staff/admin "← Dashboard" back-link across four screens that lacked one, and fixes ISSUE-5. Spec: docs/superpowers/specs/2026-07-09-staff-admin-order-edits-design.md |
```

- [ ] **Step 2: Remove the two built backlog bullets from `docs/design/07-epic-map.md`**

Delete this line from the Backlog epics list:

```
- **Admin edits to Confirmed orders (UI)** — the domain rule exists (`INV-5` exception); the admin-facing UI for it can wait until the pilot surfaces real correction cases.
```

Delete this line too:

```
- **Staff edits to a *Pending* order** — distinct from the already-listed "Admin edits to Confirmed orders" above: today only the customer can edit items on their own still-`Pending` order (`INV-4`); staff currently has no edit capability at any stage, only Confirm/Cancel and payment toggling. Raised 2026-07-08.
```

- [ ] **Step 3: Run the full test suite one final time**

Run: `npx vitest run`
Expected: PASS, entire suite green.

- [ ] **Step 4: Commit**

```bash
git add BUILD_STATUS.md docs/design/07-epic-map.md
git commit -m "Mark Stories 12-13 (admin/staff order edits) as Done"
```

---

## Self-Review Notes

- **Spec coverage:** Decision 1 (shared status×role gate) → Task 1. Decision 2 (service layer) → Tasks 1-3. Decision 3 (API routes) → Tasks 4-6. Decision 4 (dashboard UI) → Tasks 8-10. Decision 5 (back-link sweep) → Tasks 11-14. Decision 6 (ISSUE-5) → Task 15. Testing section → a test step in every task. Scope boundary (`OrderTicket.tsx` untouched) → verified in Task 7 (only its import path changes) and never touched again after.
- **Type consistency verified:** `actorRole?: Role` is the exact parameter name and type across `assertOrderEditable`, `removeOrderItem`, `addOrderItem`, and `updateOrderItemQuantity` (Tasks 1-3), and the API routes pass `session?.role` (Tasks 4-6) which is `Role | undefined` — matches. `OrderItemsEditor`'s props (`items`, `busy`, `menuItems`, `onAddItem`, `onAdjustQuantity`, `onRemoveItem`) match exactly between its own definition (Task 8) and every call site in `OrderDetailModal.tsx` (Task 10). `OrderDetailModal`'s full prop list is defined once in Task 9 and never changes shape in Task 10 (only its JSX body changes).
- **No placeholders:** every step above includes complete, real code — no "add appropriate handling" or "similar to Task N" shortcuts.
