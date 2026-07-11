import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError, ConflictError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/branchService', () => ({
  renameBranch: vi.fn(),
  setBranchAcceptingOrders: vi.fn(),
  setBranchPassword: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { renameBranch, setBranchAcceptingOrders, setBranchPassword } from '@/lib/branchService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/branches/b1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

const branch = { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }

describe('PATCH /api/branches/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('renames the branch when name is provided', async () => {
    vi.mocked(renameBranch).mockResolvedValue({ ...branch, name: 'Main Street' } as never)

    const res = await PATCH(makeRequest({ name: 'Main Street' }), makeContext('b1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Main Street')
    expect(renameBranch).toHaveBeenCalledWith('b1', 'Main Street')
    expect(setBranchAcceptingOrders).not.toHaveBeenCalled()
    expect(setBranchPassword).not.toHaveBeenCalled()
  })

  it('toggles acceptingOrders when provided', async () => {
    vi.mocked(setBranchAcceptingOrders).mockResolvedValue({ ...branch, acceptingOrders: false } as never)

    const res = await PATCH(makeRequest({ acceptingOrders: false }), makeContext('b1'))

    expect(res.status).toBe(200)
    expect(setBranchAcceptingOrders).toHaveBeenCalledWith('b1', false)
    expect(renameBranch).not.toHaveBeenCalled()
  })

  it('rotates the password when provided', async () => {
    vi.mocked(setBranchPassword).mockResolvedValue(undefined)

    const res = await PATCH(makeRequest({ password: 'new-pw' }), makeContext('b1'))

    expect(res.status).toBe(200)
    expect(setBranchPassword).toHaveBeenCalledWith('b1', 'new-pw')
  })

  it('applies multiple fields in one request', async () => {
    vi.mocked(renameBranch).mockResolvedValue({ ...branch, name: 'Main Street' } as never)
    vi.mocked(setBranchAcceptingOrders).mockResolvedValue({ ...branch, name: 'Main Street', acceptingOrders: false } as never)

    const res = await PATCH(makeRequest({ name: 'Main Street', acceptingOrders: false }), makeContext('b1'))

    expect(res.status).toBe(200)
    expect(renameBranch).toHaveBeenCalledWith('b1', 'Main Street')
    expect(setBranchAcceptingOrders).toHaveBeenCalledWith('b1', false)
  })

  it('returns 400 when the body has none of the recognized fields', async () => {
    const res = await PATCH(makeRequest({}), makeContext('b1'))

    expect(res.status).toBe(400)
    expect(renameBranch).not.toHaveBeenCalled()
  })

  it('returns 400 when name is present but blank', async () => {
    const res = await PATCH(makeRequest({ name: '  ' }), makeContext('b1'))

    expect(res.status).toBe(400)
    expect(renameBranch).not.toHaveBeenCalled()
  })

  it('returns 409 when the new password collides', async () => {
    vi.mocked(setBranchPassword).mockRejectedValue(new ConflictError('This password is already in use by another branch or the admin login'))

    const res = await PATCH(makeRequest({ password: 'taken-pw' }), makeContext('b1'))

    expect(res.status).toBe(409)
  })

  it('returns 404 when the branch does not exist', async () => {
    vi.mocked(renameBranch).mockRejectedValue(new NotFoundError('Branch not found'))

    const res = await PATCH(makeRequest({ name: 'Ghost' }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makeRequest({ name: 'Main Street' }), makeContext('b1'))

    expect(res.status).toBe(403)
    expect(renameBranch).not.toHaveBeenCalled()
  })
})
