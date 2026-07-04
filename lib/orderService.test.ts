import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { createOrder } from './orderService'
import { NotFoundError, ConflictError, ValidationError } from './errors'
import { prisma } from './prisma'
import { getTableOrThrow } from './tableService'
import { findMenuItemsByIds } from './menuService'

vi.mock('./prisma', () => ({
  prisma: {
    order: {
      create: vi.fn(),
    },
  },
}))

vi.mock('./tableService', () => ({
  getTableOrThrow: vi.fn(),
}))

vi.mock('./menuService', () => ({
  findMenuItemsByIds: vi.fn(),
}))

describe('orderService.createOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTableOrThrow).mockResolvedValue({ id: 't1', number: 5, createdAt: new Date() } as never)
  })

  it('throws ValidationError when items is empty', async () => {
    await expect(createOrder('t1', [])).rejects.toThrow(ValidationError)
    expect(getTableOrThrow).not.toHaveBeenCalled()
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the table does not exist', async () => {
    vi.mocked(getTableOrThrow).mockRejectedValue(new NotFoundError('Table not found'))

    await expect(
      createOrder('missing-table', [{ menuItemId: 'm1', quantity: 1 }]),
    ).rejects.toThrow(NotFoundError)
    expect(findMenuItemsByIds).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when a menu item does not exist', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([])

    await expect(
      createOrder('t1', [{ menuItemId: 'missing', quantity: 1 }]),
    ).rejects.toThrow(NotFoundError)
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('throws ConflictError when a menu item is sold out', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Fries', price: new Prisma.Decimal('4.00'), available: false, archived: false, createdAt: new Date() },
    ] as never)

    await expect(
      createOrder('t1', [{ menuItemId: 'm1', quantity: 1 }]),
    ).rejects.toThrow(ConflictError)
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('creates an order with snapshotted name/price for each item', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() },
    ] as never)
    const created = {
      id: 'o1',
      orderNumber: 1,
      tableId: 't1',
      fulfillmentStatus: 'Pending',
      paymentStatus: 'Unpaid',
      createdAt: new Date(),
      confirmedAt: null,
      items: [
        { id: 'oi1', orderId: 'o1', menuItemId: 'm1', nameSnapshot: 'Burger', priceSnapshot: new Prisma.Decimal('12.50'), quantity: 2 },
      ],
    }
    vi.mocked(prisma.order.create).mockResolvedValue(created as never)

    const result = await createOrder('t1', [{ menuItemId: 'm1', quantity: 2 }])

    expect(result).toEqual(created)
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: {
        tableId: 't1',
        items: {
          create: [
            { menuItemId: 'm1', quantity: 2, nameSnapshot: 'Burger', priceSnapshot: new Prisma.Decimal('12.50') },
          ],
        },
      },
      include: { items: true },
    })
  })
})
