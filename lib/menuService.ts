import { Prisma } from '@prisma/client'
import type { MenuItem } from '@prisma/client'
import { prisma } from './prisma'
import { NotFoundError } from './errors'

export async function createMenuItem(name: string, price: Prisma.Decimal): Promise<MenuItem> {
  return prisma.menuItem.create({ data: { name, price } })
}

export async function updateMenuItem(
  id: string,
  data: { name?: string; price?: Prisma.Decimal; available?: boolean },
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
