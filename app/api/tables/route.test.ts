import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ConflictError, ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/tableService', () => ({
  createTable: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createTable } from '@/lib/tableService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/tables', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/tables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 201 with the created table on success', async () => {
    const created = { id: 't1', number: 12, createdAt: new Date() }
    vi.mocked(createTable).mockResolvedValue(created as never)

    const res = await POST(makeRequest({ number: 12 }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.number).toBe(12)
    expect(createTable).toHaveBeenCalledWith(12)
  })

  it('returns 409 when the table number already exists', async () => {
    vi.mocked(createTable).mockRejectedValue(new ConflictError('Table number 12 already exists'))

    const res = await POST(makeRequest({ number: 12 }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('CONFLICT')
  })

  it('returns 400 when number is missing', async () => {
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(createTable).not.toHaveBeenCalled()
  })

  it('returns 400 when number is not an integer', async () => {
    const res = await POST(makeRequest({ number: 'twelve' }))

    expect(res.status).toBe(400)
    expect(createTable).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makeRequest({ number: 12 }))

    expect(res.status).toBe(403)
    expect(createTable).not.toHaveBeenCalled()
  })
})
