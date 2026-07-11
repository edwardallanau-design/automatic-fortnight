import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderPage from './page'
import { getOrderingPointOrThrow } from '@/lib/orderingPointService'
import { getBranchOrThrow } from '@/lib/branchService'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { getVenueSettings } from '@/lib/venueSettingsService'
import { NotFoundError } from '@/lib/errors'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/orderingPointService', () => ({
  getOrderingPointOrThrow: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  getBranchOrThrow: vi.fn(),
}))

vi.mock('@/lib/menuService', () => ({
  listMenuItemsWithAvailability: vi.fn(),
}))

vi.mock('@/lib/venueSettingsService', () => ({
  getVenueSettings: vi.fn(),
}))

function priceOf(value: string) {
  return { toString: () => value } as never
}

describe('OrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: true, updatedAt: new Date() } as never)
    vi.mocked(getBranchOrThrow).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() } as never)
  })

  it('shows an error when the table id is missing', async () => {
    const ui = await OrderPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This table link isn't valid. Please ask staff for help.",
    )
  })

  it('shows an error when the table id does not exist', async () => {
    vi.mocked(getOrderingPointOrThrow).mockRejectedValue(new NotFoundError('Ordering point not found'))

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 'missing' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This table link isn't valid. Please ask staff for help.",
    )
  })

  it('shows a closed message when the venue is not accepting orders', async () => {
    vi.mocked(getOrderingPointOrThrow).mockResolvedValue({ id: 'op1', branchId: 'b1', label: 'Table 5', isCounter: false, createdAt: new Date() } as never)
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: false, updatedAt: new Date() } as never)

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 'op1' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We're not accepting orders right now. Please check back later.",
    )
    expect(listMenuItemsWithAvailability).not.toHaveBeenCalled()
  })

  it('shows a closed message when the branch is not accepting orders', async () => {
    vi.mocked(getOrderingPointOrThrow).mockResolvedValue({ id: 'op1', branchId: 'b1', label: 'Table 5', isCounter: false, createdAt: new Date() } as never)
    vi.mocked(getBranchOrThrow).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: false, createdAt: new Date() } as never)

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 'op1' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We're not accepting orders right now. Please check back later.",
    )
  })

  it('renders available items as enabled buttons and sold-out items as disabled', async () => {
    vi.mocked(getOrderingPointOrThrow).mockResolvedValue({ id: 'op1', branchId: 'b1', label: 'Table 5', isCounter: false, createdAt: new Date() } as never)
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: priceOf('12.50'), available: true, archived: false, createdAt: new Date() },
      { id: 'm2', name: 'Fries', price: priceOf('4.00'), available: false, archived: false, createdAt: new Date() },
    ] as never)

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 'op1' }) })
    render(ui)

    expect(screen.getByRole('button', { name: /Burger/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Fries/ })).toBeDisabled()
  })

  it('shows an empty-state message when there are no menu items', async () => {
    vi.mocked(getOrderingPointOrThrow).mockResolvedValue({ id: 'op1', branchId: 'b1', label: 'Table 5', isCounter: false, createdAt: new Date() } as never)
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([])

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 'op1' }) })
    render(ui)

    expect(screen.getByText('No items available right now.')).toBeInTheDocument()
  })
})
