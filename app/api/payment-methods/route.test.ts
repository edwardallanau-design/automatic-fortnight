import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/paymentMethodService', () => ({
  createPaymentMethod: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createPaymentMethod } from '@/lib/paymentMethodService'
import { requireApiRole } from '@/lib/authGuard'

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/payment-methods', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/payment-methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 201 with the created method on success', async () => {
    const created = { id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: null, createdAt: new Date() }
    vi.mocked(createPaymentMethod).mockResolvedValue(created as never)

    const res = await POST(makePostRequest({ name: 'GCash' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('GCash')
    expect(createPaymentMethod).toHaveBeenCalledWith('GCash', { accountInfo: undefined })
  })

  it('trims whitespace from name and accountInfo', async () => {
    const created = { id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: '0917x', createdAt: new Date() }
    vi.mocked(createPaymentMethod).mockResolvedValue(created as never)

    await POST(makePostRequest({ name: '  GCash  ', accountInfo: ' 0917x ' }))

    expect(createPaymentMethod).toHaveBeenCalledWith('GCash', { accountInfo: '0917x' })
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makePostRequest({}))

    expect(res.status).toBe(400)
    expect(createPaymentMethod).not.toHaveBeenCalled()
  })

  it('returns 400 when accountInfo is not a string', async () => {
    const res = await POST(makePostRequest({ name: 'GCash', accountInfo: 5 }))

    expect(res.status).toBe(400)
    expect(createPaymentMethod).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makePostRequest({ name: 'GCash' }))

    expect(res.status).toBe(403)
    expect(createPaymentMethod).not.toHaveBeenCalled()
  })
})
