import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { createOrderingPoint, getOrderingPointOrThrow, listOrderingPoints } from './orderingPointService'
import { ConflictError, NotFoundError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    orderingPoint: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

describe('orderingPointService.createOrderingPoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the created ordering point', async () => {
    const created = { id: 'op1', branchId: 'b1', label: 'Table 12', isCounter: false, createdAt: new Date() }
    vi.mocked(prisma.orderingPoint.create).mockResolvedValue(created as never)

    const result = await createOrderingPoint('b1', 'Table 12')
    expect(result).toEqual(created)
    expect(prisma.orderingPoint.create).toHaveBeenCalledWith({ data: { branchId: 'b1', label: 'Table 12' } })
  })

  it('throws ConflictError when the label already exists in that branch', async () => {
    vi.mocked(prisma.orderingPoint.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }) as never,
    )

    await expect(createOrderingPoint('b1', 'Table 12')).rejects.toThrow(ConflictError)
  })

  it('rethrows unrelated errors', async () => {
    vi.mocked(prisma.orderingPoint.create).mockRejectedValue(new Error('connection lost'))

    await expect(createOrderingPoint('b1', 'Table 12')).rejects.toThrow('connection lost')
  })
})

describe('orderingPointService.getOrderingPointOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the ordering point when found', async () => {
    const point = { id: 'op1', branchId: 'b1', label: 'Table 12', isCounter: false, createdAt: new Date() }
    vi.mocked(prisma.orderingPoint.findUnique).mockResolvedValue(point as never)

    const result = await getOrderingPointOrThrow('op1')
    expect(result).toEqual(point)
  })

  it('throws NotFoundError when no ordering point matches', async () => {
    vi.mocked(prisma.orderingPoint.findUnique).mockResolvedValue(null)

    await expect(getOrderingPointOrThrow('missing-id')).rejects.toThrow(NotFoundError)
  })
})

describe('orderingPointService.listOrderingPoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ordering points for the given branch, ordered by label', async () => {
    const points = [
      { id: 'op1', branchId: 'b1', label: 'Counter', isCounter: true, createdAt: new Date() },
      { id: 'op2', branchId: 'b1', label: 'Table 1', isCounter: false, createdAt: new Date() },
    ]
    vi.mocked(prisma.orderingPoint.findMany).mockResolvedValue(points as never)

    const result = await listOrderingPoints('b1')
    expect(result).toEqual(points)
    expect(prisma.orderingPoint.findMany).toHaveBeenCalledWith({
      where: { branchId: 'b1' },
      orderBy: { label: 'asc' },
    })
  })
})
