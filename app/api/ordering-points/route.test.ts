import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/orderingPointService', () => ({
  createOrderingPoint: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createOrderingPoint } from '@/lib/orderingPointService'
import { resolveBranchId } from '@/lib/branchService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ordering-points', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/ordering-points', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
  })

  it('creates an ordering point in the resolved branch on success', async () => {
    const created = { id: 'op1', branchId: 'b1', label: 'Table 12', isCounter: false, createdAt: new Date() }
    vi.mocked(createOrderingPoint).mockResolvedValue(created as never)

    const res = await POST(makeRequest({ label: 'Table 12' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.label).toBe('Table 12')
    expect(createOrderingPoint).toHaveBeenCalledWith('b1', 'Table 12')
    expect(requireApiRole).toHaveBeenCalledWith('admin')
  })

  it('returns 400 when label is missing or blank', async () => {
    const res = await POST(makeRequest({ label: '  ' }))

    expect(res.status).toBe(400)
    expect(createOrderingPoint).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makeRequest({ label: 'Table 12' }))

    expect(res.status).toBe(403)
    expect(createOrderingPoint).not.toHaveBeenCalled()
  })
})
