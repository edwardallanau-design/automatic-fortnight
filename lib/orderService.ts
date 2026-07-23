import type { Order, OrderItem, OrderingPoint, Branch, FulfillmentStatus, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getOrderingPointOrThrow } from './orderingPointService'
import { getBranchOrThrow } from './branchService'
import { findMenuItemsByIds, listSoldOutMenuItemIds } from './menuService'
import { getActivePaymentMethodById } from './paymentMethodService'
import { NotFoundError, ConflictError, SoldOutError, ValidationError } from './errors'
import type { Role } from './types'

export type CartItemInput = { menuItemId: string; quantity: number }
export type OrderWithItems = Order & { items: OrderItem[] }

// OrderItem has no field that reflects insertion order except this one. id is a random UUID
// (not time-ordered); a DateTime default(now()) was tried first and doesn't work either --
// createOrder inserts every line in one batch inside a single transaction, so they all get the
// *identical* millisecond timestamp, leaving ties broken by Prisma's unordered default result
// order, which visibly reshuffled on every quantity/add/remove mutation (whichever row an UPDATE
// touched moved to the end). `sequence` is a DB-assigned autoincrement, guaranteed strictly
// increasing per row even within the same transaction/batch insert, so ties are impossible.
// Shared so every `items` include in this file uses the same explicit order.
const ITEMS_OLDEST_FIRST = { orderBy: { sequence: 'asc' as const } }

export async function createOrder(
  orderingPointId: string,
  items: CartItemInput[],
  customerName?: string,
): Promise<OrderWithItems> {
  if (items.length === 0) {
    throw new ValidationError('Cart must contain at least one item')
  }

  const orderingPoint = await getOrderingPointOrThrow(orderingPointId)
  const branch = await getBranchOrThrow(orderingPoint.branchId)
  if (!branch.acceptingOrders) {
    throw new ConflictError('This branch is not accepting orders right now')
  }

  const menuItems = await findMenuItemsByIds(items.map((item) => item.menuItemId))
  const menuItemsById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]))
  const soldOutIds = await listSoldOutMenuItemIds(branch.id)

  for (const item of items) {
    const menuItem = menuItemsById.get(item.menuItemId)
    if (!menuItem) {
      throw new NotFoundError(`Menu item ${item.menuItemId} not found`)
    }
    if (soldOutIds.has(menuItem.id)) {
      throw new SoldOutError(`${menuItem.name} is no longer available`)
    }
  }

  return prisma.order.create({
    data: {
      orderingPointId,
      branchId: branch.id,
      customerName: customerName?.trim() || null,
      items: {
        create: items.map((item) => {
          const menuItem = menuItemsById.get(item.menuItemId)!
          return {
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            nameSnapshot: menuItem.name,
            priceSnapshot: menuItem.price,
          }
        }),
      },
    },
    include: { items: ITEMS_OLDEST_FIRST },
  })
}

export type OrderWithItemsAndOrderingPoint = Order & { items: OrderItem[]; orderingPoint: OrderingPoint }
export type OrderWithItemsOrderingPointAndBranch = OrderWithItemsAndOrderingPoint & { branch: Branch }

export async function listOrders(
  options: { status?: FulfillmentStatus; paymentStatus?: PaymentStatus; date?: 'today'; branchId?: string } = {},
): Promise<OrderWithItemsOrderingPointAndBranch[]> {
  const where: Prisma.OrderWhereInput = {}
  if (options.status) where.fulfillmentStatus = options.status
  if (options.paymentStatus) where.paymentStatus = options.paymentStatus
  if (options.branchId) where.branchId = options.branchId
  if (options.date === 'today') {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startOfNextDay = new Date(startOfDay)
    startOfNextDay.setDate(startOfNextDay.getDate() + 1)
    where.confirmedAt = { gte: startOfDay, lt: startOfNextDay }
  }

  return prisma.order.findMany({
    where,
    include: { items: ITEMS_OLDEST_FIRST, orderingPoint: true, branch: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function confirmOrder(orderId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.fulfillmentStatus !== 'Pending') {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { fulfillmentStatus: 'Confirmed', confirmedAt: new Date() },
    include: { items: ITEMS_OLDEST_FIRST },
  })
}

export async function setPaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus },
    include: { items: ITEMS_OLDEST_FIRST },
  })
}

export async function cancelOrder(orderId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.fulfillmentStatus !== 'Pending') {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { fulfillmentStatus: 'Cancelled' },
    include: { items: ITEMS_OLDEST_FIRST },
  })
}

function assertOrderEditable(
  order: { fulfillmentStatus: FulfillmentStatus; paymentStatus: PaymentStatus },
  actorRole?: Role,
): void {
  const adminOverride = order.fulfillmentStatus === 'Confirmed' && actorRole === 'admin'
  if (order.fulfillmentStatus !== 'Pending' && !adminOverride) {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }
  // INV-16: once paymentStatus = Paid, only Owner/Admin may still change item contents — staff
  // must revert to Unpaid (INV-9) first, so the total never silently outruns what was collected.
  if (order.paymentStatus === 'Paid' && actorRole !== 'admin') {
    throw new ConflictError('This order is marked Paid. Revert it to Unpaid to change items.')
  }
}

export async function removeOrderItem(orderId: string, orderItemId: string, actorRole: Role): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: ITEMS_OLDEST_FIRST },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  assertOrderEditable(order, actorRole)
  if (!order.items.some((item) => item.id === orderItemId)) {
    throw new NotFoundError('Order item not found')
  }
  if (order.items.length === 1) {
    throw new ConflictError('Cannot remove the last item; cancel the order instead')
  }

  await prisma.orderItem.delete({ where: { id: orderItemId } })

  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: ITEMS_OLDEST_FIRST },
  }) as Promise<OrderWithItems>
}

export async function addOrderItem(
  orderId: string,
  menuItemId: string,
  quantity: number,
  actorRole: Role,
): Promise<OrderWithItems> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError('quantity must be a positive integer')
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: ITEMS_OLDEST_FIRST },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  assertOrderEditable(order, actorRole)

  const [menuItem] = await findMenuItemsByIds([menuItemId])
  if (!menuItem) {
    throw new NotFoundError('Menu item not found')
  }
  const soldOutIds = await listSoldOutMenuItemIds(order.branchId)
  if (soldOutIds.has(menuItem.id)) {
    throw new SoldOutError(`${menuItem.name} is no longer available`)
  }

  const existingLine = order.items.find((item) => item.menuItemId === menuItemId)
  if (existingLine) {
    await prisma.orderItem.update({
      where: { id: existingLine.id },
      data: { quantity: existingLine.quantity + quantity },
    })
  } else {
    await prisma.orderItem.create({
      data: {
        orderId,
        menuItemId,
        quantity,
        nameSnapshot: menuItem.name,
        priceSnapshot: menuItem.price,
      },
    })
  }

  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: ITEMS_OLDEST_FIRST },
  }) as Promise<OrderWithItems>
}

export async function updateOrderItemQuantity(
  orderId: string,
  orderItemId: string,
  quantity: number,
  actorRole: Role,
): Promise<OrderWithItems> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError('quantity must be a positive integer')
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: ITEMS_OLDEST_FIRST },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  assertOrderEditable(order, actorRole)
  if (!order.items.some((item) => item.id === orderItemId)) {
    throw new NotFoundError('Order item not found')
  }

  await prisma.orderItem.update({ where: { id: orderItemId }, data: { quantity } })

  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: ITEMS_OLDEST_FIRST },
  }) as Promise<OrderWithItems>
}

export async function getOrderById(orderId: string): Promise<OrderWithItemsAndOrderingPoint> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: ITEMS_OLDEST_FIRST, orderingPoint: true },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  return order
}

export async function setPaymentChoiceCounter(orderId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.paymentChoice !== 'None') {
    throw new ConflictError('Payment choice has already been made for this order')
  }
  if (order.fulfillmentStatus === 'Cancelled') {
    throw new ConflictError('Order is Cancelled')
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { paymentChoice: 'Counter' },
    include: { items: ITEMS_OLDEST_FIRST },
  })
}

export async function setPaymentChoiceOnline(
  orderId: string,
  paymentMethodId: string,
  reference: string,
): Promise<OrderWithItems> {
  if (typeof reference !== 'string' || reference.trim() === '') {
    throw new ValidationError('reference is required')
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.paymentChoice !== 'None') {
    throw new ConflictError('Payment choice has already been made for this order')
  }
  if (order.fulfillmentStatus === 'Cancelled') {
    throw new ConflictError('Order is Cancelled')
  }

  const method = await getActivePaymentMethodById(paymentMethodId)
  if (!method) {
    throw new ConflictError('Selected payment method is no longer available')
  }

  return prisma.order.update({
    where: { id: orderId },
    data: {
      paymentChoice: 'Online',
      paymentMethodId: method.id,
      paymentMethodNameSnapshot: method.name,
      paymentReference: reference.trim(),
    },
    include: { items: ITEMS_OLDEST_FIRST },
  })
}
