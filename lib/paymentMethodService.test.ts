import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  createPaymentMethod,
  updatePaymentMethod,
  listPaymentMethods,
  getActivePaymentMethodById,
} from './paymentMethodService'
import { NotFoundError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    paymentMethod: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

describe('paymentMethodService.createPaymentMethod', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a payment method with name and optional accountInfo', async () => {
    const created = { id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: '0917xxxxxxx', createdAt: new Date() }
    vi.mocked(prisma.paymentMethod.create).mockResolvedValue(created as never)

    const result = await createPaymentMethod('GCash', { accountInfo: '0917xxxxxxx' })

    expect(result).toEqual(created)
    expect(prisma.paymentMethod.create).toHaveBeenCalledWith({
      data: { name: 'GCash', accountInfo: '0917xxxxxxx', qrImageUrl: undefined },
    })
  })
})

describe('paymentMethodService.updatePaymentMethod', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates provided fields and returns the updated method', async () => {
    const updated = { id: 'p1', name: 'GCash Updated', active: true, qrImageUrl: null, accountInfo: null, createdAt: new Date() }
    vi.mocked(prisma.paymentMethod.update).mockResolvedValue(updated as never)

    const result = await updatePaymentMethod('p1', { name: 'GCash Updated' })

    expect(result).toEqual(updated)
    expect(prisma.paymentMethod.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { name: 'GCash Updated' },
    })
  })

  it('throws NotFoundError when the method does not exist', async () => {
    vi.mocked(prisma.paymentMethod.update).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.8.0',
      }) as never,
    )

    await expect(updatePaymentMethod('missing', { active: false })).rejects.toThrow(NotFoundError)
  })
})

describe('paymentMethodService.listPaymentMethods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all methods ordered by name when activeOnly is not set', async () => {
    const methods = [{ id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: null, createdAt: new Date() }]
    vi.mocked(prisma.paymentMethod.findMany).mockResolvedValue(methods as never)

    const result = await listPaymentMethods()

    expect(result).toEqual(methods)
    expect(prisma.paymentMethod.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { name: 'asc' },
    })
  })

  it('filters to active methods when activeOnly is true', async () => {
    vi.mocked(prisma.paymentMethod.findMany).mockResolvedValue([] as never)

    await listPaymentMethods({ activeOnly: true })

    expect(prisma.paymentMethod.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { name: 'asc' },
    })
  })
})

describe('paymentMethodService.getActivePaymentMethodById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the method when it exists and is active', async () => {
    const method = { id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: null, createdAt: new Date() }
    vi.mocked(prisma.paymentMethod.findUnique).mockResolvedValue(method as never)

    const result = await getActivePaymentMethodById('p1')

    expect(result).toEqual(method)
  })

  it('returns null when the method is inactive', async () => {
    const method = { id: 'p1', name: 'GCash', active: false, qrImageUrl: null, accountInfo: null, createdAt: new Date() }
    vi.mocked(prisma.paymentMethod.findUnique).mockResolvedValue(method as never)

    const result = await getActivePaymentMethodById('p1')

    expect(result).toBeNull()
  })

  it('returns null when the method does not exist', async () => {
    vi.mocked(prisma.paymentMethod.findUnique).mockResolvedValue(null as never)

    const result = await getActivePaymentMethodById('missing')

    expect(result).toBeNull()
  })
})
