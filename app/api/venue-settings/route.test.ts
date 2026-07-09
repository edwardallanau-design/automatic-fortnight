import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/venueSettingsService', () => ({
  setAcceptingOrders: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { setAcceptingOrders } from '@/lib/venueSettingsService'
import { requireApiRole } from '@/lib/authGuard'

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/venue-settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/venue-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 200 with the updated settings on success', async () => {
    const updated = { id: 'singleton', acceptingOrders: false, updatedAt: new Date() }
    vi.mocked(setAcceptingOrders).mockResolvedValue(updated as never)

    const res = await PATCH(makePatchRequest({ acceptingOrders: false }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.acceptingOrders).toBe(false)
    expect(setAcceptingOrders).toHaveBeenCalledWith(false)
    expect(requireApiRole).toHaveBeenCalledWith('admin')
  })

  it('returns 400 when acceptingOrders is not a boolean', async () => {
    const res = await PATCH(makePatchRequest({ acceptingOrders: 'nope' }))

    expect(res.status).toBe(400)
    expect(setAcceptingOrders).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makePatchRequest({ acceptingOrders: false }))

    expect(res.status).toBe(403)
    expect(setAcceptingOrders).not.toHaveBeenCalled()
  })
})
