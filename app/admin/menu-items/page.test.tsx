import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminMenuItemsPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listMenuItems } from '@/lib/menuService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/menuService', () => ({
  listMenuItems: vi.fn(),
}))

vi.mock('./CreateMenuItemForm', () => ({
  CreateMenuItemForm: () => <div>Create Menu Item Form</div>,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('AdminMenuItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listMenuItems).mockResolvedValue([])
  })

  it('is gated behind at least a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    await AdminMenuItemsPage()

    expect(requireRole).toHaveBeenCalledWith('staff')
  })

  it('shows an empty state when there are no menu items', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await AdminMenuItemsPage()
    render(ui)

    expect(screen.getByText('No menu items yet — add one above.')).toBeInTheDocument()
  })

  it('shows the Menu Management heading for a staff session, without the create form', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await AdminMenuItemsPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Menu Management' })).toBeInTheDocument()
    expect(screen.queryByText('Create Menu Item Form')).not.toBeInTheDocument()
  })

  it('shows the create form for an admin session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })

    const ui = await AdminMenuItemsPage()
    render(ui)

    expect(screen.getByText('Create Menu Item Form')).toBeInTheDocument()
  })

  it('renders each menu item', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })
    vi.mocked(listMenuItems).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, available: true, archived: false, createdAt: new Date() },
    ] as never)

    const ui = await AdminMenuItemsPage()
    render(ui)

    expect(screen.getByText('Burger')).toBeInTheDocument()
  })
})
