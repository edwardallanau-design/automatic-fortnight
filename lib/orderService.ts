import type { Order, OrderItem, Table, FulfillmentStatus, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getTableOrThrow } from './tableService'
import { findMenuItemsByIds } from './menuService'
import { getVenueSettings } from './venueSettingsService'
import { getActivePaymentMethodById } from './paymentMethodService'
import { NotFoundError, ConflictError, ValidationError } from './errors'
import type { Role } from './types'

export type CartItemInput = { menuItemId: string; quantity: number }
export type OrderWithItems = Order & { items: OrderItem[] }

export async function createOrder(
  tableId: string,
  items: CartItemInput[],
  customerName?: string,
): Promise<OrderWithItems> {
  const settings = await getVenueSettings()
  if (!settings.acceptingOrders) {
    throw new ConflictError('Not accepting orders right now')
  }

  if (items.length === 0) {
    throw new ValidationError('Cart must contain at least one item')
  }

  await getTableOrThrow(tableId)

  const menuItems = await findMenuItemsByIds(items.map((item) => item.menuItemId))
  const menuItemsById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]))

  for (const item of items) {
    const menuItem = menuItemsById.get(item.menuItemId)
    if (!menuItem) {
      throw new NotFoundError(`Menu item ${item.menuItemId} not found`)
    }
    if (!menuItem.available) {
      throw new ConflictError(`${menuItem.name} is no longer available`)
    }
  }

  return prisma.order.create({
    data: {
      tableId,
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
    include: { items: true },
  })
}

export type OrderWithItemsAndTable = Order & { items: OrderItem[]; table: Table }

export async function listOrders(
  options: { status?: FulfillmentStatus; paymentStatus?: PaymentStatus; date?: 'today' } = {},
): Promise<OrderWithItemsAndTable[]> {
  const where: Prisma.OrderWhereInput = {}
  if (options.status) where.fulfillmentStatus = options.status
  if (options.paymentStatus) where.paymentStatus = options.paymentStatus
  if (options.date === 'today') {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startOfNextDay = new Date(startOfDay)
    startOfNextDay.setDate(startOfNextDay.getDate() + 1)
    where.confirmedAt = { gte: startOfDay, lt: startOfNextDay }
  }

  return prisma.order.findMany({
    where,
    include: { items: true, table: true },
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
    include: { items: true },
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
    include: { items: true },
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
    include: { items: true },
  })
}

function assertOrderEditable(order: { fulfillmentStatus: FulfillmentStatus }, actorRole?: Role): void {
  const adminOverride = order.fulfillmentStatus === 'Confirmed' && actorRole === 'admin'
  if (order.fulfillmentStatus !== 'Pending' && !adminOverride) {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }
}

export async function removeOrderItem(orderId: string, orderItemId: string, actorRole: Role): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
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
    include: { items: true },
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
    include: { items: true },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  assertOrderEditable(order, actorRole)

  const [menuItem] = await findMenuItemsByIds([menuItemId])
  if (!menuItem) {
    throw new NotFoundError('Menu item not found')
  }
  if (!menuItem.available) {
    throw new ConflictError(`${menuItem.name} is no longer available`)
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
    include: { items: true },
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
    include: { items: true },
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
    include: { items: true },
  }) as Promise<OrderWithItems>
}

export async function getOrderById(orderId: string): Promise<OrderWithItemsAndTable> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, table: true },
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
    include: { items: true },
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
    include: { items: true },
  })
}
