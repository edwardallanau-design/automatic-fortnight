import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { GET, POST } from './route'
import { ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/menuService', () => ({
  createMenuItem: vi.fn(),
  listMenuItems: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createMenuItem, listMenuItems } from '@/lib/menuService'
import { requireApiRole } from '@/lib/authGuard'

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/menu-items', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('GET /api/menu-items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 200 with the list for a staff caller', async () => {
    const items = [{ id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() }]
    vi.mocked(listMenuItems).mockResolvedValue(items as never)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('Burger')
  })

  it('returns 403 when unauthenticated', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await GET()

    expect(res.status).toBe(403)
  })
})

describe('POST /api/menu-items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 201 with the created item on success', async () => {
    const created = { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() }
    vi.mocked(createMenuItem).mockResolvedValue(created as never)

    const res = await POST(makePostRequest({ name: 'Burger', price: 12.5 }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Burger')
    expect(createMenuItem).toHaveBeenCalledWith('Burger', expect.any(Prisma.Decimal))
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makePostRequest({ price: 12.5 }))

    expect(res.status).toBe(400)
    expect(createMenuItem).not.toHaveBeenCalled()
  })

  it('returns 400 when price is missing', async () => {
    const res = await POST(makePostRequest({ name: 'Burger' }))

    expect(res.status).toBe(400)
    expect(createMenuItem).not.toHaveBeenCalled()
  })

  it('returns 400 when price is not a positive number', async () => {
    const res = await POST(makePostRequest({ name: 'Burger', price: -5 }))

    expect(res.status).toBe(400)
    expect(createMenuItem).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makePostRequest({ name: 'Burger', price: 12.5 }))

    expect(res.status).toBe(403)
    expect(createMenuItem).not.toHaveBeenCalled()
  })

  it('trims whitespace from name before passing to createMenuItem', async () => {
    const created = { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() }
    vi.mocked(createMenuItem).mockResolvedValue(created as never)

    const res = await POST(makePostRequest({ name: '  Burger  ', price: 12.5 }))

    expect(res.status).toBe(201)
    expect(createMenuItem).toHaveBeenCalledWith('Burger', expect.any(Prisma.Decimal))
  })

  it('rejects whitespace-only names', async () => {
    const res = await POST(makePostRequest({ name: '   ', price: 12.5 }))

    expect(res.status).toBe(400)
    expect(createMenuItem).not.toHaveBeenCalled()
  })
})
