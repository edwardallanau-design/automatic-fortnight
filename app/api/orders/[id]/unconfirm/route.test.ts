import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  unconfirmOrder: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { unconfirmOrder } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1/unconfirm', { method: 'PATCH' })
}

describe('PATCH /api/orders/[id]/unconfirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 200 with the unconfirmed order on success', async () => {
    const unconfirmed = { id: 'o1', fulfillmentStatus: 'Pending', confirmedAt: null, items: [] }
    vi.mocked(unconfirmOrder).mockResolvedValue(unconfirmed as never)

    const res = await PATCH(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fulfillmentStatus).toBe('Pending')
    expect(unconfirmOrder).toHaveBeenCalledWith('o1', 'admin')
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(unconfirmOrder).mockRejectedValue(new NotFoundError('Order not found'))

    const res = await PATCH(makeRequest(), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 409 when the order is not Confirmed', async () => {
    vi.mocked(unconfirmOrder).mockRejectedValue(new ConflictError('Order is Pending, not Confirmed'))

    const res = await PATCH(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(409)
  })

  it('returns 403 when the caller is staff, not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makeRequest(), makeContext('o1'))

    expect(res.status).toBe(403)
    expect(unconfirmOrder).not.toHaveBeenCalled()
    expect(requireApiRole).toHaveBeenCalledWith('admin')
  })
})
