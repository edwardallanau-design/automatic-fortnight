// app/order/new/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NewOrderPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { getBranchOrThrow, listBranches } from '@/lib/branchService'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/orderingPointService', () => ({
  listOrderingPoints: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  getBranchOrThrow: vi.fn(),
  listBranches: vi.fn(),
}))

function branch(id: string, name: string) {
  return { id, name, acceptingOrders: true, createdAt: new Date() }
}

describe('NewOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: a branch-scoped staff session pinned to branch b1.
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff', branchId: 'b1' } as never)
    vi.mocked(getBranchOrThrow).mockResolvedValue(branch('b1', 'Downtown') as never)
  })

  it("lists a staff member's own branch ordering points as /order?table=<id> links", async () => {
    vi.mocked(listOrderingPoints).mockResolvedValue([
      { id: 't1', branchId: 'b1', label: 'Table 1', isCounter: false, createdAt: new Date() },
      { id: 't2', branchId: 'b1', label: 'Table 2', isCounter: false, createdAt: new Date() },
    ] as never)

    const ui = await NewOrderPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: 'Table 1' })).toHaveAttribute('href', '/order?table=t1')
    expect(screen.getByRole('link', { name: 'Table 2' })).toHaveAttribute('href', '/order?table=t2')
    // Staff are pinned to their session branch, not whatever ?branch= says.
    expect(listOrderingPoints).toHaveBeenCalledWith('b1')
  })

  it('renders the Counter ordering point by its stored label', async () => {
    vi.mocked(listOrderingPoints).mockResolvedValue([
      { id: 't0', branchId: 'b1', label: 'Counter', isCounter: true, createdAt: new Date() },
    ] as never)

    const ui = await NewOrderPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: 'Counter' })).toHaveAttribute('href', '/order?table=t0')
  })

  it('shows an empty-state message with a link to table setup when the branch has no ordering points', async () => {
    vi.mocked(listOrderingPoints).mockResolvedValue([])

    const ui = await NewOrderPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText(/No tables yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table setup' })).toHaveAttribute('href', '/admin/tables')
  })

  it('lists the requested branch ordering points for an admin who selected a specific branch', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' } as never)
    vi.mocked(getBranchOrThrow).mockResolvedValue(branch('b2', 'Uptown') as never)
    vi.mocked(listOrderingPoints).mockResolvedValue([
      { id: 't3', branchId: 'b2', label: 'Table 9', isCounter: false, createdAt: new Date() },
    ] as never)

    const ui = await NewOrderPage({ searchParams: Promise.resolve({ branch: 'b2' }) })
    render(ui)

    expect(getBranchOrThrow).toHaveBeenCalledWith('b2')
    expect(listOrderingPoints).toHaveBeenCalledWith('b2')
    expect(screen.getByRole('link', { name: 'Table 9' })).toHaveAttribute('href', '/order?table=t3')
    // The resolved branch name is shown so the admin can see which branch they're ordering for.
    expect(screen.getByText(/Uptown/)).toBeInTheDocument()
  })

  it('shows a branch chooser (not a table list) for an admin with "All branches" selected', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' } as never)
    vi.mocked(listBranches).mockResolvedValue([branch('b1', 'Downtown'), branch('b2', 'Uptown')] as never)

    const ui = await NewOrderPage({ searchParams: Promise.resolve({ branch: 'all' }) })
    render(ui)

    expect(screen.getByRole('heading', { name: 'Choose a branch' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Downtown' })).toHaveAttribute('href', '/order/new?branch=b1')
    expect(screen.getByRole('link', { name: 'Uptown' })).toHaveAttribute('href', '/order/new?branch=b2')
    // No branch resolved yet — do not list any tables.
    expect(listOrderingPoints).not.toHaveBeenCalled()
  })

  it('shows the branch chooser for an admin with no branch in the URL', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' } as never)
    vi.mocked(listBranches).mockResolvedValue([branch('b1', 'Downtown'), branch('b2', 'Uptown')] as never)

    const ui = await NewOrderPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: 'Choose a branch' })).toBeInTheDocument()
    expect(listOrderingPoints).not.toHaveBeenCalled()
  })

  it('falls back to the branch chooser when an admin requests a branch that no longer exists', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' } as never)
    vi.mocked(getBranchOrThrow).mockRejectedValue(new NotFoundError('Branch not found'))
    vi.mocked(listBranches).mockResolvedValue([branch('b1', 'Downtown'), branch('b2', 'Uptown')] as never)

    const ui = await NewOrderPage({ searchParams: Promise.resolve({ branch: 'ghost' }) })
    render(ui)

    expect(screen.getByRole('heading', { name: 'Choose a branch' })).toBeInTheDocument()
    expect(listOrderingPoints).not.toHaveBeenCalled()
  })
})
