import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/menuService', () => ({
  setMenuItemSoldOut: vi.fn(),
  findMenuItemsByIds: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { setMenuItemSoldOut, findMenuItemsByIds } from '@/lib/menuService'
import { resolveBranchId } from '@/lib/branchService'
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
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff', branchId: 'b1' })
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, archived: false, createdAt: new Date() },
    ] as never)
  })

  it('marks the item sold out in the resolved branch on success', async () => {
    const res = await PATCH(makePatchRequest({ available: false }), makeContext('m1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(setMenuItemSoldOut).toHaveBeenCalledWith('m1', 'b1', true)
    expect(requireApiRole).toHaveBeenCalledWith('staff')
  })

  it('marks the item available in the resolved branch on success', async () => {
    const res = await PATCH(makePatchRequest({ available: true }), makeContext('m1'))

    expect(res.status).toBe(200)
    expect(setMenuItemSoldOut).toHaveBeenCalledWith('m1', 'b1', false)
  })

  it('allows an admin session too, resolving branch via resolveBranchId with body.branchId', async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })

    const res = await PATCH(makePatchRequest({ available: true, branchId: 'b2' }), makeContext('m1'))

    expect(res.status).toBe(200)
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')
  })

  it('returns 400 when available is not a boolean', async () => {
    const res = await PATCH(makePatchRequest({ available: 'nope' }), makeContext('m1'))

    expect(res.status).toBe(400)
    expect(setMenuItemSoldOut).not.toHaveBeenCalled()
  })

  it('returns 404 when the item does not exist', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([])

    const res = await PATCH(makePatchRequest({ available: false }), makeContext('missing'))

    expect(res.status).toBe(404)
    expect(setMenuItemSoldOut).not.toHaveBeenCalled()
  })

  it('returns 403 when there is no valid staff/admin session', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makePatchRequest({ available: false }), makeContext('m1'))

    expect(res.status).toBe(403)
    expect(setMenuItemSoldOut).not.toHaveBeenCalled()
  })
})
