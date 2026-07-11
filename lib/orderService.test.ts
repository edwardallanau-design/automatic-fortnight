import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { createOrder, listOrders, confirmOrder, setPaymentStatus, cancelOrder, removeOrderItem, addOrderItem, updateOrderItemQuantity, getOrderById, setPaymentChoiceCounter, setPaymentChoiceOnline } from './orderService'
import { NotFoundError, ConflictError, ValidationError } from './errors'
import { prisma } from './prisma'
import { getOrderingPointOrThrow } from './orderingPointService'
import { getBranchOrThrow } from './branchService'
import { findMenuItemsByIds, listSoldOutMenuItemIds } from './menuService'
import { getVenueSettings } from './venueSettingsService'
import { getActivePaymentMethodById } from './paymentMethodService'

vi.mock('./prisma', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderItem: {
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('./orderingPointService', () => ({
  getOrderingPointOrThrow: vi.fn(),
}))

vi.mock('./branchService', () => ({
  getBranchOrThrow: vi.fn(),
}))

vi.mock('./menuService', () => ({
  findMenuItemsByIds: vi.fn(),
  listSoldOutMenuItemIds: vi.fn(),
}))

vi.mock('./venueSettingsService', () => ({
  getVenueSettings: vi.fn(),
}))

vi.mock('./paymentMethodService', () => ({
  getActivePaymentMethodById: vi.fn(),
}))

describe('orderService.createOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getOrderingPointOrThrow).mockResolvedValue({ id: 'op1', branchId: 'b1', label: 'Table 5', isCounter: false, createdAt: new Date() } as never)
    vi.mocked(getBranchOrThrow).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() } as never)
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: true, updatedAt: new Date() } as never)
    vi.mocked(listSoldOutMenuItemIds).mockResolvedValue(new Set())
  })

  it('throws ValidationError when items is empty', async () => {
    await expect(createOrder('op1', [])).rejects.toThrow(ValidationError)
    expect(getOrderingPointOrThrow).not.toHaveBeenCalled()
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the venue is not accepting orders', async () => {
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: false, updatedAt: new Date() } as never)

    await expect(
      createOrder('op1', [{ menuItemId: 'm1', quantity: 1 }]),
    ).rejects.toThrow(ConflictError)
    expect(getOrderingPointOrThrow).not.toHaveBeenCalled()
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the branch is not accepting orders', async () => {
    vi.mocked(getBranchOrThrow).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: false, createdAt: new Date() } as never)

    await expect(
      createOrder('op1', [{ menuItemId: 'm1', quantity: 1 }]),
    ).rejects.toThrow(ConflictError)
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the ordering point does not exist', async () => {
    vi.mocked(getOrderingPointOrThrow).mockRejectedValue(new NotFoundError('Ordering point not found'))

    await expect(
      createOrder('missing-op', [{ menuItemId: 'm1', quantity: 1 }]),
    ).rejects.toThrow(NotFoundError)
    expect(findMenuItemsByIds).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when a menu item does not exist', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([])

    await expect(
      createOrder('op1', [{ menuItemId: 'missing', quantity: 1 }]),
    ).rejects.toThrow(NotFoundError)
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('throws ConflictError when a menu item is sold out in this branch', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Fries', price: new Prisma.Decimal('4.00'), archived: false, createdAt: new Date() },
    ] as never)
    vi.mocked(listSoldOutMenuItemIds).mockResolvedValue(new Set(['m1']))

    await expect(
      createOrder('op1', [{ menuItemId: 'm1', quantity: 1 }]),
    ).rejects.toThrow(ConflictError)
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('creates an order with snapshotted name/price for each item and the resolved branchId', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), archived: false, createdAt: new Date() },
    ] as never)
    const created = {
      id: 'o1',
      orderNumber: 1,
      orderingPointId: 'op1',
      branchId: 'b1',
      fulfillmentStatus: 'Pending',
      paymentStatus: 'Unpaid',
      createdAt: new Date(),
      confirmedAt: null,
      items: [
        { id: 'oi1', orderId: 'o1', menuItemId: 'm1', nameSnapshot: 'Burger', priceSnapshot: new Prisma.Decimal('12.50'), quantity: 2 },
      ],
    }
    vi.mocked(prisma.order.create).mockResolvedValue(created as never)

    const result = await createOrder('op1', [{ menuItemId: 'm1', quantity: 2 }])

    expect(result).toEqual(created)
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: {
        orderingPointId: 'op1',
        branchId: 'b1',
        customerName: null,
        items: {
          create: [
            { menuItemId: 'm1', quantity: 2, nameSnapshot: 'Burger', priceSnapshot: new Prisma.Decimal('12.50') },
          ],
        },
      },
      include: { items: true },
    })
  })

  it('persists a trimmed customerName', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), archived: false, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.order.create).mockResolvedValue({} as never)

    await createOrder('op1', [{ menuItemId: 'm1', quantity: 1 }], '  Edward  ')

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerName: 'Edward' }),
      }),
    )
  })

  it('coerces an empty or whitespace-only customerName to null', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), archived: false, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.order.create).mockResolvedValue({} as never)

    await createOrder('op1', [{ menuItemId: 'm1', quantity: 1 }], '   ')

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerName: null }),
      }),
    )
  })
})

describe('orderService.listOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries with a status filter, ordered oldest-first, including items, orderingPoint, and branch', async () => {
    const orders = [
      {
        id: 'o1',
        orderNumber: 1,
        orderingPointId: 'op1',
        branchId: 'b1',
        fulfillmentStatus: 'Pending',
        paymentStatus: 'Unpaid',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        confirmedAt: null,
        items: [],
        orderingPoint: { id: 'op1', branchId: 'b1', label: 'Table 4', isCounter: false, createdAt: new Date() },
        branch: { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      },
    ]
    vi.mocked(prisma.order.findMany).mockResolvedValue(orders as never)

    const result = await listOrders({ status: 'Pending' })

    expect(result).toEqual(orders)
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('omits the where filter when no options are given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders()

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {},
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('queries with a paymentStatus filter combined with status', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Confirmed', paymentStatus: 'Unpaid' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('queries with a same-day confirmedAt range for date=today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T15:30:00.000Z'))
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Confirmed', paymentStatus: 'Paid', date: 'today' })

    const call = vi.mocked(prisma.order.findMany).mock.calls[0][0] as {
      where: { fulfillmentStatus?: string; paymentStatus?: string; confirmedAt?: { gte: Date; lt: Date } }
    }
    expect(call.where.fulfillmentStatus).toBe('Confirmed')
    expect(call.where.paymentStatus).toBe('Paid')
    const { gte, lt } = call.where.confirmedAt!
    expect(lt.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000)
    expect(gte.getTime()).toBeLessThanOrEqual(Date.now())
    expect(lt.getTime()).toBeGreaterThan(Date.now())

    vi.useRealTimers()
  })

  it('omits paymentStatus and confirmedAt from the where clause when not requested', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Pending' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('adds a branchId filter to the where clause when branchId is given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ branchId: 'b2' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { branchId: 'b2' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('combines a branchId filter with status and paymentStatus', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Pending', paymentStatus: 'Unpaid', branchId: 'b2' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending', paymentStatus: 'Unpaid', branchId: 'b2' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('omits the branchId filter when not given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Pending' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending' },
      include: { items: true, orderingPoint: true, branch: true },
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

    await expect(setPaymentStatus('missing', 'Paid')).rejects.toThrow(NotFoundError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('marks an order Paid regardless of fulfillmentStatus', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentStatus: 'Unpaid', fulfillmentStatus: 'Confirmed' } as never)
    const updated = { id: 'o1', paymentStatus: 'Paid', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await setPaymentStatus('o1', 'Paid')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentStatus: 'Paid' },
      include: { items: true },
    })
  })

  it('reverts Paid to Unpaid regardless of caller role', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentStatus: 'Paid', fulfillmentStatus: 'Pending' } as never)
    const updated = { id: 'o1', paymentStatus: 'Unpaid', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await setPaymentStatus('o1', 'Unpaid')

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

describe('orderService.removeOrderItem', () => {
  function pendingOrder(itemIds: string[]) {
    return {
      id: 'o1',
      fulfillmentStatus: 'Pending',
      items: itemIds.map((id) => ({ id, orderId: 'o1' })),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(removeOrderItem('missing', 'oi1', 'staff')).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is not Pending', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }, { id: 'oi2', orderId: 'o1' }],
    } as never)

    await expect(removeOrderItem('o1', 'oi1', 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the item does not belong to the order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(pendingOrder(['oi1', 'oi2']) as never)

    await expect(removeOrderItem('o1', 'other', 'staff')).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('throws ConflictError when removing the only remaining item (INV-2)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(pendingOrder(['oi1']) as never)

    await expect(removeOrderItem('o1', 'oi1', 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('deletes the item and returns the reloaded order for a multi-item Pending order', async () => {
    const reloaded = { id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi2', orderId: 'o1' }] }
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce(pendingOrder(['oi1', 'oi2']) as never)
      .mockResolvedValueOnce(reloaded as never)
    vi.mocked(prisma.orderItem.delete).mockResolvedValue({ id: 'oi1' } as never)

    const result = await removeOrderItem('o1', 'oi1', 'staff')

    expect(prisma.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'oi1' } })
    expect(result).toEqual(reloaded)
  })

  it('allows an admin to remove an item from a Confirmed order', async () => {
    const confirmed = {
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }, { id: 'oi2', orderId: 'o1' }],
    }
    const reloaded = { id: 'o1', fulfillmentStatus: 'Confirmed', items: [{ id: 'oi2', orderId: 'o1' }] }
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce(confirmed as never)
      .mockResolvedValueOnce(reloaded as never)
    vi.mocked(prisma.orderItem.delete).mockResolvedValue({ id: 'oi1' } as never)

    const result = await removeOrderItem('o1', 'oi1', 'admin')

    expect(prisma.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'oi1' } })
    expect(result).toEqual(reloaded)
  })

  it('throws ConflictError when a non-admin actor removes an item from a Confirmed order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }, { id: 'oi2', orderId: 'o1' }],
    } as never)

    await expect(removeOrderItem('o1', 'oi1', 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })

  it('blocks removing the last item from a Confirmed order even for an admin (INV-2)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', orderId: 'o1' }],
    } as never)

    await expect(removeOrderItem('o1', 'oi1', 'admin')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.delete).not.toHaveBeenCalled()
  })
})

describe('orderService.getOrderById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(getOrderById('missing')).rejects.toThrow(NotFoundError)
  })

  it('returns the order with items and orderingPoint', async () => {
    const order = {
      id: 'o1',
      orderNumber: 7,
      orderingPointId: 'op1',
      branchId: 'b1',
      fulfillmentStatus: 'Pending',
      items: [{ id: 'oi1', orderId: 'o1' }],
      orderingPoint: { id: 'op1', branchId: 'b1', label: 'Table 4', isCounter: false, createdAt: new Date() },
    }
    vi.mocked(prisma.order.findUnique).mockResolvedValue(order as never)

    const result = await getOrderById('o1')

    expect(result).toEqual(order)
    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'o1' },
      include: { items: true, orderingPoint: true },
    })
  })
})

describe('orderService.addOrderItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listSoldOutMenuItemIds).mockResolvedValue(new Set())
  })

  it('throws ValidationError for a non-positive-integer quantity', async () => {
    await expect(addOrderItem('o1', 'm1', 0, 'staff')).rejects.toThrow(ValidationError)
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(addOrderItem('missing', 'm1', 1, 'staff')).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the order is Confirmed and the actor is not admin', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      branchId: 'b1',
      fulfillmentStatus: 'Confirmed',
      items: [],
    } as never)

    await expect(addOrderItem('o1', 'm1', 1, 'staff')).rejects.toThrow(ConflictError)
  })

  it('throws NotFoundError when the menu item does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', branchId: 'b1', fulfillmentStatus: 'Pending', items: [] } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([])

    await expect(addOrderItem('o1', 'missing', 1, 'staff')).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the menu item is sold out', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', branchId: 'b1', fulfillmentStatus: 'Pending', items: [] } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Fries', price: new Prisma.Decimal('4.00'), archived: false, createdAt: new Date() },
    ] as never)
    vi.mocked(listSoldOutMenuItemIds).mockResolvedValue(new Set(['m1']))

    await expect(addOrderItem('o1', 'm1', 1, 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.create).not.toHaveBeenCalled()
  })

  it('creates a new line with a snapshot when the item is not already on the order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', branchId: 'b1', fulfillmentStatus: 'Pending', items: [] } as never)
      .mockResolvedValueOnce({
        id: 'o1',
        branchId: 'b1',
        fulfillmentStatus: 'Pending',
        items: [{ id: 'oi1', menuItemId: 'm1', quantity: 2 }],
      } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), archived: false, createdAt: new Date() },
    ] as never)

    const result = await addOrderItem('o1', 'm1', 2, 'staff')

    expect(prisma.orderItem.create).toHaveBeenCalledWith({
      data: { orderId: 'o1', menuItemId: 'm1', quantity: 2, nameSnapshot: 'Burger', priceSnapshot: new Prisma.Decimal('12.50') },
    })
    expect(result).toEqual({
      id: 'o1',
      branchId: 'b1',
      fulfillmentStatus: 'Pending',
      items: [{ id: 'oi1', menuItemId: 'm1', quantity: 2 }],
    })
  })

  it('increments the existing line instead of creating a duplicate when the item is already on the order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({
        id: 'o1',
        branchId: 'b1',
        fulfillmentStatus: 'Pending',
        items: [{ id: 'oi1', menuItemId: 'm1', quantity: 2 }],
      } as never)
      .mockResolvedValueOnce({
        id: 'o1',
        branchId: 'b1',
        fulfillmentStatus: 'Pending',
        items: [{ id: 'oi1', menuItemId: 'm1', quantity: 3 }],
      } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), archived: false, createdAt: new Date() },
    ] as never)

    const result = await addOrderItem('o1', 'm1', 1, 'staff')

    expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: 'oi1' }, data: { quantity: 3 } })
    expect(prisma.orderItem.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: 'o1',
      branchId: 'b1',
      fulfillmentStatus: 'Pending',
      items: [{ id: 'oi1', menuItemId: 'm1', quantity: 3 }],
    })
  })

  it('allows an admin to add an item to a Confirmed order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', branchId: 'b1', fulfillmentStatus: 'Confirmed', items: [] } as never)
      .mockResolvedValueOnce({
        id: 'o1',
        branchId: 'b1',
        fulfillmentStatus: 'Confirmed',
        items: [{ id: 'oi1', menuItemId: 'm1', quantity: 1 }],
      } as never)
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), archived: false, createdAt: new Date() },
    ] as never)

    const result = await addOrderItem('o1', 'm1', 1, 'admin')

    expect(prisma.orderItem.create).toHaveBeenCalled()
    expect(result.fulfillmentStatus).toBe('Confirmed')
  })
})

describe('orderService.updateOrderItemQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws ValidationError for a non-positive-integer quantity', async () => {
    await expect(updateOrderItemQuantity('o1', 'oi1', 0, 'staff')).rejects.toThrow(ValidationError)
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(updateOrderItemQuantity('missing', 'oi1', 2, 'staff')).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the order is Confirmed and the actor is not admin', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Confirmed',
      items: [{ id: 'oi1', quantity: 1 }],
    } as never)

    await expect(updateOrderItemQuantity('o1', 'oi1', 2, 'staff')).rejects.toThrow(ConflictError)
    expect(prisma.orderItem.update).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the item does not belong to the order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o1',
      fulfillmentStatus: 'Pending',
      items: [{ id: 'oi1', quantity: 1 }],
    } as never)

    await expect(updateOrderItemQuantity('o1', 'other', 2, 'staff')).rejects.toThrow(NotFoundError)
    expect(prisma.orderItem.update).not.toHaveBeenCalled()
  })

  it('updates the quantity for a Pending order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi1', quantity: 1 }] } as never)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi1', quantity: 3 }] } as never)

    const result = await updateOrderItemQuantity('o1', 'oi1', 3, 'staff')

    expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: 'oi1' }, data: { quantity: 3 } })
    expect(result).toEqual({ id: 'o1', fulfillmentStatus: 'Pending', items: [{ id: 'oi1', quantity: 3 }] })
  })

  it('allows an admin to update quantity on a Confirmed order', async () => {
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [{ id: 'oi1', quantity: 1 }] } as never)
      .mockResolvedValueOnce({ id: 'o1', fulfillmentStatus: 'Confirmed', items: [{ id: 'oi1', quantity: 2 }] } as never)

    const result = await updateOrderItemQuantity('o1', 'oi1', 2, 'admin')

    expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: 'oi1' }, data: { quantity: 2 } })
    expect(result.items[0].quantity).toBe(2)
  })
})

describe('orderService.setPaymentChoiceCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets paymentChoice to Counter and returns the updated order', async () => {
    const existing = { id: 'o1', paymentChoice: 'None', fulfillmentStatus: 'Pending' }
    const updated = { id: 'o1', paymentChoice: 'Counter', items: [] }
    vi.mocked(prisma.order.findUnique).mockResolvedValue(existing as never)
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await setPaymentChoiceCounter('o1')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentChoice: 'Counter' },
      include: { items: true },
    })
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null as never)

    await expect(setPaymentChoiceCounter('missing')).rejects.toThrow(NotFoundError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('throws ConflictError when a choice has already been made', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentChoice: 'Online', fulfillmentStatus: 'Pending' } as never)

    await expect(setPaymentChoiceCounter('o1')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('throws ConflictError when the order is Cancelled', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentChoice: 'None', fulfillmentStatus: 'Cancelled' } as never)

    await expect(setPaymentChoiceCounter('o1')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })
})

describe('orderService.setPaymentChoiceOnline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets paymentChoice, paymentMethodId, the name snapshot, and reference', async () => {
    const existing = { id: 'o1', paymentChoice: 'None', fulfillmentStatus: 'Pending' }
    const method = { id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: null, createdAt: new Date() }
    const updated = { id: 'o1', paymentChoice: 'Online', items: [] }
    vi.mocked(prisma.order.findUnique).mockResolvedValue(existing as never)
    vi.mocked(getActivePaymentMethodById).mockResolvedValue(method as never)
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await setPaymentChoiceOnline('o1', 'p1', 'TXN123')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: {
        paymentChoice: 'Online',
        paymentMethodId: 'p1',
        paymentMethodNameSnapshot: 'GCash',
        paymentReference: 'TXN123',
      },
      include: { items: true },
    })
  })

  it('throws ValidationError when reference is empty', async () => {
    await expect(setPaymentChoiceOnline('o1', 'p1', '   ')).rejects.toThrow(ValidationError)
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null as never)

    await expect(setPaymentChoiceOnline('missing', 'p1', 'TXN123')).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when a choice has already been made', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentChoice: 'Counter', fulfillmentStatus: 'Pending' } as never)

    await expect(setPaymentChoiceOnline('o1', 'p1', 'TXN123')).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError when the order is Cancelled', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentChoice: 'None', fulfillmentStatus: 'Cancelled' } as never)

    await expect(setPaymentChoiceOnline('o1', 'p1', 'TXN123')).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError when the payment method is missing or inactive', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentChoice: 'None', fulfillmentStatus: 'Pending' } as never)
    vi.mocked(getActivePaymentMethodById).mockResolvedValue(null)

    await expect(setPaymentChoiceOnline('o1', 'p1', 'TXN123')).rejects.toThrow(ConflictError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })
})
