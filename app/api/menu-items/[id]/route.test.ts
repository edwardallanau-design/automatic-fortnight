import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { PATCH, DELETE } from './route'
import { ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/menuService', () => ({
  updateMenuItem: vi.fn(),
  archiveMenuItem: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { updateMenuItem, archiveMenuItem } from '@/lib/menuService'
import { requireApiRole } from '@/lib/authGuard'

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/menu-items/m1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/menu-items/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 200 with the updated item on success', async () => {
    const updated = { id: 'm1', name: 'Cheeseburger', price: new Prisma.Decimal('13.00'), available: true, archived: false, createdAt: new Date() }
    vi.mocked(updateMenuItem).mockResolvedValue(updated as never)

    const res = await PATCH(makePatchRequest({ name: 'Cheeseburger', price: 13 }), makeContext('m1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Cheeseburger')
    expect(updateMenuItem).toHaveBeenCalledWith('m1', { name: 'Cheeseburger', price: expect.any(Prisma.Decimal) })
  })

  it('allows updating only available', async () => {
    const updated = { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: false, archived: false, createdAt: new Date() }
    vi.mocked(updateMenuItem).mockResolvedValue(updated as never)

    const res = await PATCH(makePatchRequest({ available: false }), makeContext('m1'))

    expect(res.status).toBe(200)
    expect(updateMenuItem).toHaveBeenCalledWith('m1', { available: false })
  })

  it('returns 404 when the item does not exist', async () => {
    vi.mocked(updateMenuItem).mockRejectedValue(new NotFoundError('Menu item not found'))

    const res = await PATCH(makePatchRequest({ available: false }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makePatchRequest({ available: false }), makeContext('m1'))

    expect(res.status).toBe(403)
    expect(updateMenuItem).not.toHaveBeenCalled()
  })

  it('trims whitespace from name before passing to updateMenuItem', async () => {
    const updated = { id: 'm1', name: 'Cheeseburger', price: new Prisma.Decimal('13.00'), available: true, archived: false, createdAt: new Date() }
    vi.mocked(updateMenuItem).mockResolvedValue(updated as never)

    const res = await PATCH(makePatchRequest({ name: '  Cheeseburger  ' }), makeContext('m1'))

    expect(res.status).toBe(200)
    expect(updateMenuItem).toHaveBeenCalledWith('m1', { name: 'Cheeseburger' })
  })

  it('rejects whitespace-only names in PATCH', async () => {
    const res = await PATCH(makePatchRequest({ name: '   ' }), makeContext('m1'))

    expect(res.status).toBe(400)
    expect(updateMenuItem).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/menu-items/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 204 on success', async () => {
    vi.mocked(archiveMenuItem).mockResolvedValue(undefined)

    const res = await DELETE(new Request('http://localhost/api/menu-items/m1', { method: 'DELETE' }), makeContext('m1'))

    expect(res.status).toBe(204)
    expect(archiveMenuItem).toHaveBeenCalledWith('m1')
  })

  it('returns 404 when the item does not exist', async () => {
    vi.mocked(archiveMenuItem).mockRejectedValue(new NotFoundError('Menu item not found'))

    const res = await DELETE(new Request('http://localhost/api/menu-items/missing', { method: 'DELETE' }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await DELETE(new Request('http://localhost/api/menu-items/m1', { method: 'DELETE' }), makeContext('m1'))

    expect(res.status).toBe(403)
    expect(archiveMenuItem).not.toHaveBeenCalled()
  })
})
