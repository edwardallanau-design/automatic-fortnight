import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  getOrderEvents: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { getOrderEvents } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1/events')
}

describe('GET /api/orders/[id]/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 200 with the events in sequence order', async () => {
    const events = [
      { id: 'e1', orderId: 'o1', action: 'created', actorRole: 'customer', payload: null, createdAt: new Date().toISOString(), sequence: 1 },
      { id: 'e2', orderId: 'o1', action: 'confirmed', actorRole: 'staff', payload: null, createdAt: new Date().toISOString(), sequence: 2 },
    ]
    vi.mocked(getOrderEvents).mockResolvedValue(events as never)

    const res = await GET(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].action).toBe('created')
    expect(getOrderEvents).toHaveBeenCalledWith('o1')
  })

  it('returns an empty array (not 404) for an order with no events', async () => {
    vi.mocked(getOrderEvents).mockResolvedValue([] as never)

    const res = await GET(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns 403 when the caller is not staff or admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await GET(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(403)
    expect(getOrderEvents).not.toHaveBeenCalled()
  })
})
