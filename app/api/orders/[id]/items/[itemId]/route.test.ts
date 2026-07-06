import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { ConflictError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  removeOrderItem: vi.fn(),
}))

import { removeOrderItem } from '@/lib/orderService'

function makeContext(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/orders/o1/items/oi1', { method: 'DELETE' })
}

describe('DELETE /api/orders/[id]/items/[itemId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 204 on successful removal', async () => {
    vi.mocked(removeOrderItem).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending', items: [] } as never)

    const res = await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(res.status).toBe(204)
    expect(removeOrderItem).toHaveBeenCalledWith('o1', 'oi1')
  })

  it('returns 404 when the order or item does not exist', async () => {
    vi.mocked(removeOrderItem).mockRejectedValue(new NotFoundError('Order item not found'))

    const res = await DELETE(makeRequest(), makeContext('o1', 'missing'))

    expect(res.status).toBe(404)
  })

  it('returns 409 when removing the last item or the order is not Pending', async () => {
    vi.mocked(removeOrderItem).mockRejectedValue(new ConflictError('Cannot remove the last item; cancel the order instead'))

    const res = await DELETE(makeRequest(), makeContext('o1', 'oi1'))

    expect(res.status).toBe(409)
  })
})
