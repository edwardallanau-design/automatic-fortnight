import type { Order, OrderItem, OrderingPoint, Branch, FulfillmentStatus, PaymentStatus, OrderEventAction, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getOrderingPointOrThrow } from './orderingPointService'
import { getBranchOrThrow } from './branchService'
import { findMenuItemsByIds, listSoldOutMenuItemIds } from './menuService'
import { getActivePaymentMethodById } from './paymentMethodService'
import { NotFoundError, ConflictError, SoldOutError, ValidationError } from './errors'
import type { Role } from './types'

// INV-17: every order mutation writes its OrderEvent row in the same database transaction as the
// mutation itself, so neither can exist without the other. `mutate` runs inside the transaction and
// returns the actor role plus optional payload alongside its own result -- this is the one pattern
// every mutating service function below copies, so no mutation path can skip the journal write.
export type ActorRole = 'customer' | 'staff' | 'admin'

async function withOrderEvent<T>(
  orderId: string,
  action: OrderEventAction,
  mutate: (tx: Prisma.TransactionClient) => Promise<{ result: T; actorRole: ActorRole; payload?: Prisma.InputJsonValue }>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const { result, actorRole, payload } = await mutate(tx)
    await tx.orderEvent.create({
      data: { orderId, action, actorRole, payload: payload ?? undefined },
    })
    return result
  })
}

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
  actorRole: ActorRole = 'customer',
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

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
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
    await tx.orderEvent.create({
      data: { orderId: order.id, action: 'created', actorRole },
    })
    return order
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

export async function confirmOrder(orderId: string, actorRole: ActorRole): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.fulfillmentStatus !== 'Pending') {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }

  return withOrderEvent(orderId, 'confirmed', async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'Confirmed', confirmedAt: new Date() },
      include: { items: ITEMS_OLDEST_FIRST },
    })
    return { result, actorRole }
  })
}

// The supervisor override (INV-5): returns a Confirmed order to Pending so its contents can be
// corrected under the ordinary Pending rules (INV-4), then re-confirmed. Admin-only -- re-checked
// here even though the route already guards it, since this is the one path that unwinds Confirmed's
// otherwise-permanent lock. Clears confirmedAt so date-scoped "today" counts stay truthful; the
// journal is what preserves the original confirmation time.
export async function unconfirmOrder(orderId: string, actorRole: ActorRole): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.fulfillmentStatus !== 'Confirmed') {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Confirmed`)
  }

  return withOrderEvent(orderId, 'unconfirmed', async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'Pending', confirmedAt: null },
      include: { items: ITEMS_OLDEST_FIRST },
    })
    return { result, actorRole }
  })
}

export async function setPaymentStatus(
  orderId: string,
  paymentStatus: PaymentStatus,
  actorRole: ActorRole,
): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }

  return withOrderEvent(orderId, paymentStatus === 'Paid' ? 'marked_paid' : 'marked_unpaid', async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus },
      include: { items: ITEMS_OLDEST_FIRST },
    })
    return { result, actorRole }
  })
}

export async function cancelOrder(orderId: string, actorRole: ActorRole): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (order.fulfillmentStatus !== 'Pending') {
    throw new ConflictError(`Order is ${order.fulfillmentStatus}, not Pending`)
  }

  return withOrderEvent(orderId, 'cancelled', async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'Cancelled' },
      include: { items: ITEMS_OLDEST_FIRST },
    })
    return { result, actorRole }
  })
}

// INV-5/INV-16: Confirmed orders are locked for every actor, admin included -- the only path to
// changing a Confirmed order's contents is Unconfirm (admin-only, journaled), edit under the
// ordinary Pending rules, then re-confirm. A Paid order is likewise locked for every actor until
// it's reverted to Unpaid (INV-9), so the recorded total can never silently outrun what was
// collected. Neither exception survives for any role -- this function takes no actor role.
function assertOrderEditable(order: { fulfillmentStatus: FulfillmentStatus; paymentStatus: PaymentStatus }): void {
  if (order.fulfillmentStatus !== 'Pending') {
    throw new ConflictError(
      `Order is ${order.fulfillmentStatus}, not Pending. Unconfirm it first to change its items.`,
    )
  }
  if (order.paymentStatus === 'Paid') {
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
  assertOrderEditable(order)
  const removedItem = order.items.find((item) => item.id === orderItemId)
  if (!removedItem) {
    throw new NotFoundError('Order item not found')
  }
  if (order.items.length === 1) {
    throw new ConflictError('Cannot remove the last item; cancel the order instead')
  }

  return withOrderEvent(orderId, 'item_removed', async (tx) => {
    await tx.orderItem.delete({ where: { id: orderItemId } })
    const result = (await tx.order.findUnique({
      where: { id: orderId },
      include: { items: ITEMS_OLDEST_FIRST },
    })) as OrderWithItems
    return {
      result,
      actorRole,
      payload: { name: removedItem.nameSnapshot, quantity: removedItem.quantity },
    }
  })
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
  assertOrderEditable(order)

  const [menuItem] = await findMenuItemsByIds([menuItemId])
  if (!menuItem) {
    throw new NotFoundError('Menu item not found')
  }
  const soldOutIds = await listSoldOutMenuItemIds(order.branchId)
  if (soldOutIds.has(menuItem.id)) {
    throw new SoldOutError(`${menuItem.name} is no longer available`)
  }

  const existingLine = order.items.find((item) => item.menuItemId === menuItemId)

  return withOrderEvent(orderId, 'item_added', async (tx) => {
    if (existingLine) {
      await tx.orderItem.update({
        where: { id: existingLine.id },
        data: { quantity: existingLine.quantity + quantity },
      })
    } else {
      await tx.orderItem.create({
        data: {
          orderId,
          menuItemId,
          quantity,
          nameSnapshot: menuItem.name,
          priceSnapshot: menuItem.price,
        },
      })
    }

    const result = (await tx.order.findUnique({
      where: { id: orderId },
      include: { items: ITEMS_OLDEST_FIRST },
    })) as OrderWithItems
    return { result, actorRole, payload: { name: menuItem.name, quantity } }
  })
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
  assertOrderEditable(order)
  const existingItem = order.items.find((item) => item.id === orderItemId)
  if (!existingItem) {
    throw new NotFoundError('Order item not found')
  }

  return withOrderEvent(orderId, 'item_quantity_changed', async (tx) => {
    await tx.orderItem.update({ where: { id: orderItemId }, data: { quantity } })
    const result = (await tx.order.findUnique({
      where: { id: orderId },
      include: { items: ITEMS_OLDEST_FIRST },
    })) as OrderWithItems
    return {
      result,
      actorRole,
      payload: { name: existingItem.nameSnapshot, previousQuantity: existingItem.quantity, quantity },
    }
  })
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

export type OrderEventListItem = Awaited<ReturnType<typeof prisma.orderEvent.findMany>>[number]

// Per-order history (staff/admin readable): a disputed ticket can be reconstructed from this list.
// Ordered by the DB-assigned sequence, not createdAt -- same ISSUE-32 reasoning as OrderItem.sequence,
// since a mutation and its journal write land in the same transaction and can share a millisecond.
// No backfill: orders that predate this feature simply have no rows here (spec: history starts at deploy).
export async function getOrderEvents(orderId: string): Promise<OrderEventListItem[]> {
  return prisma.orderEvent.findMany({
    where: { orderId },
    orderBy: { sequence: 'asc' },
  })
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

  return withOrderEvent(orderId, 'payment_choice_set', async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: { paymentChoice: 'Counter' },
      include: { items: ITEMS_OLDEST_FIRST },
    })
    return { result, actorRole: 'customer', payload: { paymentChoice: 'Counter' } }
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

  return withOrderEvent(orderId, 'payment_choice_set', async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: {
        paymentChoice: 'Online',
        paymentMethodId: method.id,
        paymentMethodNameSnapshot: method.name,
        paymentReference: reference.trim(),
      },
      include: { items: ITEMS_OLDEST_FIRST },
    })
    return { result, actorRole: 'customer', payload: { paymentChoice: 'Online', paymentMethodName: method.name } }
  })
}
