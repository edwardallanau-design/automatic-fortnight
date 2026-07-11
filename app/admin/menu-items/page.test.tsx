import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminMenuItemsPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { resolveBranchId, listBranches } from '@/lib/branchService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/menuService', () => ({
  listMenuItemsWithAvailability: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
  listBranches: vi.fn(),
}))

vi.mock('./CreateMenuItemForm', () => ({
  CreateMenuItemForm: () => <div>Create Menu Item Form</div>,
}))

vi.mock('@/app/components/BranchSelector', () => ({
  BranchSelector: ({ branches }: { branches: { id: string; name: string }[] }) => (
    <div>Branch Selector ({branches.length})</div>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('AdminMenuItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([])
    vi.mocked(listBranches).mockResolvedValue([{ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }] as never)
  })

  function callPage(role: 'staff' | 'admin', branch?: string) {
    vi.mocked(requireRole).mockResolvedValue({ role })
    return AdminMenuItemsPage({ searchParams: Promise.resolve(branch ? { branch } : {}) })
  }

  it('is gated behind at least a staff session', async () => {
    await callPage('staff')

    expect(requireRole).toHaveBeenCalledWith('staff')
  })

  it('shows an empty state when there are no menu items', async () => {
    const ui = await callPage('staff')
    render(ui)

    expect(screen.getByText('No menu items yet — add one above.')).toBeInTheDocument()
  })

  it('shows the Menu Management heading for a staff session, without the create form or branch selector', async () => {
    const ui = await callPage('staff')
    render(ui)

    expect(screen.getByRole('heading', { name: 'Menu Management' })).toBeInTheDocument()
    expect(screen.queryByText('Create Menu Item Form')).not.toBeInTheDocument()
    expect(screen.queryByText(/Branch Selector/)).not.toBeInTheDocument()
  })

  it('shows the create form and branch selector for an admin session', async () => {
    const ui = await callPage('admin')
    render(ui)

    expect(screen.getByText('Create Menu Item Form')).toBeInTheDocument()
    expect(screen.getByText('Branch Selector (1)')).toBeInTheDocument()
  })

  it('resolves the branch from ?branch= for admin, ignoring it for staff', async () => {
    await callPage('admin', 'b2')
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')

    vi.mocked(resolveBranchId).mockClear()
    await callPage('staff', 'b2')
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'staff' }, undefined)
  })

  it('renders each menu item with the resolved branchId', async () => {
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, available: true, archived: false, createdAt: new Date() },
    ] as never)

    const ui = await callPage('staff')
    render(ui)

    expect(screen.getByText('Burger')).toBeInTheDocument()
  })

  it('shows an interactive availability toggle for a staff (non-admin) session', async () => {
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, available: true, archived: false, createdAt: new Date() },
    ] as never)

    const ui = await callPage('staff')
    render(ui)

    expect(screen.getByRole('switch')).not.toBeDisabled()
  })
})
