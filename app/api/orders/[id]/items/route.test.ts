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
