import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderPage from './page'
import { getTableOrThrow } from '@/lib/tableService'
import { listMenuItems } from '@/lib/menuService'
import { NotFoundError } from '@/lib/errors'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/tableService', () => ({
  getTableOrThrow: vi.fn(),
}))

vi.mock('@/lib/menuService', () => ({
  listMenuItems: vi.fn(),
}))

function priceOf(value: string) {
  return { toString: () => value } as never
}

describe('OrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an error when the table id is missing', async () => {
    const ui = await OrderPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This table link isn't valid. Please ask staff for help.",
    )
  })

  it('shows an error when the table id does not exist', async () => {
    vi.mocked(getTableOrThrow).mockRejectedValue(new NotFoundError('Table not found'))

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 'missing' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This table link isn't valid. Please ask staff for help.",
    )
  })

  it('renders available items as enabled buttons and sold-out items as disabled', async () => {
    vi.mocked(getTableOrThrow).mockResolvedValue({
      id: 't1',
      number: 5,
      createdAt: new Date(),
    } as never)
    vi.mocked(listMenuItems).mockResolvedValue([
      {
        id: 'm1',
        name: 'Burger',
        price: priceOf('12.50'),
        available: true,
        archived: false,
        createdAt: new Date(),
      },
      {
        id: 'm2',
        name: 'Fries',
        price: priceOf('4.00'),
        available: false,
        archived: false,
        createdAt: new Date(),
      },
    ] as never)

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 't1' }) })
    render(ui)

    expect(screen.getByRole('button', { name: /Burger/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Fries/ })).toBeDisabled()
  })

  it('shows an empty-state message when there are no menu items', async () => {
    vi.mocked(getTableOrThrow).mockResolvedValue({
      id: 't1',
      number: 5,
      createdAt: new Date(),
    } as never)
    vi.mocked(listMenuItems).mockResolvedValue([])

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 't1' }) })
    render(ui)

    expect(screen.getByText('No items available right now.')).toBeInTheDocument()
  })
})
