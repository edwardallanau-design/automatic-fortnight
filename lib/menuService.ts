import { Prisma } from '@prisma/client'
import type { MenuItem } from '@prisma/client'
import { prisma } from './prisma'
import { NotFoundError } from './errors'

export async function createMenuItem(name: string, price: Prisma.Decimal): Promise<MenuItem> {
  return prisma.menuItem.create({ data: { name, price } })
}

export async function updateMenuItem(
  id: string,
  data: { name?: string; price?: Prisma.Decimal },
): Promise<MenuItem> {
  try {
    return await prisma.menuItem.update({ where: { id }, data })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundError('Menu item not found')
    }
    throw error
  }
}

export async function archiveMenuItem(id: string): Promise<void> {
  try {
    await prisma.menuItem.update({ where: { id }, data: { archived: true } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundError('Menu item not found')
    }
    throw error
  }
}

export async function listMenuItems(): Promise<MenuItem[]> {
  return prisma.menuItem.findMany({
    where: { archived: false },
    orderBy: { name: 'asc' },
  })
}

export async function findMenuItemsByIds(ids: string[]): Promise<MenuItem[]> {
  return prisma.menuItem.findMany({ where: { id: { in: ids } } })
}

export async function listSoldOutMenuItemIds(branchId: string): Promise<Set<string>> {
  const rows = await prisma.menuItemSoldOut.findMany({
    where: { branchId },
    select: { menuItemId: true },
  })
  return new Set(rows.map((row) => row.menuItemId))
}

export async function setMenuItemSoldOut(menuItemId: string, branchId: string, soldOut: boolean): Promise<void> {
  if (soldOut) {
    await prisma.menuItemSoldOut.upsert({
      where: { menuItemId_branchId: { menuItemId, branchId } },
      update: {},
      create: { menuItemId, branchId },
    })
  } else {
    await prisma.menuItemSoldOut.deleteMany({ where: { menuItemId, branchId } })
  }
}

export async function listMenuItemsWithAvailability(branchId: string): Promise<Array<MenuItem & { available: boolean }>> {
  const [items, soldOutIds] = await Promise.all([listMenuItems(), listSoldOutMenuItemIds(branchId)])
  return items.map((item) => ({ ...item, available: !soldOutIds.has(item.id) }))
}
