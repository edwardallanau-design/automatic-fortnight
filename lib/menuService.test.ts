import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  createMenuItem,
  updateMenuItem,
  archiveMenuItem,
  listMenuItems,
  findMenuItemsByIds,
  listSoldOutMenuItemIds,
  setMenuItemSoldOut,
  listMenuItemsWithAvailability,
} from './menuService'
import { NotFoundError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    menuItem: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    menuItemSoldOut: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
    },
  },
}))

describe('menuService.createMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a menu item with name and price', async () => {
    const created = { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() }
    vi.mocked(prisma.menuItem.create).mockResolvedValue(created as never)

    const result = await createMenuItem('Burger', new Prisma.Decimal('12.50'))

    expect(result).toEqual(created)
    expect(prisma.menuItem.create).toHaveBeenCalledWith({
      data: { name: 'Burger', price: new Prisma.Decimal('12.50') },
    })
  })
})

describe('menuService.updateMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates provided fields and returns the updated item', async () => {
    const updated = { id: 'm1', name: 'Cheeseburger', price: new Prisma.Decimal('13.00'), available: true, archived: false, createdAt: new Date() }
    vi.mocked(prisma.menuItem.update).mockResolvedValue(updated as never)

    const result = await updateMenuItem('m1', { name: 'Cheeseburger', price: new Prisma.Decimal('13.00') })

    expect(result).toEqual(updated)
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { name: 'Cheeseburger', price: new Prisma.Decimal('13.00') },
    })
  })

  it('throws NotFoundError when the item does not exist', async () => {
    vi.mocked(prisma.menuItem.update).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.8.0',
      }) as never,
    )

    await expect(updateMenuItem('missing', { name: 'X' })).rejects.toThrow(NotFoundError)
  })

  it('accepts a categoryId update when the category exists', async () => {
    vi.mocked(prisma.category.findUnique).mockResolvedValue({
      id: 'c1',
      name: 'Drinks',
      sortOrder: 0,
      createdAt: new Date(),
    } as never)
    const updated = {
      id: 'm1',
      name: 'Burger',
      price: new Prisma.Decimal('12.50'),
      archived: false,
      createdAt: new Date(),
      categoryId: 'c1',
    }
    vi.mocked(prisma.menuItem.update).mockResolvedValue(updated as never)

    const result = await updateMenuItem('m1', { categoryId: 'c1' })

    expect(result).toEqual(updated)
    expect(prisma.category.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } })
    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { categoryId: 'c1' } })
  })

  it('throws NotFoundError when the categoryId does not exist', async () => {
    vi.mocked(prisma.category.findUnique).mockResolvedValue(null)

    await expect(updateMenuItem('m1', { categoryId: 'missing' })).rejects.toThrow(NotFoundError)
    expect(prisma.menuItem.update).not.toHaveBeenCalled()
  })

  it('allows clearing the category by passing categoryId: null, with no existence check', async () => {
    const updated = {
      id: 'm1',
      name: 'Burger',
      price: new Prisma.Decimal('12.50'),
      archived: false,
      createdAt: new Date(),
      categoryId: null,
    }
    vi.mocked(prisma.menuItem.update).mockResolvedValue(updated as never)

    const result = await updateMenuItem('m1', { categoryId: null })

    expect(result).toEqual(updated)
    expect(prisma.category.findUnique).not.toHaveBeenCalled()
    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { categoryId: null } })
  })
})

describe('menuService.archiveMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets archived to true', async () => {
    vi.mocked(prisma.menuItem.update).mockResolvedValue({} as never)

    await archiveMenuItem('m1')

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { archived: true },
    })
  })

  it('throws NotFoundError when the item does not exist', async () => {
    vi.mocked(prisma.menuItem.update).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.8.0',
      }) as never,
    )

    await expect(archiveMenuItem('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('menuService.listMenuItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only non-archived items ordered by name, including category', async () => {
    const items = [
      {
        id: 'm1',
        name: 'Burger',
        price: new Prisma.Decimal('12.50'),
        archived: false,
        createdAt: new Date(),
        category: null,
      },
    ]
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue(items as never)

    const result = await listMenuItems()

    expect(result).toEqual(items)
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { archived: false },
      orderBy: { name: 'asc' },
      include: { category: true },
    })
  })
})

describe('menuService.findMenuItemsByIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns menu items matching the given ids', async () => {
    const items = [{ id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() }]
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue(items as never)

    const result = await findMenuItemsByIds(['m1'])

    expect(result).toEqual(items)
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] } },
    })
  })
})

describe('menuService.listSoldOutMenuItemIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the set of menu item ids sold out in the given branch', async () => {
    vi.mocked(prisma.menuItemSoldOut.findMany).mockResolvedValue([
      { menuItemId: 'm1' },
      { menuItemId: 'm2' },
    ] as never)

    const result = await listSoldOutMenuItemIds('b1')
    expect(result).toEqual(new Set(['m1', 'm2']))
    expect(prisma.menuItemSoldOut.findMany).toHaveBeenCalledWith({
      where: { branchId: 'b1' },
      select: { menuItemId: true },
    })
  })
})

describe('menuService.setMenuItemSoldOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts a MenuItemSoldOut row when marking sold out', async () => {
    await setMenuItemSoldOut('m1', 'b1', true)

    expect(prisma.menuItemSoldOut.upsert).toHaveBeenCalledWith({
      where: { menuItemId_branchId: { menuItemId: 'm1', branchId: 'b1' } },
      update: {},
      create: { menuItemId: 'm1', branchId: 'b1' },
    })
  })

  it('deletes the MenuItemSoldOut row when marking available', async () => {
    await setMenuItemSoldOut('m1', 'b1', false)

    expect(prisma.menuItemSoldOut.deleteMany).toHaveBeenCalledWith({
      where: { menuItemId: 'm1', branchId: 'b1' },
    })
    expect(prisma.menuItemSoldOut.upsert).not.toHaveBeenCalled()
  })
})

describe('menuService.listMenuItemsWithAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks items present in MenuItemSoldOut as unavailable, others as available', async () => {
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, archived: false, createdAt: new Date() },
      { id: 'm2', name: 'Fries', price: { toString: () => '4.00' }, archived: false, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.menuItemSoldOut.findMany).mockResolvedValue([{ menuItemId: 'm2' }] as never)

    const result = await listMenuItemsWithAvailability('b1')

    expect(result).toEqual([
      expect.objectContaining({ id: 'm1', available: true }),
      expect.objectContaining({ id: 'm2', available: false }),
    ])
  })
})
