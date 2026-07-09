import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminSettingsPage from './page'
import { requireRole } from '@/lib/authGuard'
import { getVenueSettings } from '@/lib/venueSettingsService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/venueSettingsService', () => ({
  getVenueSettings: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: true, updatedAt: new Date() } as never)
  })

  it('is gated behind an admin session', async () => {
    await AdminSettingsPage()

    expect(requireRole).toHaveBeenCalledWith('admin')
  })

  it('shows the Settings heading and the current accepting-orders state', async () => {
    const ui = await AdminSettingsPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('reflects a closed venue as unchecked', async () => {
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: false, updatedAt: new Date() } as never)

    const ui = await AdminSettingsPage()
    render(ui)

    expect(screen.getByRole('switch')).not.toBeChecked()
  })
})
