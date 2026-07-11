import { Prisma } from '@prisma/client'
import type { OrderingPoint } from '@prisma/client'
import { prisma } from './prisma'
import { ConflictError, NotFoundError } from './errors'

export async function createOrderingPoint(branchId: string, label: string): Promise<OrderingPoint> {
  try {
    return await prisma.orderingPoint.create({ data: { branchId, label } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`"${label}" already exists in this branch`)
    }
    throw error
  }
}

export async function getOrderingPointOrThrow(id: string): Promise<OrderingPoint> {
  const orderingPoint = await prisma.orderingPoint.findUnique({ where: { id } })
  if (!orderingPoint) {
    throw new NotFoundError('Ordering point not found')
  }
  return orderingPoint
}

export async function listOrderingPoints(branchId: string): Promise<OrderingPoint[]> {
  return prisma.orderingPoint.findMany({ where: { branchId }, orderBy: { label: 'asc' } })
}
