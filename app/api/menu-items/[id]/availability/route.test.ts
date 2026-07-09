import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/menuService', () => ({
  updateMenuItem: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { updateMenuItem } from '@/lib/menuService'
import { requireApiRole } from '@/lib/authGuard'

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/menu-items/m1/availability', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/menu-items/[id]/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 200 with the updated item on success for a staff session', async () => {
    const updated = { id: 'm1', name: 'Burger', available: false }
    vi.mocked(updateMenuItem).mockResolvedValue(updated as never)

    const res = await PATCH(makePatchRequest({ available: false }), makeContext('m1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(updateMenuItem).toHaveBeenCalledWith('m1', { available: false })
    expect(requireApiRole).toHaveBeenCalledWith('staff')
  })

  it('allows an admin session too', async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(updateMenuItem).mockResolvedValue({ id: 'm1', available: true } as never)

    const res = await PATCH(makePatchRequest({ available: true }), makeContext('m1'))

    expect(res.status).toBe(200)
  })

  it('returns 400 when available is not a boolean', async () => {
    const res = await PATCH(makePatchRequest({ available: 'nope' }), makeContext('m1'))

    expect(res.status).toBe(400)
    expect(updateMenuItem).not.toHaveBeenCalled()
  })

  it('returns 404 when the item does not exist', async () => {
    vi.mocked(updateMenuItem).mockRejectedValue(new NotFoundError('Menu item not found'))

    const res = await PATCH(makePatchRequest({ available: false }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 403 when there is no valid staff/admin session', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makePatchRequest({ available: false }), makeContext('m1'))

    expect(res.status).toBe(403)
    expect(updateMenuItem).not.toHaveBeenCalled()
  })
})
