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
