import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminBranchesPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listBranches } from '@/lib/branchService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  listBranches: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('AdminBranchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listBranches).mockResolvedValue([])
  })

  it('is gated behind an admin session', async () => {
    await AdminBranchesPage()

    expect(requireRole).toHaveBeenCalledWith('admin')
  })

  it('shows the Branches heading and create form', async () => {
    const ui = await AdminBranchesPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Branches' })).toBeInTheDocument()
    expect(screen.getByLabelText('Branch name')).toBeInTheDocument()
  })

  it('renders each branch', async () => {
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: false, createdAt: new Date() },
    ] as never)

    const ui = await AdminBranchesPage()
    render(ui)

    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText('Downtown')).toBeInTheDocument()
  })

  it('shows an empty state when there are no branches', async () => {
    const ui = await AdminBranchesPage()
    render(ui)

    expect(screen.getByText('No branches yet — add one above.')).toBeInTheDocument()
  })
})
