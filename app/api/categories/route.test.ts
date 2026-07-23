import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/categoryService', () => ({
  createCategory: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createCategory } from '@/lib/categoryService'
import { requireApiRole } from '@/lib/authGuard'

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 201 with the created category on success', async () => {
    const created = { id: 'c1', name: 'Drinks', sortOrder: 0, createdAt: new Date() }
    vi.mocked(createCategory).mockResolvedValue(created as never)

    const res = await POST(makePostRequest({ name: 'Drinks' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Drinks')
    expect(createCategory).toHaveBeenCalledWith('Drinks')
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makePostRequest({}))

    expect(res.status).toBe(400)
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('rejects whitespace-only names', async () => {
    const res = await POST(makePostRequest({ name: '   ' }))

    expect(res.status).toBe(400)
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('trims whitespace from name before passing to createCategory', async () => {
    const created = { id: 'c1', name: 'Drinks', sortOrder: 0, createdAt: new Date() }
    vi.mocked(createCategory).mockResolvedValue(created as never)

    const res = await POST(makePostRequest({ name: '  Drinks  ' }))

    expect(res.status).toBe(201)
    expect(createCategory).toHaveBeenCalledWith('Drinks')
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makePostRequest({ name: 'Drinks' }))

    expect(res.status).toBe(403)
    expect(createCategory).not.toHaveBeenCalled()
  })
})
