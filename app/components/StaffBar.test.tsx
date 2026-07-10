import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffBar } from './StaffBar'
import { apiClient } from '@/lib/apiClient'

const push = vi.fn()
const refresh = vi.fn()
let mockPathname = '/order/new'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => mockPathname,
}))

vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: vi.fn() },
}))

describe('StaffBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockPathname = '/order/new'
  })

  it('shows the role', () => {
    render(<StaffBar role="staff" />)

    expect(screen.getByText('staff')).toBeInTheDocument()
  })

  it('shows a Dashboard link when not already on the dashboard', () => {
    render(<StaffBar role="staff" />)

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('hides the Dashboard link when already on the dashboard', () => {
    mockPathname = '/dashboard'
    render(<StaffBar role="staff" />)

    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('does not show admin-only nav links for a staff session', () => {
    render(<StaffBar role="staff" />)

    expect(screen.queryByRole('link', { name: 'Table Setup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Payment Methods' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument()
  })

  it('shows a Menu Management link for a staff session', () => {
    render(<StaffBar role="staff" />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute('href', '/admin/menu-items')
  })

  it('hides the Menu Management link for a staff session when already on that page', () => {
    mockPathname = '/admin/menu-items'
    render(<StaffBar role="staff" />)

    expect(screen.queryByRole('link', { name: 'Menu Management' })).not.toBeInTheDocument()
  })

  it('shows Menu Management, Table Setup, and Payment Methods links for an admin session', () => {
    render(<StaffBar role="admin" />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute('href', '/admin/menu-items')
    expect(screen.getByRole('link', { name: 'Table Setup' })).toHaveAttribute('href', '/admin/tables')
    expect(screen.getByRole('link', { name: 'Payment Methods' })).toHaveAttribute('href', '/admin/payment-methods')
  })

  it('hides the Menu Management link when already on that page', () => {
    mockPathname = '/admin/menu-items'
    render(<StaffBar role="admin" />)

    expect(screen.queryByRole('link', { name: 'Menu Management' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table Setup' })).toBeInTheDocument()
  })

  it('hides the Table Setup link when already on that page', () => {
    mockPathname = '/admin/tables'
    render(<StaffBar role="admin" />)

    expect(screen.queryByRole('link', { name: 'Table Setup' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Menu Management' })).toBeInTheDocument()
  })

  it('shows a Settings link for an admin session', () => {
    render(<StaffBar role="admin" />)

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/admin/settings')
  })

  it('hides the Settings link when already on that page', () => {
    mockPathname = '/admin/settings'
    render(<StaffBar role="admin" />)

    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('shows a Branches link for an admin session', () => {
    render(<StaffBar role="admin" />)

    expect(screen.getByRole('link', { name: 'Branches' })).toHaveAttribute('href', '/admin/branches')
  })

  it('hides the Branches link when already on that page', () => {
    mockPathname = '/admin/branches'
    render(<StaffBar role="admin" />)

    expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument()
  })

  it('logs out on click: calls the logout endpoint and redirects to /login', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/auth/logout', {})
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('disables the Log out button while the request is in flight', async () => {
    let resolveLogout: () => void = () => {}
    vi.mocked(apiClient.post).mockReturnValue(
      new Promise((resolve) => {
        resolveLogout = () => resolve({})
      }),
    )
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(screen.getByRole('button', { name: 'Log out' })).toBeDisabled()

    resolveLogout()
  })

  it('still navigates to /login and re-enables the button if the logout request fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(push).toHaveBeenCalledWith('/login')
    expect(screen.getByRole('button', { name: 'Log out' })).not.toBeDisabled()
  })

  it('collapses to a reopen control when the hide button is clicked, and expands again on click', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="staff" />)

    await user.click(screen.getByRole('button', { name: 'Hide staff bar' }))
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show staff bar' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show staff bar' }))
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('persists the collapsed state across remounts via localStorage', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<StaffBar role="staff" />)

    await user.click(screen.getByRole('button', { name: 'Hide staff bar' }))
    unmount()

    render(<StaffBar role="staff" />)
    expect(screen.getByRole('button', { name: 'Show staff bar' })).toBeInTheDocument()
  })
})
