import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import { login } from './authService'
import { InvalidCredentialError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    credential: {
      findMany: vi.fn(),
    },
  },
}))

describe('authService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns role staff when password matches the staff credential', async () => {
    const staffHash = await bcrypt.hash('staff-temp-pw', 10)
    const adminHash = await bcrypt.hash('admin-temp-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: '1', role: 'staff', passwordHash: staffHash },
      { id: '2', role: 'admin', passwordHash: adminHash },
    ] as never)

    const result = await login('staff-temp-pw')
    expect(result).toEqual({ role: 'staff' })
  })

  it('returns role admin when password matches the admin credential', async () => {
    const staffHash = await bcrypt.hash('staff-temp-pw', 10)
    const adminHash = await bcrypt.hash('admin-temp-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: '1', role: 'staff', passwordHash: staffHash },
      { id: '2', role: 'admin', passwordHash: adminHash },
    ] as never)

    const result = await login('admin-temp-pw')
    expect(result).toEqual({ role: 'admin' })
  })

  it('throws InvalidCredentialError when password matches nothing', async () => {
    const staffHash = await bcrypt.hash('staff-temp-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: '1', role: 'staff', passwordHash: staffHash },
    ] as never)

    await expect(login('wrong-password')).rejects.toThrow(InvalidCredentialError)
  })
})
