import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardPage from './page'
import { requireRole } from '@/lib/authGuard'
import { apiClient } from '@/lib/apiClient'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: vi.fn() },
}))

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue([])
  })

  it('renders the pending orders dashboard for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByText('Staff Dashboard')).toBeInTheDocument()
    expect(await screen.findByText('No pending orders')).toBeInTheDocument()
  })

  it('still shows admin-only nav links for an admin session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })

    const ui = await DashboardPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table Setup' })).toBeInTheDocument()
  })
})
