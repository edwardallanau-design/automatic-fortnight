import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import bcrypt from 'bcrypt'
import { getBranchOrThrow, getMainBranch, resolveBranchId, listBranches, createBranch, renameBranch, setBranchAcceptingOrders, setBranchPassword } from './branchService'
import { NotFoundError, ConflictError } from './errors'
import { prisma } from './prisma'

let realBcrypt: typeof import('bcrypt')

beforeAll(async () => {
  realBcrypt = await vi.importActual<typeof import('bcrypt')>('bcrypt')
})

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}))

vi.mock('./prisma', () => ({
  prisma: {
    branch: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    credential: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orderingPoint: {
      create: vi.fn(),
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

  it("returns the session's own branchId when present (staff), ignoring requestedBranchId entirely", async () => {
    const result = await resolveBranchId({ branchId: 'b2' }, 'some-other-branch')
    expect(result).toBe('b2')
    expect(prisma.branch.findFirst).not.toHaveBeenCalled()
    expect(prisma.branch.findUnique).not.toHaveBeenCalled()
  })

  it('honors a valid requestedBranchId when the session has no branchId (admin)', async () => {
    vi.mocked(prisma.branch.findUnique).mockResolvedValue({ id: 'b3', name: 'Downtown', acceptingOrders: true, createdAt: new Date() } as never)

    const result = await resolveBranchId({}, 'b3')
    expect(result).toBe('b3')
    expect(prisma.branch.findFirst).not.toHaveBeenCalled()
  })

  it('falls back to the first branch (by name) when the session has no branchId and no requestedBranchId is given', async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    const result = await resolveBranchId({})
    expect(result).toBe('b2')
    expect(prisma.branch.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } })
  })

  it('throws NotFoundError when no branches exist at all and no requestedBranchId is given', async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([])

    await expect(resolveBranchId({})).rejects.toThrow(NotFoundError)
  })

  it('throws NotFoundError when requestedBranchId does not name a real branch', async () => {
    vi.mocked(prisma.branch.findUnique).mockResolvedValue(null)

    await expect(resolveBranchId({}, 'nonexistent')).rejects.toThrow(NotFoundError)
  })
})

describe('branchService.listBranches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all branches ordered by name', async () => {
    const branches = [
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
    ]
    vi.mocked(prisma.branch.findMany).mockResolvedValue(branches as never)

    const result = await listBranches()
    expect(result).toEqual(branches)
    expect(prisma.branch.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } })
  })
})

describe('branchService.createBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.credential.findMany).mockResolvedValue([])
  })

  it('creates a branch, its Counter ordering point, and its credential', async () => {
    const created = { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() }
    vi.mocked(prisma.branch.create).mockResolvedValue(created as never)
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as never)

    const result = await createBranch('Downtown', 'downtown-pw')

    expect(result).toEqual(created)
    expect(prisma.branch.create).toHaveBeenCalledWith({ data: { name: 'Downtown' } })
    expect(prisma.orderingPoint.create).toHaveBeenCalledWith({
      data: { branchId: 'b2', label: 'Counter', isCounter: true },
    })
    expect(prisma.credential.create).toHaveBeenCalledWith({
      data: { role: 'staff', branchId: 'b2', passwordHash: 'hashed-pw' },
    })
  })

  it('throws ConflictError when the password collides with an existing credential', async () => {
    const existingHash = await realBcrypt.hash('taken-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: 'c1', role: 'admin', branchId: null, passwordHash: existingHash },
    ] as never)
    vi.mocked(bcrypt.compare).mockImplementation((plain) => realBcrypt.compare(plain as string, existingHash))

    await expect(createBranch('Downtown', 'taken-pw')).rejects.toThrow(ConflictError)
    expect(prisma.branch.create).not.toHaveBeenCalled()
  })
})

describe('branchService.renameBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the branch name', async () => {
    const updated = { id: 'b1', name: 'Main Street', acceptingOrders: true, createdAt: new Date() }
    vi.mocked(prisma.branch.update).mockResolvedValue(updated as never)

    const result = await renameBranch('b1', 'Main Street')
    expect(result).toEqual(updated)
    expect(prisma.branch.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { name: 'Main Street' } })
  })
})

describe('branchService.setBranchAcceptingOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the branch acceptingOrders flag', async () => {
    const updated = { id: 'b1', name: 'Main', acceptingOrders: false, createdAt: new Date() }
    vi.mocked(prisma.branch.update).mockResolvedValue(updated as never)

    const result = await setBranchAcceptingOrders('b1', false)
    expect(result).toEqual(updated)
    expect(prisma.branch.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { acceptingOrders: false } })
  })
})

describe('branchService.setBranchPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.credential.findMany).mockResolvedValue([])
  })

  it('updates the branch credential passwordHash', async () => {
    vi.mocked(bcrypt.hash).mockResolvedValue('new-hashed-pw' as never)

    await setBranchPassword('b1', 'new-pw')

    expect(prisma.credential.findMany).toHaveBeenCalledWith({
      where: { OR: [{ branchId: { not: 'b1' } }, { branchId: null }] },
    })
    expect(prisma.credential.update).toHaveBeenCalledWith({
      where: { branchId: 'b1' },
      data: { passwordHash: 'new-hashed-pw' },
    })
  })

  it('throws ConflictError when the new password collides with a DIFFERENT credential', async () => {
    const existingHash = await realBcrypt.hash('other-branch-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: 'c2', role: 'staff', branchId: 'b2', passwordHash: existingHash },
    ] as never)
    vi.mocked(bcrypt.compare).mockImplementation((plain) => realBcrypt.compare(plain as string, existingHash))

    await expect(setBranchPassword('b1', 'other-branch-pw')).rejects.toThrow(ConflictError)
    expect(prisma.credential.update).not.toHaveBeenCalled()
  })

  it('excludes the branch\'s own current credential from the collision scan (re-saving the same password succeeds)', async () => {
    vi.mocked(bcrypt.hash).mockResolvedValue('same-hashed-pw' as never)

    await expect(setBranchPassword('b1', 'same-pw-as-before')).resolves.toBeUndefined()

    expect(prisma.credential.findMany).toHaveBeenCalledWith({
      where: { OR: [{ branchId: { not: 'b1' } }, { branchId: null }] },
    })
  })

  it('throws ConflictError when the new password collides with the admin credential (branchId is null), and queries with an OR clause that retains null-branchId rows', async () => {
    const existingHash = await realBcrypt.hash('admin-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: 'admin-cred', role: 'admin', branchId: null, passwordHash: existingHash },
    ] as never)
    vi.mocked(bcrypt.compare).mockImplementation((plain) => realBcrypt.compare(plain as string, existingHash))

    await expect(setBranchPassword('b1', 'admin-pw')).rejects.toThrow(ConflictError)
    expect(prisma.credential.update).not.toHaveBeenCalled()
    expect(prisma.credential.findMany).toHaveBeenCalledWith({
      where: { OR: [{ branchId: { not: 'b1' } }, { branchId: null }] },
    })
  })
})
