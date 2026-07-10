import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ConflictError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  setPaymentChoiceOnline: vi.fn(),
}))

import { setPaymentChoiceOnline } from '@/lib/orderService'

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/o1/payment-choice/online', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function makeContext(id = 'o1') {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/orders/:id/payment-choice/online', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with the updated order on success', async () => {
    const updated = { id: 'o1', paymentChoice: 'Online', items: [] }
    vi.mocked(setPaymentChoiceOnline).mockResolvedValue(updated as never)

    const res = await POST(makePostRequest({ paymentMethodId: 'p1', reference: 'TXN123' }), makeContext())

    expect(res.status).toBe(200)
    expect(setPaymentChoiceOnline).toHaveBeenCalledWith('o1', 'p1', 'TXN123')
  })

  it('returns 400 when paymentMethodId is missing', async () => {
    const res = await POST(makePostRequest({ reference: 'TXN123' }), makeContext())

    expect(res.status).toBe(400)
    expect(setPaymentChoiceOnline).not.toHaveBeenCalled()
  })

  it('returns 400 when reference is missing', async () => {
    const res = await POST(makePostRequest({ paymentMethodId: 'p1' }), makeContext())

    expect(res.status).toBe(400)
    expect(setPaymentChoiceOnline).not.toHaveBeenCalled()
  })

  it('returns 409 when the service rejects the choice', async () => {
    vi.mocked(setPaymentChoiceOnline).mockRejectedValue(new ConflictError('Selected payment method is no longer available'))

    const res = await POST(makePostRequest({ paymentMethodId: 'p1', reference: 'TXN123' }), makeContext())

    expect(res.status).toBe(409)
  })
})
