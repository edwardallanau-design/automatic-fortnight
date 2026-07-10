import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ConflictError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  setPaymentChoiceCounter: vi.fn(),
}))

import { setPaymentChoiceCounter } from '@/lib/orderService'

function makeContext(id = 'o1') {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/orders/:id/payment-choice/counter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with the updated order on success', async () => {
    const updated = { id: 'o1', paymentChoice: 'Counter', items: [] }
    vi.mocked(setPaymentChoiceCounter).mockResolvedValue(updated as never)

    const res = await POST(new Request('http://localhost/api/orders/o1/payment-choice/counter', { method: 'POST' }), makeContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.paymentChoice).toBe('Counter')
    expect(setPaymentChoiceCounter).toHaveBeenCalledWith('o1')
  })

  it('returns 409 when a choice was already made', async () => {
    vi.mocked(setPaymentChoiceCounter).mockRejectedValue(new ConflictError('Payment choice has already been made for this order'))

    const res = await POST(new Request('http://localhost/api/orders/o1/payment-choice/counter', { method: 'POST' }), makeContext())

    expect(res.status).toBe(409)
  })
})
