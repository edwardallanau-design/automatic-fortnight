import { Prisma } from '@prisma/client'
import type { Category } from '@prisma/client'
import { prisma } from './prisma'
import { NotFoundError, ValidationError } from './errors'

export async function listCategories(): Promise<Category[]> {
  return prisma.category.findMany({ orderBy: { sortOrder: 'asc' } })
}

export async function createCategory(name: string): Promise<Category> {
  const last = await prisma.category.findFirst({ orderBy: { sortOrder: 'desc' } })
  const sortOrder = last ? last.sortOrder + 1 : 0
  return prisma.category.create({ data: { name, sortOrder } })
}

export async function renameCategory(id: string, name: string): Promise<Category> {
  try {
    return await prisma.category.update({ where: { id }, data: { name } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundError('Category not found')
    }
    throw error
  }
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const categories = await prisma.category.findMany()
  const existingIds = new Set(categories.map((category) => category.id))
  const uniqueOrdered = new Set(orderedIds)
  const idSetMatches =
    orderedIds.length === categories.length &&
    uniqueOrdered.size === orderedIds.length &&
    orderedIds.every((id) => existingIds.has(id))
  if (!idSetMatches) {
    throw new ValidationError('orderedIds must contain each existing category id exactly once')
  }
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index } })),
  )
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    await prisma.category.delete({ where: { id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundError('Category not found')
    }
    throw error
  }
}
