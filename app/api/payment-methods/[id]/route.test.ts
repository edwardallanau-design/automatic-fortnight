import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/paymentMethodService', () => ({
  updatePaymentMethod: vi.fn(),
}))

vi.mock('@/lib/blobStorage', () => ({
  uploadQrImage: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { updatePaymentMethod } from '@/lib/paymentMethodService'
import { uploadQrImage } from '@/lib/blobStorage'
import { requireApiRole } from '@/lib/authGuard'

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/payment-methods/p1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function makeContext(id = 'p1') {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/payment-methods/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('updates name/accountInfo/active without touching the image', async () => {
    const updated = { id: 'p1', name: 'GCash', active: false, qrImageUrl: null, accountInfo: '0917x', createdAt: new Date() }
    vi.mocked(updatePaymentMethod).mockResolvedValue(updated as never)

    const res = await PATCH(makePatchRequest({ name: 'GCash', accountInfo: '0917x', active: false }), makeContext())

    expect(res.status).toBe(200)
    expect(updatePaymentMethod).toHaveBeenCalledWith('p1', { name: 'GCash', accountInfo: '0917x', active: false })
    expect(uploadQrImage).not.toHaveBeenCalled()
  })

  it('uploads a qrImage and passes the resulting URL to updatePaymentMethod', async () => {
    vi.mocked(uploadQrImage).mockResolvedValue('https://blob.example/payment-methods/p1.png')
    const updated = { id: 'p1', name: 'GCash', active: true, qrImageUrl: 'https://blob.example/payment-methods/p1.png', accountInfo: null, createdAt: new Date() }
    vi.mocked(updatePaymentMethod).mockResolvedValue(updated as never)

    const res = await PATCH(makePatchRequest({ qrImage: 'data:image/png;base64,abc' }), makeContext())

    expect(res.status).toBe(200)
    expect(uploadQrImage).toHaveBeenCalledWith('p1', 'data:image/png;base64,abc')
    expect(updatePaymentMethod).toHaveBeenCalledWith('p1', { qrImageUrl: 'https://blob.example/payment-methods/p1.png' })
  })

  it('returns 400 when name is provided but empty', async () => {
    const res = await PATCH(makePatchRequest({ name: '   ' }), makeContext())

    expect(res.status).toBe(400)
    expect(updatePaymentMethod).not.toHaveBeenCalled()
  })

  it('returns 400 when active is not a boolean', async () => {
    const res = await PATCH(makePatchRequest({ active: 'yes' }), makeContext())

    expect(res.status).toBe(400)
    expect(updatePaymentMethod).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makePatchRequest({ active: false }), makeContext())

    expect(res.status).toBe(403)
    expect(updatePaymentMethod).not.toHaveBeenCalled()
  })
})
