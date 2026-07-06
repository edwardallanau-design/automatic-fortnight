import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  setPaymentStatus: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { setPaymentStatus } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/o1/pay', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/orders/[id]/pay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 200 with the updated order when marking Paid', async () => {
    const updated = { id: 'o1', paymentStatus: 'Paid', fulfillmentStatus: 'Pending', items: [] }
    vi.mocked(setPaymentStatus).mockResolvedValue(updated as never)

    const res = await PATCH(makeRequest({ paymentStatus: 'Paid' }), makeContext('o1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.paymentStatus).toBe('Paid')
    expect(setPaymentStatus).toHaveBeenCalledWith('o1', 'Paid', 'staff')
  })

  it('returns 400 when paymentStatus is missing', async () => {
    const res = await PATCH(makeRequest({}), makeContext('o1'))

    expect(res.status).toBe(400)
    expect(setPaymentStatus).not.toHaveBeenCalled()
  })

  it('returns 400 when paymentStatus is an invalid value', async () => {
    const res = await PATCH(makeRequest({ paymentStatus: 'Refunded' }), makeContext('o1'))

    expect(res.status).toBe(400)
    expect(setPaymentStatus).not.toHaveBeenCalled()
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(setPaymentStatus).mockRejectedValue(new NotFoundError('Order not found'))

    const res = await PATCH(makeRequest({ paymentStatus: 'Paid' }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 403 when staff attempts to revert Paid to Unpaid', async () => {
    vi.mocked(setPaymentStatus).mockRejectedValue(new ForbiddenError('Only admin may revert payment status to Unpaid'))

    const res = await PATCH(makeRequest({ paymentStatus: 'Unpaid' }), makeContext('o1'))

    expect(res.status).toBe(403)
  })

  it('returns 200 when admin reverts Paid to Unpaid', async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
    const updated = { id: 'o1', paymentStatus: 'Unpaid', fulfillmentStatus: 'Pending', items: [] }
    vi.mocked(setPaymentStatus).mockResolvedValue(updated as never)

    const res = await PATCH(makeRequest({ paymentStatus: 'Unpaid' }), makeContext('o1'))

    expect(res.status).toBe(200)
    expect(setPaymentStatus).toHaveBeenCalledWith('o1', 'Unpaid', 'admin')
  })

  it('returns 403 when the caller is not staff or admin at all', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makeRequest({ paymentStatus: 'Paid' }), makeContext('o1'))

    expect(res.status).toBe(403)
    expect(setPaymentStatus).not.toHaveBeenCalled()
  })
})
