import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError, ValidationError } from '@/lib/errors'

vi.mock('@/lib/categoryService', () => ({
  reorderCategories: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { reorderCategories } from '@/lib/categoryService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/categories/reorder', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/categories/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 200 and forwards orderedIds to reorderCategories', async () => {
    vi.mocked(reorderCategories).mockResolvedValue(undefined)

    const res = await PATCH(makeRequest({ orderedIds: ['c2', 'c1'] }))

    expect(res.status).toBe(200)
    expect(reorderCategories).toHaveBeenCalledWith(['c2', 'c1'])
  })

  it('returns 400 when orderedIds is not an array of strings', async () => {
    const res = await PATCH(makeRequest({ orderedIds: [1, 2] }))

    expect(res.status).toBe(400)
    expect(reorderCategories).not.toHaveBeenCalled()
  })

  it('returns 400 when orderedIds is missing', async () => {
    const res = await PATCH(makeRequest({}))

    expect(res.status).toBe(400)
    expect(reorderCategories).not.toHaveBeenCalled()
  })

  it('maps a service ValidationError (stale id set) to 400', async () => {
    vi.mocked(reorderCategories).mockRejectedValue(new ValidationError('orderedIds must contain each existing category id exactly once'))

    const res = await PATCH(makeRequest({ orderedIds: ['c1'] }))

    expect(res.status).toBe(400)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makeRequest({ orderedIds: ['c1'] }))

    expect(res.status).toBe(403)
    expect(reorderCategories).not.toHaveBeenCalled()
  })
})
