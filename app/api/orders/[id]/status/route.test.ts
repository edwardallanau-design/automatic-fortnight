import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  getOrderById: vi.fn(),
}))

import { getOrderById } from '@/lib/orderService'

function makeRequest(id: string): Request {
  return new Request(`http://localhost/api/orders/${id}/status`)
}

describe('GET /api/orders/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with just the fulfillmentStatus', async () => {
    vi.mocked(getOrderById).mockResolvedValue({ fulfillmentStatus: 'Confirmed' } as never)

    const res = await GET(makeRequest('o1'), { params: Promise.resolve({ id: 'o1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ fulfillmentStatus: 'Confirmed' })
    expect(getOrderById).toHaveBeenCalledWith('o1')
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(getOrderById).mockRejectedValue(new NotFoundError('Order not found'))

    const res = await GET(makeRequest('missing'), { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
  })
})
