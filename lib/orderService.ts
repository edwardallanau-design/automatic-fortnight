import type { Order, OrderItem } from '@prisma/client'
import { prisma } from './prisma'
import { getTableOrThrow } from './tableService'
import { findMenuItemsByIds } from './menuService'
import { NotFoundError, ConflictError, ValidationError } from './errors'

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
