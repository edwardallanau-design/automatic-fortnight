import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { createTable, getTableOrThrow, listTables } from './tableService'
import { ConflictError, NotFoundError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    table: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

describe('tableService.createTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the created table', async () => {
    const created = { id: 't1', number: 12, createdAt: new Date() }
    vi.mocked(prisma.table.create).mockResolvedValue(created as never)

    const result = await createTable(12)
    expect(result).toEqual(created)
    expect(prisma.table.create).toHaveBeenCalledWith({ data: { number: 12 } })
  })

  it('throws ConflictError when the number already exists', async () => {
    vi.mocked(prisma.table.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }) as never,
    )

    await expect(createTable(12)).rejects.toThrow(ConflictError)
  })

  it('rethrows unrelated errors', async () => {
    vi.mocked(prisma.table.create).mockRejectedValue(new Error('connection lost'))

    await expect(createTable(12)).rejects.toThrow('connection lost')
  })
})

describe('tableService.getTableOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the table when found', async () => {
    const table = { id: 't1', number: 12, createdAt: new Date() }
    vi.mocked(prisma.table.findUnique).mockResolvedValue(table as never)

    const result = await getTableOrThrow('t1')
    expect(result).toEqual(table)
  })

  it('throws NotFoundError when no table matches', async () => {
    vi.mocked(prisma.table.findUnique).mockResolvedValue(null)

    await expect(getTableOrThrow('missing-id')).rejects.toThrow(NotFoundError)
  })
})

describe('tableService.listTables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all tables ordered by number', async () => {
    const tables = [
      { id: 't1', number: 1, createdAt: new Date() },
      { id: 't2', number: 2, createdAt: new Date() },
    ]
    vi.mocked(prisma.table.findMany).mockResolvedValue(tables as never)

    const result = await listTables()
    expect(result).toEqual(tables)
    expect(prisma.table.findMany).toHaveBeenCalledWith({ orderBy: { number: 'asc' } })
  })
})
