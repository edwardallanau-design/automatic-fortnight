import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  listCategories,
  createCategory,
  renameCategory,
  reorderCategories,
  deleteCategory,
} from './categoryService'
import { NotFoundError, ValidationError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

describe('categoryService.listCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns categories ordered by sortOrder', async () => {
    const categories = [{ id: 'c1', name: 'Drinks', sortOrder: 0, createdAt: new Date() }]
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)

    const result = await listCategories()

    expect(result).toEqual(categories)
    expect(prisma.category.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } })
  })
})

describe('categoryService.createCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a category appended after the current max sortOrder', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: 'c1',
      name: 'Drinks',
      sortOrder: 2,
      createdAt: new Date(),
    } as never)
    const created = { id: 'c2', name: 'Desserts', sortOrder: 3, createdAt: new Date() }
    vi.mocked(prisma.category.create).mockResolvedValue(created as never)

    const result = await createCategory('Desserts')

    expect(result).toEqual(created)
    expect(prisma.category.findFirst).toHaveBeenCalledWith({ orderBy: { sortOrder: 'desc' } })
    expect(prisma.category.create).toHaveBeenCalledWith({ data: { name: 'Desserts', sortOrder: 3 } })
  })

  it('creates the first category at sortOrder 0 when none exist', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null)
    const created = { id: 'c1', name: 'Drinks', sortOrder: 0, createdAt: new Date() }
    vi.mocked(prisma.category.create).mockResolvedValue(created as never)

    const result = await createCategory('Drinks')

    expect(result).toEqual(created)
    expect(prisma.category.create).toHaveBeenCalledWith({ data: { name: 'Drinks', sortOrder: 0 } })
  })
})

describe('categoryService.renameCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the name and returns the updated category', async () => {
    const updated = { id: 'c1', name: 'Beverages', sortOrder: 0, createdAt: new Date() }
    vi.mocked(prisma.category.update).mockResolvedValue(updated as never)

    const result = await renameCategory('c1', 'Beverages')

    expect(result).toEqual(updated)
    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { name: 'Beverages' } })
  })

  it('throws NotFoundError when the category does not exist', async () => {
    vi.mocked(prisma.category.update).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.8.0',
      }) as never,
    )

    await expect(renameCategory('missing', 'X')).rejects.toThrow(NotFoundError)
  })
})

describe('categoryService.reorderCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const categories = [
    { id: 'c1', name: 'A', sortOrder: 0, createdAt: new Date() },
    { id: 'c2', name: 'B', sortOrder: 1, createdAt: new Date() },
    { id: 'c3', name: 'C', sortOrder: 2, createdAt: new Date() },
  ]

  it('rewrites sortOrder to match the given order, in one transaction', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)
    vi.mocked(prisma.category.update).mockReturnValue('op' as never)
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never)

    await reorderCategories(['c3', 'c1', 'c2'])

    expect(prisma.category.update).toHaveBeenNthCalledWith(1, { where: { id: 'c3' }, data: { sortOrder: 0 } })
    expect(prisma.category.update).toHaveBeenNthCalledWith(2, { where: { id: 'c1' }, data: { sortOrder: 1 } })
    expect(prisma.category.update).toHaveBeenNthCalledWith(3, { where: { id: 'c2' }, data: { sortOrder: 2 } })
    expect(prisma.$transaction).toHaveBeenCalledWith(['op', 'op', 'op'])
  })

  it('throws ValidationError when an id is missing from the order', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)
    await expect(reorderCategories(['c1', 'c2'])).rejects.toThrow(ValidationError)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the order contains an unknown id', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)
    await expect(reorderCategories(['c1', 'c2', 'nope'])).rejects.toThrow(ValidationError)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the order contains a duplicate id', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)
    await expect(reorderCategories(['c1', 'c1', 'c2'])).rejects.toThrow(ValidationError)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('categoryService.deleteCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the category', async () => {
    vi.mocked(prisma.category.delete).mockResolvedValue({} as never)

    await deleteCategory('c1')

    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
  })

  it('throws NotFoundError when the category does not exist', async () => {
    vi.mocked(prisma.category.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.8.0',
      }) as never,
    )

    await expect(deleteCategory('missing')).rejects.toThrow(NotFoundError)
  })
})
