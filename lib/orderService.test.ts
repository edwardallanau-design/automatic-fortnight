import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { createOrder, listOrders, confirmOrder, setPaymentStatus, cancelOrder } from './orderService'
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from './errors'
import { prisma } from './prisma'
import { getTableOrThrow } from './tableService'
import { findMenuItemsByIds } from './menuService'

vi.mock('./prisma', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
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

describe('orderService.listOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries with a status filter, ordered oldest-first, including items and table', async () => {
    const orders = [
      {
        id: 'o1',
        orderNumber: 1,
        tableId: 't1',
        fulfillmentStatus: 'Pending',
        paymentStatus: 'Unpaid',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        confirmedAt: null,
        items: [],
        table: { id: 't1', number: 4, createdAt: new Date() },
      },
    ]
    vi.mocked(prisma.order.findMany).mockResolvedValue(orders as never)

    const result = await listOrders({ status: 'Pending' })

    expect(result).toEqual(orders)
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending' },
      include: { items: true, table: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('omits the where filter when no status is given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders()

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {},
      include: { items: true, table: true },
      orderBy: { createdAt: 'asc' },
    })
  })
})

describe('orderService.confirmOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(confirmOrder('missing')).rejects.toThrow(NotFoundError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is already Confirmed', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed' } as never)

    await expect(confirmOrder('o1')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is Cancelled', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Cancelled' } as never)

    await expect(confirmOrder('o1')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('sets fulfillmentStatus to Confirmed and stamps confirmedAt for a Pending order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending' } as never)
    const updated = { id: 'o1', fulfillmentStatus: 'Confirmed', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await confirmOrder('o1')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { fulfillmentStatus: 'Confirmed', confirmedAt: expect.any(Date) },
      include: { items: true },
    })
  })
})

describe('orderService.setPaymentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(setPaymentStatus('missing', 'Paid', 'staff')).rejects.toThrow(NotFoundError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('allows staff to mark an order Paid regardless of fulfillmentStatus', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentStatus: 'Unpaid', fulfillmentStatus: 'Confirmed' } as never)
    const updated = { id: 'o1', paymentStatus: 'Paid', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await setPaymentStatus('o1', 'Paid', 'staff')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentStatus: 'Paid' },
      include: { items: true },
    })
  })

  it('throws ForbiddenError when staff attempts to revert Paid to Unpaid', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentStatus: 'Paid', fulfillmentStatus: 'Pending' } as never)

    await expect(setPaymentStatus('o1', 'Unpaid', 'staff')).rejects.toThrow(ForbiddenError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('allows admin to revert Paid to Unpaid', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentStatus: 'Paid', fulfillmentStatus: 'Pending' } as never)
    const updated = { id: 'o1', paymentStatus: 'Unpaid', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await setPaymentStatus('o1', 'Unpaid', 'admin')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentStatus: 'Unpaid' },
      include: { items: true },
    })
  })
})

describe('orderService.cancelOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(cancelOrder('missing')).rejects.toThrow(NotFoundError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is already Confirmed', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Confirmed' } as never)

    await expect(cancelOrder('o1')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is already Cancelled', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Cancelled' } as never)

    await expect(cancelOrder('o1')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('sets fulfillmentStatus to Cancelled for a Pending order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', fulfillmentStatus: 'Pending' } as never)
    const updated = { id: 'o1', fulfillmentStatus: 'Cancelled', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await cancelOrder('o1')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { fulfillmentStatus: 'Cancelled' },
      include: { items: true },
    })
  })
})
