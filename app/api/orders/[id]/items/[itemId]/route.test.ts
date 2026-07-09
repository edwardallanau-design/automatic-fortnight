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
