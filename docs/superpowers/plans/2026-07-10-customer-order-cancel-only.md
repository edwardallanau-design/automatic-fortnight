# Restrict Customer Order Editing to Cancel-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a customer submits an order, their only self-service action on `/order/[id]` becomes Cancel — item-level editing (add/remove/adjust-quantity) on a Pending order becomes exclusively a staff/admin dashboard action, closing the anonymous-caller gap `ISSUE-13` flagged.

**Architecture:** The three order-item-mutation API routes (`POST /items`, `PATCH /items/:itemId`, `DELETE /items/:itemId`) gain `requireApiRole('staff')`, the same guard the confirm/pay routes already use — this makes `lib/orderService.ts`'s `actorRole` parameter on those three functions a required `Role` instead of optional, since every caller is now guaranteed authenticated. The customer-facing `OrderTicket.tsx`/`TicketCard.tsx` components lose their remove-item UI entirely (dead code once the underlying capability is gone). `DELETE /api/orders/:id` (cancel) and `cancelOrder` are untouched throughout.

**Tech Stack:** Next.js 16 App Router API routes, Prisma 7, Vitest 4 + Testing Library, TypeScript 5.

## Global Constraints

- No change to `DELETE /api/orders/:id` (cancel) or `lib/orderService.ts`'s `cancelOrder` — stays unauthenticated, customer-accessible.
- No change to `app/dashboard/OrderDetailModal.tsx` / `PendingOrdersDashboard.tsx` or their tests — staff/admin capability is unchanged.
- No new invariant — `INV-4` is narrowed (role restriction added), not replaced. `INV-1`, `INV-2`, `INV-3`, `INV-5`–`INV-10` are untouched.
- Verification commands for this repo: `npx tsc --noEmit` (typecheck) and `npx vitest run <path>` (targeted) / `npm run test` (full suite).

---

### Task 1: Require staff/admin auth on order-item mutation routes

**Files:**
- Modify: `lib/orderService.ts:136-239` (`removeOrderItem`, `addOrderItem`, `updateOrderItemQuantity` signatures)
- Modify: `lib/orderService.test.ts:371-673` (call sites for the three functions above)
- Modify: `app/api/orders/[id]/items/route.ts` (POST)
- Modify: `app/api/orders/[id]/items/route.test.ts`
- Modify: `app/api/orders/[id]/items/[itemId]/route.ts` (DELETE, PATCH)
- Modify: `app/api/orders/[id]/items/[itemId]/route.test.ts`

**Interfaces:**
- Consumes: `requireApiRole(minRole: Role): Promise<{ role: Role }>` from `lib/authGuard.ts` (existing, already used by `app/api/orders/[id]/confirm/route.ts`) — throws `ForbiddenError` if no valid staff/admin session.
- Produces: `removeOrderItem(orderId: string, orderItemId: string, actorRole: Role)`, `addOrderItem(orderId: string, menuItemId: string, quantity: number, actorRole: Role)`, `updateOrderItemQuantity(orderId: string, orderItemId: string, quantity: number, actorRole: Role)` — `actorRole` is now required, consumed by Task 2 only insofar as it must not regress (Task 2 doesn't touch these).

- [ ] **Step 1: Tighten `orderService.ts` signatures to require `actorRole`**

In `lib/orderService.ts`, change all three signatures from optional to required (remove the `?`):

```typescript
export async function removeOrderItem(orderId: string, orderItemId: string, actorRole: Role): Promise<OrderWithItems> {
```

```typescript
export async function addOrderItem(
  orderId: string,
  menuItemId: string,
  quantity: number,
  actorRole: Role,
): Promise<OrderWithItems> {
```

```typescript
export async function updateOrderItemQuantity(
  orderId: string,
  orderItemId: string,
  quantity: number,
  actorRole: Role,
): Promise<OrderWithItems> {
```

No other lines in these functions change — `assertOrderEditable(order, actorRole)` still type-checks since it accepts `actorRole?: Role`.

- [ ] **Step 2: Run typecheck to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — errors in `lib/orderService.test.ts` (calls omitting the 3rd/4th arg) and in `app/api/orders/[id]/items/route.ts` / `app/api/orders/[id]/items/[itemId]/route.ts` (passing `session?.role`, typed `Role | undefined`, where `Role` is now required).

- [ ] **Step 3: Fix `lib/orderService.test.ts` call sites**

Replace the `orderService.removeOrderItem` describe block (originally lines 371-468) with:

```typescript
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

    await expect(removeOrderItem('missing', 'oi1', 'staff')).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is not Pending', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }, { id: 'oi2', orderId: 'o1' }],
    } as never)

    await expect(removeOrderItem('o1', 'oi1', 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the item does not belong to the order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(pendingOrder(['oi1', 'oi2']) as never)

    await expect(removeOrderItem('o1', 'other', 'staff')).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws ConflictError when removing the only remaining item (INV-2)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(pendingOrder(['oi1']) as never)

    await expect(removeOrderItem('o1', 'oi1', 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('deletes the item and returns the reloaded order for a multi-item Pending order', async () => {
    const reloaded = { id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi2', orderId: 'o1' }] }
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce(pendingOrder(['oi1', 'oi2']) as never)
      .mockResolvedValueOnce(reloaded as never)
    vi.mocked(prisma.orderItem.delete).mockResolvedValue({ id: 'oi1' } as never)

    const result = await removeOrderItem('o1', 'oi1', 'staff')

    expect(prisma.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'oi1' } })
    expect(result).toEqual(reloaded)
  })

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
})
```

Replace the `orderService.addOrderItem` describe block (originally lines 501-612) with:

```typescript
describe('orderService.addOrderItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws ValidationError for a non-positive-integer quantity', async () => {
    await expect(addOrderItem('o1', 'm1', 0, 'staff')).rejects.toThrow(ValidationError)
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(addOrderItem('missing', 'm1', 1, 'staff')).rejects.toThrow(NotFoundError)
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

    await expect(addOrderItem('o1', 'missing', 1, 'staff')).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the menu item is sold out', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Fries', price: new Prisma.Decimal('4.00'), available: false, archived: false, createdAt: new Date() },
    ] as never)

    await expect(addOrderItem('o1', 'm1', 1, 'staff')).rejects.toThrow(ConflictError)
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

    const result = await addOrderItem('o1', 'm1', 2, 'staff')

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

    const result = await addOrderItem('o1', 'm1', 1, 'staff')

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

Replace the `orderService.updateOrderItemQuantity` describe block (originally lines 614-673) with:

```typescript
describe('orderService.updateOrderItemQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws ValidationError for a non-positive-integer quantity', async () => {
    await expect(updateOrderItemQuantity('o1', 'oi1', 0, 'staff')).rejects.toThrow(ValidationError)
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(updateOrderItemQuantity('missing', 'oi1', 2, 'staff')).rejects.toThrow(NotFoundError)
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

    await expect(updateOrderItemQuantity('o1', 'other', 2, 'staff')).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.update).not.toHaveBeenCalled()
  })

  it('updates the quantity for a Pending order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi1', quantity: 1 }] } as never)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi1', quantity: 3 }] } as never)

    const result = await updateOrderItemQuantity('o1', 'oi1', 3, 'staff')

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

- [ ] **Step 4: Update the POST items route to require staff/admin**

Replace `app/api/orders/[id]/items/route.ts` entirely with:

```typescript
import { NextResponse } from 'next/server'
import { addOrderItem } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireApiRole('staff')
    const { id } = await context.params
    const body = await request.json()

    if (typeof body.menuItemId !== 'string' || body.menuItemId.trim() === '') {
      throw new ValidationError('menuItemId is required')
    }
    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new ValidationError('quantity must be a positive integer')
    }

    const order = await addOrderItem(id, body.menuItemId, body.quantity, session.role)
    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 5: Update the DELETE/PATCH item routes to require staff/admin**

Replace `app/api/orders/[id]/items/[itemId]/route.ts` entirely with:

```typescript
import { NextResponse } from 'next/server'
import { removeOrderItem, updateOrderItemQuantity } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireApiRole('staff')
    const { id, itemId } = await context.params
    await removeOrderItem(id, itemId, session.role)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireApiRole('staff')
    const { id, itemId } = await context.params
    const body = await request.json()

    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new ValidationError('quantity must be a positive integer')
    }

    const order = await updateOrderItemQuantity(id, itemId, body.quantity, session.role)
    return NextResponse.json(order, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 6: Update the POST items route test**

Replace `app/api/orders/[id]/items/route.test.ts` entirely with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  addOrderItem: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { addOrderItem } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'

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
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 201 with the updated order on success', async () => {
    vi.mocked(addOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)

    const res = await POST(makeRequest({ menuItemId: 'm1', quantity: 2 }), makeContext('o1'))

    expect(res.status).toBe(201)
    expect(addOrderItem).toHaveBeenCalledWith('o1', 'm1', 2, 'staff')
  })

  it('passes the session role through to the service call', async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(addOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [] } as never)

    await POST(makeRequest({ menuItemId: 'm1', quantity: 1 }), makeContext('o1'))

    expect(addOrderItem).toHaveBeenCalledWith('o1', 'm1', 1, 'admin')
  })

  it('returns 403 when the caller is not staff or admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makeRequest({ menuItemId: 'm1', quantity: 1 }), makeContext('o1'))

    expect(res.status).toBe(403)
    expect(addOrderItem).not.toHaveBeenCalled()
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

- [ ] **Step 7: Update the DELETE/PATCH item route test**

Replace `app/api/orders/[id]/items/[itemId]/route.test.ts` entirely with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE, PATCH } from './route'
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  removeOrderItem: vi.fn(),
  updateOrderItemQuantity: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { removeOrderItem, updateOrderItemQuantity } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'

function makeContext(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1/items/oi1', { method: 'DELETE' })
}

describe('DELETE /api/orders/[id]/items/[itemId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 204 on successful removal', async () => {
    vi.mocked(removeOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)

    const res = await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(res.status).toBe(204)
    expect(removeOrderItem).toHaveBeenCalledWith('o1', 'oi1', 'staff')
  })

  it('passes the session role through to the service call', async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(removeOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [] } as never)

    await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(removeOrderItem).toHaveBeenCalledWith('o1', 'oi1', 'admin')
  })

  it('returns 403 when the caller is not staff or admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(res.status).toBe(403)
    expect(removeOrderItem).not.toHaveBeenCalled()
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
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 200 with the updated order on success', async () => {
    vi.mocked(updateOrderItemQuantity).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)

    const res = await PATCH(makePatchRequest({ quantity: 3 }), makeContext('o1', 'oi1'))

    expect(res.status).toBe(200)
    expect(updateOrderItemQuantity).toHaveBeenCalledWith('o1', 'oi1', 3, 'staff')
  })

  it('passes the session role through to the service call', async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(updateOrderItemQuantity).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [] } as never)

    await PATCH(makePatchRequest({ quantity: 2 }), makeContext('o1', 'oi1'))

    expect(updateOrderItemQuantity).toHaveBeenCalledWith('o1', 'oi1', 2, 'admin')
  })

  it('returns 403 when the caller is not staff or admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makePatchRequest({ quantity: 2 }), makeContext('o1', 'oi1'))

    expect(res.status).toBe(403)
    expect(updateOrderItemQuantity).not.toHaveBeenCalled()
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

- [ ] **Step 8: Run typecheck and targeted tests to verify they pass**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

Run: `npx vitest run lib/orderService.test.ts app/api/orders/[id]/items/route.test.ts "app/api/orders/[id]/items/[itemId]/route.test.ts"`
Expected: PASS, all tests green

- [ ] **Step 9: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts app/api/orders/[id]/items/route.ts app/api/orders/[id]/items/route.test.ts "app/api/orders/[id]/items/[itemId]/route.ts" "app/api/orders/[id]/items/[itemId]/route.test.ts"
git commit -m "feat: require staff/admin session for order-item mutation routes"
```

---

### Task 2: Remove the customer-facing remove-item UI

**Files:**
- Modify: `app/order/[id]/OrderTicket.tsx`
- Modify: `app/order/[id]/OrderTicket.test.tsx`
- Modify: `app/order/[id]/TicketCard.tsx`
- Modify: `app/order/[id]/TicketCard.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 (this task only touches the customer-facing UI layer; the API routes it calls — `DELETE /api/orders/:id` for cancel — are untouched).
- Produces: `TicketCard`'s `TicketCardLine` type with no `onRemove` field — no other file in the codebase consumes `TicketCard` besides `OrderTicket.tsx`/`OrderStatusPoller.tsx` (confirmed via grep), so this is a safe, fully-contained removal.

- [ ] **Step 1: Write the failing tests**

Replace `app/order/[id]/TicketCard.test.tsx` entirely with:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TicketCard } from './TicketCard'

const items = [
  { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 },
  { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 2 },
]

describe('TicketCard', () => {
  it('renders the heading, each line, and the total', () => {
    render(<TicketCard heading="Order #47 confirmed" customerName={null} items={items} statusNote="Note text" />)

    expect(screen.getByText('Order #47 confirmed')).toBeInTheDocument()
    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('x1')).toBeInTheDocument()
    expect(screen.getByText('$12.50')).toBeInTheDocument()
    expect(screen.getByText('Fries')).toBeInTheDocument()
    expect(screen.getByText('x2')).toBeInTheDocument()
    expect(screen.getByText('$8.00')).toBeInTheDocument()
    expect(screen.getByText('$20.50')).toBeInTheDocument()
    expect(screen.getByText('Note text')).toBeInTheDocument()
  })

  it('shows the customer name when provided', () => {
    render(<TicketCard heading="Order #47" customerName="Edward" items={items} statusNote="Note" />)
    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })

  it('renders no name line when customerName is null', () => {
    render(<TicketCard heading="Order #47" customerName={null} items={items} statusNote="Note" />)
    expect(screen.queryByText(/^For /)).not.toBeInTheDocument()
  })

  it('never renders a remove button for any line', () => {
    render(<TicketCard heading="Order #47" customerName={null} items={items} statusNote="Note" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders footer content between the total and the status note', () => {
    render(
      <TicketCard
        heading="Order #47"
        customerName={null}
        items={items}
        statusNote="Note text"
        footer={<button type="button">Cancel order</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })
})
```

Replace `app/order/[id]/OrderTicket.test.tsx` entirely with:

```typescript
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
    customerName: null,
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

  it('never renders a remove button, even for a multi-line order', () => {
    render(<OrderTicket order={twoLineOrder()} />)

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('shows guidance to contact staff for changes, alongside the cancel action', () => {
    render(<OrderTicket order={twoLineOrder()} />)

    expect(screen.getByText('Contact staff to change your order, or cancel it below.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('opens a confirm dialog on Cancel order and does not call the API until confirmed', async () => {
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))

    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()
    expect(apiClient.del).not.toHaveBeenCalled()
  })

  it('cancels the order via the order DELETE route and refreshes once the dialog is confirmed', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1')
    expect(refresh).toHaveBeenCalled()
  })

  it('shows an inline alert when a mutation is rejected (e.g. staff just confirmed)', async () => {
    vi.mocked(apiClient.del).mockRejectedValue(new ApiError('CONFLICT', 'Order is Confirmed, not Pending'))
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This order was just confirmed by staff and can no longer be changed.',
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('shows the customer name when the order has one', () => {
    render(
      <OrderTicket
        order={{
          id: 'o1',
          orderNumber: 7,
          customerName: 'Edward',
          items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
        }}
      />,
    )

    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })

  it('renders no name line when the order has none', () => {
    render(
      <OrderTicket
        order={{
          id: 'o1',
          orderNumber: 7,
          customerName: null,
          items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
        }}
      />,
    )

    expect(screen.queryByText(/^For /)).not.toBeInTheDocument()
  })

  it('does not claim the order is confirmed while it is still Pending', () => {
    render(<OrderTicket order={twoLineOrder()} />)

    expect(screen.getByText('Order #47')).toBeInTheDocument()
    expect(screen.queryByText(/confirmed/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/order/[id]/TicketCard.test.tsx" "app/order/[id]/OrderTicket.test.tsx"`
Expected: FAIL — `TicketCard.test.tsx`'s "never renders a remove button for any line" fails (current code still renders one for multi-line items with `onRemove`); `OrderTicket.test.tsx`'s "never renders a remove button" and "shows guidance to contact staff" fail against the current Remove-button markup and old status copy.

- [ ] **Step 3: Implement — drop `onRemove` from `TicketCard`**

Replace `app/order/[id]/TicketCard.tsx` entirely with:

```typescript
import type { ReactNode } from 'react'

export type TicketCardLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export function TicketCard({
  heading,
  customerName,
  items,
  statusNote,
  footer,
}: {
  heading: string
  customerName: string | null
  items: TicketCardLine[]
  statusNote: string
  footer?: ReactNode
}) {
  const total = items.reduce((sum, item) => sum + Number(item.priceSnapshot) * item.quantity, 0)

  return (
    <section aria-label="Order confirmation" className="ticket">
      <div className="ticket__stub">
        <span className="ticket__label">Your ticket</span>
        <h2 className="ticket__number">{heading}</h2>
        {customerName && <p className="ticket__customer">For {customerName}</p>}
        <ul className="ticket__lines">
          {items.map((item) => (
            <li key={item.id} className="ticket__line">
              <span className="ticket__line-name">{item.nameSnapshot}</span>
              <span className="ticket__line-qty">x{item.quantity}</span>
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
        {footer}
        <p className="ticket__note">{statusNote}</p>
      </div>
    </section>
  )
}
```

Note: `busy` is dropped too — it existed solely to disable the now-removed remove buttons. Check `app/order/[id]/OrderStatusPoller.tsx` for any other `busy`/`onRemove` reference before finishing this step — if it passes either prop through, drop that too.

- [ ] **Step 4: Implement — drop the remove-item path from `OrderTicket`**

Replace `app/order/[id]/OrderTicket.tsx` entirely with:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { TicketCard } from './TicketCard'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'

export type OrderTicketLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export type OrderTicketProps = {
  id: string
  orderNumber: number
  customerName: string | null
  items: OrderTicketLine[]
}

const CONFLICT_MESSAGE = 'This order was just confirmed by staff and can no longer be changed.'
const CONFIRM_EXIT_MS = 200

export function OrderTicket({ order }: { order: OrderTicketProps }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    }
  }, [])

  async function cancelOrder() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.del(`/api/orders/${order.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? CONFLICT_MESSAGE : 'Something went wrong. Please try again.')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function openConfirm() {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => {
      setConfirmClosing(false)
    }, CONFIRM_EXIT_MS)
  }

  function handleConfirm() {
    closeConfirm()
    cancelOrder()
  }

  return (
    <>
      <TicketCard
        heading={`Order #${order.orderNumber}`}
        customerName={order.customerName}
        items={order.items}
        statusNote="Contact staff to change your order, or cancel it below."
        footer={
          <>
            {error && (
              <p role="alert" className="ticket__error">
                {error}
              </p>
            )}
            <button
              type="button"
              className="ticket__cancel"
              disabled={busy}
              onClick={openConfirm}
            >
              Cancel order
            </button>
          </>
        }
      />
      {(confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title="Cancel this order?"
          message="Staff won't receive it, and this can't be undone."
          confirmLabel="Yes, cancel"
          busy={busy}
          exiting={!confirmOpen}
          onConfirm={handleConfirm}
          onClose={closeConfirm}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run "app/order/[id]/TicketCard.test.tsx" "app/order/[id]/OrderTicket.test.tsx"`
Expected: PASS, all tests green

Also check `app/order/[id]/OrderStatusPoller.test.tsx` and `app/order/[id]/page.test.tsx` still pass (they render `OrderTicket`/`TicketCard` indirectly):

Run: `npx vitest run "app/order/[id]"`
Expected: PASS

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "app/order/[id]/OrderTicket.tsx" "app/order/[id]/OrderTicket.test.tsx" "app/order/[id]/TicketCard.tsx" "app/order/[id]/TicketCard.test.tsx"
git commit -m "feat: remove customer-facing item removal from the order confirmation page"
```

---

### Task 3: Update domain model and trackers, final verification

**Files:**
- Modify: `docs/design/02-domain-model.md`
- Modify: `docs/design/07-epic-map.md`
- Modify: `ISSUES.md`
- Modify: `BUILD_STATUS.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Narrow `INV-4` and update the flow prose**

In `docs/design/02-domain-model.md`, replace:

```markdown
- `INV-4` OrderItems may be added, removed, or have their quantity changed **only while** the parent Order's `fulfillmentStatus = Pending`.
```

with:

```markdown
- `INV-4` OrderItems may be added, removed, or have their quantity changed **only by Staff or Owner/Admin**, and **only while** the parent Order's `fulfillmentStatus = Pending`. The customer's only self-service action on their own order after submission is cancellation (`INV-6`).
```

Replace:

```markdown
*Customer:* scans table QR (identifies the table) → views menu (available items only shown as orderable; sold-out items visible but disabled) → adds items to cart, may add/remove/adjust freely → submits order → order is created as **Pending**, customer receives an order number → customer may still cancel the order or remove items **while it remains Pending** → pays at the cashier (before or after staff confirmation, per this venue's flow) → once staff confirms, the order is locked from customer-side changes.
```

with:

```markdown
*Customer:* scans table QR (identifies the table) → views menu (available items only shown as orderable; sold-out items visible but disabled) → adds items to cart, may add/remove/adjust freely before submitting → submits order → order is created as **Pending**, customer receives an order number → customer may still cancel the order **while it remains Pending**, but item-level changes (add/remove/adjust) are staff/admin-only from this point on → pays at the cashier (before or after staff confirmation, per this venue's flow) → once staff confirms, the order is locked from customer-side changes entirely (no cancel either).
```

- [ ] **Step 2: Remove the now-implemented backlog placeholder**

In `docs/design/07-epic-map.md`, delete this bullet entirely from the "Backlog epics (placeholders)" list:

```markdown
- **Restrict customer self-editing of a Pending order to cancel-only; item adjustment becomes dashboard/staff-only** — today (Story 6, `INV-4`) a customer can add/remove items and change quantities on their own order from `/order/[id]` while it's `Pending`, in addition to staff/admin editing the same order from the dashboard (Stories 12/13). Raised 2026-07-09 during wrap-up of the business-hours/staff-sold-out feature: narrow the customer's own capability to cancel-only once an order is submitted — all item-level adjustment (add/remove/change quantity) would move to being exclusively a staff/admin dashboard action. **Would require revisiting `INV-4`** (currently: OrderItems may be added/removed/quantity-changed by customer *or* staff while Pending) — this is a genuine invariant change, not an additive UI tweak on `/order/[id]`, so it needs the usual sign-off before implementation. Motivation not yet articulated — capture the *why* before building (e.g. reducing customer-caused order churn at the kitchen, simplifying the customer-facing flow to match "submit → confirm → pay", or an accountability/support concern about customers repeatedly changing orders after submission).
```

- [ ] **Step 3: Move `ISSUE-13` to Resolved**

In `ISSUES.md`, remove this row from the Open table:

```markdown
| ISSUE-13 | The new `POST`/`PATCH` routes on `/api/orders/:id/items[/:itemId]` (staff/admin order-item editing) accept an unauthenticated caller on a Pending order, same as the pre-existing anonymous `DELETE` routes — but this is new capability, not just new exposure of an old one: before this branch, an anonymous holder of an order id could only *remove* items or cancel; now they can also *add* items and change quantities, with no upper bound, on any Pending order whose opaque id they possess | Staff/admin order-edits feature, final whole-branch review of `docs/superpowers/plans/2026-07-09-staff-admin-order-edits.md` | Minor | Won't fix now — deliberate, spec-documented choice (design spec Decision 3): order ids are opaque cuids, not sequential/guessable, so the realistic risk is griefing-only, not data exposure, and matches the trust model the existing anonymous item-removal/cancel routes already established. Revisit only if order ids ever become guessable/sequential, or if per-session customer auth is added. |
```

Add this row to the Resolved table (matching the existing column order `ID | Summary | Found in | Root cause | Fix / commit`):

```markdown
| ISSUE-13 | Anonymous callers could add/remove/adjust-quantity items on any Pending order whose opaque id they possessed | Staff/admin order-edits feature, final whole-branch review of `docs/superpowers/plans/2026-07-09-staff-admin-order-edits.md` | The three items routes read the caller's role via non-redirecting `peekSession()` but never required one — any role (including none) was accepted | Story 18 restricted this capability to staff/admin only rather than hardening the anonymous path: `POST`/`PATCH`/`DELETE` on `/api/orders/:id/items[/:itemId]` now call `requireApiRole('staff')`, returning `403` for anyone else; the customer-facing remove-item button was also removed from `/order/[id]` as it's no longer backed by a reachable capability |
```

- [ ] **Step 4: Mark Story 18 Done in `BUILD_STATUS.md`**

Change the Story 18 row's status from `Building` to `Done`.

- [ ] **Step 5: Run the full verification suite**

Run: `npm run test`
Expected: PASS, all tests green, no failures

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run lint`
Expected: PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add docs/design/02-domain-model.md docs/design/07-epic-map.md ISSUES.md BUILD_STATUS.md
git commit -m "docs: narrow INV-4 to staff/admin-only item edits, close ISSUE-13, mark Story 18 Done"
```
