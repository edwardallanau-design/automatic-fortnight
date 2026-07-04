import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NotFoundError, ConflictError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  createOrder: vi.fn(),
}))

import { createOrder } from '@/lib/orderService'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 201 with the created order on success', async () => {
    const created = { id: 'o1', orderNumber: 1, tableId: 't1', fulfillmentStatus: 'Pending', paymentStatus: 'Unpaid', items: [] }
    vi.mocked(createOrder).mockResolvedValue(created as never)

    const res = await POST(makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 2 }] }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.orderNumber).toBe(1)
    expect(createOrder).toHaveBeenCalledWith('t1', [{ menuItemId: 'm1', quantity: 2 }])
  })

  it('returns 400 when tableId is missing', async () => {
    const res = await POST(makeRequest({ items: [{ menuItemId: 'm1', quantity: 1 }] }))

    expect(res.status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('returns 400 when items is an empty array', async () => {
    const res = await POST(makeRequest({ tableId: 't1', items: [] }))

    expect(res.status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('returns 400 when an item has a non-positive quantity', async () => {
    const res = await POST(makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 0 }] }))

    expect(res.status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('returns 400 when an item is missing menuItemId', async () => {
    const res = await POST(makeRequest({ tableId: 't1', items: [{ quantity: 1 }] }))

    expect(res.status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('returns 404 when the service reports an unknown table or menu item', async () => {
    vi.mocked(createOrder).mockRejectedValue(new NotFoundError('Table not found'))

    const res = await POST(makeRequest({ tableId: 'missing', items: [{ menuItemId: 'm1', quantity: 1 }] }))

    expect(res.status).toBe(404)
  })

  it('returns 409 when the service reports a sold-out item', async () => {
    vi.mocked(createOrder).mockRejectedValue(new ConflictError('Fries is no longer available'))

    const res = await POST(makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }] }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('CONFLICT')
  })
})
