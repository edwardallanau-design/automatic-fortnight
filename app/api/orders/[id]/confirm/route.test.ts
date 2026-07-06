import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  confirmOrder: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { confirmOrder } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1/confirm', { method: 'PATCH' })
}

describe('PATCH /api/orders/[id]/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 200 with the confirmed order on success', async () => {
    const confirmed = { id: 'o1', fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid', items: [] }
    vi.mocked(confirmOrder).mockResolvedValue(confirmed as never)

    const res = await PATCH(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fulfillmentStatus).toBe('Confirmed')
    expect(confirmOrder).toHaveBeenCalledWith('o1')
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(confirmOrder).mockRejectedValue(new NotFoundError('Order not found'))

    const res = await PATCH(makeRequest(), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 409 when the order is not Pending', async () => {
    vi.mocked(confirmOrder).mockRejectedValue(new ConflictError('Order is Confirmed, not Pending'))

    const res = await PATCH(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(409)
  })

  it('returns 403 when the caller is not staff or admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(403)
    expect(confirmOrder).not.toHaveBeenCalled()
  })
})
