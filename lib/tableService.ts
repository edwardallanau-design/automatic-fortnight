import { Prisma } from '@prisma/client'
import type { Table } from '@prisma/client'
import { prisma } from './prisma'
import { ConflictError, NotFoundError } from './errors'

export async function createTable(number: number): Promise<Table> {
  try {
    return await prisma.table.create({ data: { number } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`Table number ${number} already exists`)
    }
    throw error
  }
}

export async function getTableOrThrow(id: string): Promise<Table> {
  const table = await prisma.table.findUnique({ where: { id } })
  if (!table) {
    throw new NotFoundError('Table not found')
  }
  return table
}

export async function listTables(): Promise<Table[]> {
  return prisma.table.findMany({ orderBy: { number: 'asc' } })
}
