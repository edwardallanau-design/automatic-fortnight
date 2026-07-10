import { Prisma } from '@prisma/client'
import type { PaymentMethod } from '@prisma/client'
import { prisma } from './prisma'
import { NotFoundError } from './errors'

export async function createPaymentMethod(
  name: string,
  data: { accountInfo?: string; qrImageUrl?: string } = {},
): Promise<PaymentMethod> {
  return prisma.paymentMethod.create({
    data: { name, accountInfo: data.accountInfo, qrImageUrl: data.qrImageUrl },
  })
}

export async function updatePaymentMethod(
  id: string,
  data: { name?: string; accountInfo?: string; qrImageUrl?: string; active?: boolean },
): Promise<PaymentMethod> {
  try {
    return await prisma.paymentMethod.update({ where: { id }, data })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundError('Payment method not found')
    }
    throw error
  }
}

export async function listPaymentMethods(options: { activeOnly?: boolean } = {}): Promise<PaymentMethod[]> {
  return prisma.paymentMethod.findMany({
    where: options.activeOnly ? { active: true } : undefined,
    orderBy: { name: 'asc' },
  })
}

export async function getActivePaymentMethodById(id: string): Promise<PaymentMethod | null> {
  const method = await prisma.paymentMethod.findUnique({ where: { id } })
  return method && method.active ? method : null
}
