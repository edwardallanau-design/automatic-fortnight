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
  getBranchOrThrow: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

import { getBranchOrThrow } from '@/lib/branchService'

function callPage(branch?: string) {
  return DashboardPage({ searchParams: Promise.resolve(branch ? { branch } : {}) })
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue([])
    vi.mocked(listBranches).mockResolvedValue([])
    vi.mocked(getBranchOrThrow).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() } as never)
  })

  it('renders the Order Dashboard for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff', branchId: 'b1' })

    const ui = await callPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Order Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText('No pending orders')).toBeInTheDocument()
  })

  it('shows the staff session\'s own branch name as the eyebrow', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff', branchId: 'b1' })
    vi.mocked(getBranchOrThrow).mockResolvedValue({ id: 'b1', name: 'Riverside', acceptingOrders: true, createdAt: new Date() } as never)

    const ui = await callPage()
    render(ui)

    expect(screen.getByText('Riverside')).toBeInTheDocument()
    expect(getBranchOrThrow).toHaveBeenCalledWith('b1')
  })

  it('shows the selected branch name as the eyebrow for admin', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    const ui = await callPage('b2')
    render(ui)

    expect(screen.getByText('Downtown')).toBeInTheDocument()
  })

  it('shows "All branches" as the eyebrow for admin on the aggregate view', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    const ui = await callPage('all')
    render(ui)

    expect(screen.getByText('All branches')).toBeInTheDocument()
  })

  it('shows a prominent New order button for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff', branchId: 'b1' })

    const ui = await callPage()
    render(ui)

    expect(screen.getByRole('link', { name: '+ New order' })).toHaveAttribute('href', '/order/new')
  })

  it('shows the New order button for an admin session too', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })

    const ui = await callPage()
    render(ui)

    expect(screen.getByRole('link', { name: '+ New order' })).toHaveAttribute('href', '/order/new')
  })

  it('does not call listBranches for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff', branchId: 'b1' })

    const ui = await callPage()
    render(ui)

    expect(listBranches).not.toHaveBeenCalled()
    expect(screen.queryByRole('tablist', { name: 'Branch' })).not.toBeInTheDocument()
  })

  it('fetches branches for an admin session but renders no branch tab strip', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    const ui = await callPage()
    render(ui)

    expect(listBranches).toHaveBeenCalled()
    expect(screen.queryByRole('tablist', { name: 'Branch' })).not.toBeInTheDocument()
  })
})
