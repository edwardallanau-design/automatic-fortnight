import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffBar } from './StaffBar'
import { apiClient } from '@/lib/apiClient'

const push = vi.fn()
const refresh = vi.fn()
const replace = vi.fn()
let mockPathname = '/order/new'
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: vi.fn() },
}))

describe('StaffBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockPathname = '/order/new'
    mockSearchParams = new URLSearchParams()
  })

  it('colors the bar for the admin role', () => {
    const { container } = render(<StaffBar role="admin" />)
    expect(container.querySelector('.staff-strip')).toHaveClass('staff-strip--admin')
  })

  it('colors the bar for the staff role', () => {
    const { container } = render(<StaffBar role="staff" />)
    expect(container.querySelector('.staff-strip')).toHaveClass('staff-strip--staff')
  })

  it('shows a Dashboard link at all times', () => {
    render(<StaffBar role="staff" />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('marks the Dashboard link active when already on the dashboard, without hiding it', () => {
    mockPathname = '/dashboard'
    render(<StaffBar role="staff" />)

    const link = screen.getByRole('link', { name: 'Dashboard' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveClass('staff-bar__action--active')
  })

  it('does not mark Menu Management active when on the dashboard', () => {
    mockPathname = '/dashboard'
    render(<StaffBar role="staff" />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).not.toHaveClass('staff-bar__action--active')
  })

  it('shows the Table Setup link inline for a staff session too', () => {
    render(<StaffBar role="staff" />)
    expect(screen.getByRole('link', { name: 'Table Setup' })).toHaveAttribute('href', '/admin/tables')
  })

  it('shows a Menu Management link inline for a staff session', () => {
    render(<StaffBar role="staff" />)
    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute('href', '/admin/menu-items')
  })

  it('shows Menu Management and Table Setup links inline for an admin session', () => {
    render(<StaffBar role="admin" />)
    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute('href', '/admin/menu-items')
    expect(screen.getByRole('link', { name: 'Table Setup' })).toHaveAttribute('href', '/admin/tables')
  })

  it('marks Table Setup active while still showing Menu Management, unmarked, when on Table Setup', () => {
    mockPathname = '/admin/tables'
    render(<StaffBar role="admin" />)

    expect(screen.getByRole('link', { name: 'Table Setup' })).toHaveClass('staff-bar__action--active')
    expect(screen.getByRole('link', { name: 'Menu Management' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Menu Management' })).not.toHaveClass('staff-bar__action--active')
  })

  it('does not show Payment Methods or Branches inline for an admin session', () => {
    render(<StaffBar role="admin" />)
    expect(screen.queryByRole('link', { name: 'Payment Methods' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument()
  })

  it('does not show a Log out button inline', () => {
    render(<StaffBar role="admin" />)
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('collapses to a reopen control when the hide button is clicked, and expands again on click', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="staff" />)

    await user.click(screen.getByRole('button', { name: 'Hide staff bar' }))
    expect(screen.queryByRole('button', { name: 'Show menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show staff bar' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show staff bar' }))
    expect(screen.getByRole('button', { name: 'Show menu' })).toBeInTheDocument()
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

describe('StaffBar route visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockSearchParams = new URLSearchParams()
  })

  it('renders nothing on the login page', () => {
    mockPathname = '/login'
    const { container } = render(<StaffBar role="staff" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on the root page', () => {
    mockPathname = '/'
    const { container } = render(<StaffBar role="admin" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('still renders on other routes such as /order/new', () => {
    mockPathname = '/order/new'
    render(<StaffBar role="staff" />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  })
})

describe('StaffBar menu (hamburger)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockPathname = '/order/new'
    mockSearchParams = new URLSearchParams()
  })

  it('renders the hamburger button at all times', () => {
    render(<StaffBar role="staff" />)
    expect(screen.getByRole('button', { name: 'Show menu' })).toBeInTheDocument()
  })

  it('opens a menu with Payment Methods, Branches, and Log out for an admin session', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Payment Methods' })).toHaveAttribute(
      'href',
      '/admin/payment-methods',
    )
    expect(screen.getByRole('menuitem', { name: 'Branches' })).toHaveAttribute('href', '/admin/branches')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
  })

  it('opens a menu with only Log out for a staff session', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="staff" />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))

    expect(screen.queryByRole('menuitem', { name: 'Payment Methods' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Branches' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
  })

  it('closes the menu when the hamburger is clicked again', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide menu' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('marks Branches active in the menu when already on that page', async () => {
    mockPathname = '/admin/branches'
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))
    expect(screen.getByRole('menuitem', { name: 'Branches' })).toHaveClass('staff-bar__menu-link--active')
  })

  it('closes the menu after clicking a link inside it', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Branches' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('logs out on click: calls the logout endpoint and redirects to /login', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/auth/logout', {})
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('disables the Log out item while the request is in flight', async () => {
    let resolveLogout: () => void = () => {}
    vi.mocked(apiClient.post).mockReturnValue(
      new Promise((resolve) => {
        resolveLogout = () => resolve({})
      }),
    )
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeDisabled()

    resolveLogout()
  })

  it('still navigates to /login and re-enables the item if the logout request fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))

    expect(push).toHaveBeenCalledWith('/login')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).not.toBeDisabled()
  })
})

describe('StaffBar branch picker', () => {
  const branches = [
    { id: 'b1', name: 'Downtown' },
    { id: 'b2', name: 'Uptown' },
  ]

  beforeEach(() => {
    localStorage.clear()
    mockPathname = '/dashboard'
    mockSearchParams = new URLSearchParams()
  })

  it('does not render the branch button for a staff session', () => {
    render(<StaffBar role="staff" branches={branches} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /▾/ })).not.toBeInTheDocument()
  })

  it('does not render the branch button when there is only one branch', () => {
    render(<StaffBar role="admin" branches={[branches[0]]} />)
    expect(screen.queryByRole('button', { name: /▾/ })).not.toBeInTheDocument()
  })

  it('defaults to "All branches" on the dashboard with nothing selected yet', () => {
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'All branches ▾' })).toBeInTheDocument()
  })

  it('defaults to the first branch (not "All") on Menu Management', () => {
    mockPathname = '/admin/menu-items'
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'Downtown ▾' })).toBeInTheDocument()
  })

  it('honors ?branch= from the URL over the page-appropriate default', () => {
    mockSearchParams = new URLSearchParams('branch=b2')
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'Uptown ▾' })).toBeInTheDocument()
  })

  it('falls back to a previously saved localStorage selection when the URL has no ?branch=', () => {
    localStorage.setItem('selectedBranchId', 'b2')
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'Uptown ▾' })).toBeInTheDocument()
  })

  it('ignores a saved "all" selection outside the dashboard, falling back to the first branch', () => {
    localStorage.setItem('selectedBranchId', 'all')
    mockPathname = '/admin/tables'
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'Downtown ▾' })).toBeInTheDocument()
  })

  it('syncs the URL on first load when no ?branch= is present yet', () => {
    render(<StaffBar role="admin" branches={branches} />)
    expect(replace).toHaveBeenCalledWith('/dashboard?branch=all')
  })

  it('opens a popover listing every branch, plus "All branches" only on the dashboard', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'All branches ▾' }))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All branches' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Downtown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uptown' })).toBeInTheDocument()
  })

  it('does not offer "All branches" in the popover outside the dashboard', async () => {
    mockPathname = '/admin/menu-items'
    const user = userEvent.setup()
    render(<StaffBar role="admin" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'Downtown ▾' }))

    expect(screen.queryByRole('button', { name: 'All branches' })).not.toBeInTheDocument()
  })

  it('selecting a branch closes the popover, persists it, and replaces the URL on a branch-aware page', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'All branches ▾' }))
    await user.click(screen.getByRole('button', { name: 'Uptown' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uptown ▾' })).toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith('/dashboard?branch=b2')
    expect(localStorage.getItem('selectedBranchId')).toBe('b2')
  })

  it('appends the selected branch to the Menu Management and Table Setup nav links', () => {
    mockSearchParams = new URLSearchParams('branch=b2')
    render(<StaffBar role="admin" branches={branches} />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute(
      'href',
      '/admin/menu-items?branch=b2',
    )
    expect(screen.getByRole('link', { name: 'Table Setup' })).toHaveAttribute('href', '/admin/tables?branch=b2')
  })

  it('substitutes the first branch on nav links when "All branches" is selected', () => {
    render(<StaffBar role="admin" branches={branches} />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute(
      'href',
      '/admin/menu-items?branch=b1',
    )
  })
})

describe('StaffBar mobile layout', () => {
  const branches = [
    { id: 'b1', name: 'Downtown' },
    { id: 'b2', name: 'Uptown' },
  ]
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockPathname = '/dashboard'
    mockSearchParams = new URLSearchParams()
    // Force the mobile branch: matchMedia reports the narrow-screen query as matching.
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  it('does not render nav links inline on a narrow screen', () => {
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('keeps the branch picker inline (not folded into the hamburger) on a narrow screen', () => {
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'All branches ▾' })).toBeInTheDocument()
  })

  it('folds nav links and secondary links into the hamburger menu, but not branch options', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))

    const menu = screen.getByRole('menu')
    // Nav links folded in
    expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard?branch=all')
    expect(screen.getByRole('menuitem', { name: 'Menu Management' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Table Setup' })).toBeInTheDocument()
    // Branch options are NOT in the menu — the picker stays inline
    expect(within(menu).queryByRole('menuitem', { name: 'All branches' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Uptown' })).not.toBeInTheDocument()
    // Secondary links + logout
    expect(screen.getByRole('menuitem', { name: 'Payment Methods' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Branches' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
  })

  it('a staff hamburger menu on mobile has nav links and Log out, but no admin links', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="staff" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'Show menu' }))

    expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Table Setup' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Payment Methods' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
  })

  it('the inline branch picker still works on a narrow screen', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'All branches ▾' }))
    await user.click(screen.getByRole('button', { name: 'Uptown' }))

    expect(screen.getByRole('button', { name: 'Uptown ▾' })).toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith('/dashboard?branch=b2')
  })
})
