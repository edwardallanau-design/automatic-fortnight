import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ForbiddenError, ConflictError } from '@/lib/errors'

vi.mock('@/lib/branchService', () => ({
  createBranch: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createBranch } from '@/lib/branchService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/branches', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('creates a branch on success', async () => {
    const created = { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() }
    vi.mocked(createBranch).mockResolvedValue(created as never)

    const res = await POST(makeRequest({ name: 'Downtown', password: 'downtown-pw' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Downtown')
    expect(createBranch).toHaveBeenCalledWith('Downtown', 'downtown-pw')
    expect(requireApiRole).toHaveBeenCalledWith('admin')
  })

  it('returns 400 when name is missing or blank', async () => {
    const res = await POST(makeRequest({ name: '  ', password: 'pw' }))

    expect(res.status).toBe(400)
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('returns 400 when password is missing or blank', async () => {
    const res = await POST(makeRequest({ name: 'Downtown', password: '' }))

    expect(res.status).toBe(400)
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('returns 409 when the password collides with an existing credential', async () => {
    vi.mocked(createBranch).mockRejectedValue(new ConflictError('This password is already in use by another branch or the admin login'))

    const res = await POST(makeRequest({ name: 'Downtown', password: 'taken-pw' }))

    expect(res.status).toBe(409)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makeRequest({ name: 'Downtown', password: 'downtown-pw' }))

    expect(res.status).toBe(403)
    expect(createBranch).not.toHaveBeenCalled()
  })
})
