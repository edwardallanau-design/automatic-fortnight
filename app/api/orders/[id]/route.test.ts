import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { ConflictError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  cancelOrder: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  peekSession: vi.fn(),
}))

import { cancelOrder } from '@/lib/orderService'
import { peekSession } from '@/lib/authGuard'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1', { method: 'DELETE' })
}

describe('DELETE /api/orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(peekSession).mockResolvedValue(null)
  })

  it('returns 204 on successful cancel, attributing an anonymous caller as customer', async () => {
    vi.mocked(cancelOrder).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Cancelled', items: [] } as never)

    const res = await DELETE(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(204)
    expect(cancelOrder).toHaveBeenCalledWith('o1', 'customer')
  })

  it('attributes a staff session as staff, not customer', async () => {
    vi.mocked(peekSession).mockResolvedValue({ role: 'staff' })
    vi.mocked(cancelOrder).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Cancelled', items: [] } as never)

    const res = await DELETE(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(204)
    expect(cancelOrder).toHaveBeenCalledWith('o1', 'staff')
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
