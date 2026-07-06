import type { Order, OrderItem, Table, FulfillmentStatus, PaymentStatus } from '@prisma/client'
import { prisma } from './prisma'
import { getTableOrThrow } from './tableService'
import { findMenuItemsByIds } from './menuService'
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from './errors'
import type { Role } from './types'

export type CartItemInput = { menuItemId: string; quantity: number }
export type OrderWithItems = Order & { items: OrderItem[] }

export async function createOrder(tableId: string, items: CartItemInput[]): Promise<OrderWithItems> {
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

export async function listOrders(options: { status?: FulfillmentStatus } = {}): Promise<OrderWithItemsAndTable[]> {
  return prisma.order.findMany({
    where: options.status ? { fulfillmentStatus: options.status } : {},
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

export async function setPaymentStatus(
  orderId: string,
  paymentStatus: PaymentStatus,
  role: Role,
): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (paymentStatus === 'Unpaid' && order.paymentStatus === 'Paid' && role !== 'admin') {
    throw new ForbiddenError('Only admin may revert payment status to Unpaid')
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

export async function removeOrderItem(orderId: string, orderItemId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.fulfillmentStatus !== 'Pending') {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }
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
