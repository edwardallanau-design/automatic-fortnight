import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardPage from './page'
import { requireRole } from '@/lib/authGuard'
import { apiClient } from '@/lib/apiClient'
import { listBranches } from '@/lib/branchService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('@/lib/branchService', () => ({
  listBranches: vi.fn(),
}))

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue([])
    vi.mocked(listBranches).mockResolvedValue([])
  })

  it('renders the pending orders dashboard for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByText('Staff Dashboard')).toBeInTheDocument()
    expect(await screen.findByText('No pending orders')).toBeInTheDocument()
  })

  it('shows a prominent New order button for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByRole('link', { name: '+ New order' })).toHaveAttribute('href', '/order/new')
  })

  it('shows the New order button for an admin session too', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })

    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByRole('link', { name: '+ New order' })).toHaveAttribute('href', '/order/new')
  })

  it('does not call listBranches for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await DashboardPage()
    render(ui)

    expect(listBranches).not.toHaveBeenCalled()
    expect(screen.queryByRole('tablist', { name: 'Branch' })).not.toBeInTheDocument()
  })

  it('shows a branch tab strip for an admin session with more than one branch', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    const ui = await DashboardPage()
    render(ui)

    expect(listBranches).toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Downtown' })).toBeInTheDocument()
  })
})
