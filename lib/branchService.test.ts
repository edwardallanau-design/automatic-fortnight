import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getBranchOrThrow, getMainBranch, resolveBranchId } from './branchService'
import { NotFoundError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    branch: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

describe('branchService.getBranchOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the branch when found', async () => {
    const branch = { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }
    vi.mocked(prisma.branch.findUnique).mockResolvedValue(branch as never)

    const result = await getBranchOrThrow('b1')
    expect(result).toEqual(branch)
  })

  it('throws NotFoundError when no branch matches', async () => {
    vi.mocked(prisma.branch.findUnique).mockResolvedValue(null)

    await expect(getBranchOrThrow('missing-id')).rejects.toThrow(NotFoundError)
  })
})

describe('branchService.getMainBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the branch named "Main"', async () => {
    const branch = { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }
    vi.mocked(prisma.branch.findFirst).mockResolvedValue(branch as never)

    const result = await getMainBranch()
    expect(result).toEqual(branch)
    expect(prisma.branch.findFirst).toHaveBeenCalledWith({ where: { name: 'Main' } })
  })

  it('throws NotFoundError if no Main branch exists', async () => {
    vi.mocked(prisma.branch.findFirst).mockResolvedValue(null)

    await expect(getMainBranch()).rejects.toThrow(NotFoundError)
  })
})

describe('branchService.resolveBranchId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the session's own branchId when present (staff)", async () => {
    const result = await resolveBranchId({ branchId: 'b2' })
    expect(result).toBe('b2')
    expect(prisma.branch.findFirst).not.toHaveBeenCalled()
  })

  it('falls back to the Main branch when the session has no branchId (admin)', async () => {
    vi.mocked(prisma.branch.findFirst).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() } as never)

    const result = await resolveBranchId({})
    expect(result).toBe('b1')
  })
})
