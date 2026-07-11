import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { StaffBarGate } from './StaffBarGate'
import { listBranches } from '@/lib/branchService'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/branchService', () => ({
  listBranches: vi.fn(),
}))

describe('StaffBarGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listBranches).mockResolvedValue([])
  })

  it('renders nothing when there is no session', async () => {
    const ui = await StaffBarGate({ session: null })
    expect(ui).toBeNull()
  })

  it('renders the StaffBar with the session role when a session exists', async () => {
    const ui = await StaffBarGate({ session: { role: 'admin' } })
    const { container } = render(ui)

    expect(container.querySelector('.staff-strip')).toHaveClass('staff-strip--admin')
  })

  it('fetches branches for an admin session', async () => {
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    await StaffBarGate({ session: { role: 'admin' } })

    expect(listBranches).toHaveBeenCalled()
  })

  it('does not fetch branches for a staff session', async () => {
    await StaffBarGate({ session: { role: 'staff' } })

    expect(listBranches).not.toHaveBeenCalled()
  })
})
