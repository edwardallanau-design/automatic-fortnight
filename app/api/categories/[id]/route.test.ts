import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH, DELETE } from './route'
import { ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/categoryService', () => ({
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { renameCategory, deleteCategory } from '@/lib/categoryService'
import { requireApiRole } from '@/lib/authGuard'

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/categories/c1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/categories/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 200 with the renamed category on success', async () => {
    const updated = { id: 'c1', name: 'Beverages', sortOrder: 0, createdAt: new Date() }
    vi.mocked(renameCategory).mockResolvedValue(updated as never)

    const res = await PATCH(makePatchRequest({ name: 'Beverages' }), makeContext('c1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Beverages')
    expect(renameCategory).toHaveBeenCalledWith('c1', 'Beverages')
  })

  it('returns 400 when name is missing', async () => {
    const res = await PATCH(makePatchRequest({}), makeContext('c1'))

    expect(res.status).toBe(400)
    expect(renameCategory).not.toHaveBeenCalled()
  })

  it('returns 404 when the category does not exist', async () => {
    vi.mocked(renameCategory).mockRejectedValue(new NotFoundError('Category not found'))

    const res = await PATCH(makePatchRequest({ name: 'Beverages' }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makePatchRequest({ name: 'Beverages' }), makeContext('c1'))

    expect(res.status).toBe(403)
    expect(renameCategory).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/categories/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 204 on success', async () => {
    vi.mocked(deleteCategory).mockResolvedValue(undefined)

    const res = await DELETE(new Request('http://localhost/api/categories/c1', { method: 'DELETE' }), makeContext('c1'))

    expect(res.status).toBe(204)
    expect(deleteCategory).toHaveBeenCalledWith('c1')
  })

  it('returns 404 when the category does not exist', async () => {
    vi.mocked(deleteCategory).mockRejectedValue(new NotFoundError('Category not found'))

    const res = await DELETE(new Request('http://localhost/api/categories/missing', { method: 'DELETE' }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await DELETE(new Request('http://localhost/api/categories/c1', { method: 'DELETE' }), makeContext('c1'))

    expect(res.status).toBe(403)
    expect(deleteCategory).not.toHaveBeenCalled()
  })
})
