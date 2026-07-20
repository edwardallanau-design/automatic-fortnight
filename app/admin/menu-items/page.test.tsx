import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminMenuItemsPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { listCategories } from '@/lib/categoryService'
import { resolveBranchId, getBranchOrThrow } from '@/lib/branchService'

vi.mock('@/lib/authGuard', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/menuService', () => ({ listMenuItemsWithAvailability: vi.fn() }))
vi.mock('@/lib/categoryService', () => ({ listCategories: vi.fn() }))
vi.mock('@/lib/branchService', () => ({ resolveBranchId: vi.fn(), getBranchOrThrow: vi.fn() }))

vi.mock('./MenuManager', () => ({
  MenuManager: (props: { isAdmin: boolean; items: unknown[]; categories: unknown[] }) => (
    <div data-testid="menu-manager" data-admin={String(props.isAdmin)} data-items={props.items.length} data-categories={props.categories.length} />
  ),
}))

describe('AdminMenuItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
    vi.mocked(getBranchOrThrow).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() } as never)
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([])
    vi.mocked(listCategories).mockResolvedValue([])
  })

  function callPage(role: 'staff' | 'admin', branch?: string) {
    vi.mocked(requireRole).mockResolvedValue({ role })
    return AdminMenuItemsPage({ searchParams: Promise.resolve(branch ? { branch } : {}) })
  }

  it('is gated behind at least a staff session', async () => {
    await callPage('staff')
    expect(requireRole).toHaveBeenCalledWith('staff')
  })

  it('shows the branch name and Menu Management heading', async () => {
    render(await callPage('admin'))
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Menu Management' })).toBeInTheDocument()
  })

  it('resolves the branch from ?branch= for admin, ignoring it for staff', async () => {
    await callPage('admin', 'b2')
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')
    vi.mocked(resolveBranchId).mockClear()
    await callPage('staff', 'b2')
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'staff' }, undefined)
  })

  it('passes isAdmin + mapped items/categories to MenuManager', async () => {
    vi.mocked(listCategories).mockResolvedValue([{ id: 'c1', name: 'Mains', sortOrder: 0, createdAt: new Date() }] as never)
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, available: true, archived: false, createdAt: new Date(), category: { id: 'c1', name: 'Mains', sortOrder: 0, createdAt: new Date() } },
    ] as never)

    render(await callPage('admin'))
    const manager = screen.getByTestId('menu-manager')
    expect(manager).toHaveAttribute('data-admin', 'true')
    expect(manager).toHaveAttribute('data-items', '1')
    expect(manager).toHaveAttribute('data-categories', '1')
  })

  it('shows the empty state when there are no items and no categories', async () => {
    render(await callPage('admin'))
    expect(screen.getByText('No menu items yet — add a category or item to start.')).toBeInTheDocument()
  })
})
