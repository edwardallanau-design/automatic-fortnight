import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NotFoundError, ConflictError, ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  createOrder: vi.fn(),
  listOrders: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createOrder, listOrders } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function makeGetRequest(query = ''): Request {
  return new Request(`http://localhost/api/orders${query}`)
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
    expect(createOrder).toHaveBeenCalledWith('t1', [{ menuItemId: 'm1', quantity: 2 }], undefined)
  })

  it('forwards a trimmed customerName to the service', async () => {
    vi.mocked(createOrder).mockResolvedValue({ id: 'o1' } as never)

    const res = await POST(
      makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }], customerName: '  Edward  ' }),
    )

    expect(res.status).toBe(201)
    expect(createOrder).toHaveBeenCalledWith('t1', [{ menuItemId: 'm1', quantity: 1 }], 'Edward')
  })

  it('returns 400 when customerName exceeds 50 characters after trimming', async () => {
    const res = await POST(
      makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }], customerName: 'x'.repeat(51) }),
    )

    expect(res.status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('returns 400 when customerName is not a string', async () => {
    const res = await POST(
      makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }], customerName: 42 }),
    )

    expect(res.status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
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
    expect(listOrders).toHaveBeenCalledWith({ status: 'Pending', paymentStatus: undefined, date: undefined })
  })

  it('returns 200 with an unfiltered call when no status is given', async () => {
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest())

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: undefined, paymentStatus: undefined, date: undefined })
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

  it('returns 200 with a paymentStatus filter combined with status', async () => {
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest('?status=confirmed&paymentStatus=unpaid'))

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: 'Confirmed', paymentStatus: 'Unpaid', date: undefined })
  })

  it('returns 200 with a date=today filter', async () => {
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest('?status=confirmed&paymentStatus=paid&date=today'))

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: 'Confirmed', paymentStatus: 'Paid', date: 'today' })
  })

  it('returns 400 for an invalid paymentStatus value', async () => {
    const res = await GET(makeGetRequest('?paymentStatus=bogus'))

    expect(res.status).toBe(400)
    expect(listOrders).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid date value', async () => {
    const res = await GET(makeGetRequest('?date=yesterday'))

    expect(res.status).toBe(400)
    expect(listOrders).not.toHaveBeenCalled()
  })
})
