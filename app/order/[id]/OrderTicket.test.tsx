import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderTicket } from './OrderTicket'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}))

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient')
  return { ...actual, apiClient: { del: vi.fn() } }
})

function twoLineOrder() {
  return {
    id: 'o1',
    orderNumber: 47,
    customerName: null,
    items: [
      { id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 },
      { id: 'oi2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 2 },
    ],
  }
}

describe('OrderTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens a confirm dialog on Remove and does not call the API until confirmed', async () => {
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))

    expect(screen.getByRole('dialog', { name: 'Remove item?' })).toBeInTheDocument()
    expect(apiClient.del).not.toHaveBeenCalled()
  })

  it('removes a line via the item DELETE route and refreshes once the dialog is confirmed', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1/items/oi1')
    expect(refresh).toHaveBeenCalled()
  })

  it('closes the remove dialog without calling the API when "Never mind" is clicked', async () => {
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))
    await user.click(screen.getByRole('button', { name: 'Never mind' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(apiClient.del).not.toHaveBeenCalled()
  })

  it('opens a confirm dialog on Cancel order and does not call the API until confirmed', async () => {
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))

    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()
    expect(apiClient.del).not.toHaveBeenCalled()
  })

  it('cancels the order via the order DELETE route and refreshes once the dialog is confirmed', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1')
    expect(refresh).toHaveBeenCalled()
  })

  it('hides the Remove button when only one line remains', () => {
    render(
      <OrderTicket
        order={{ id: 'o1', orderNumber: 47, customerName: null, items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }] }}
      />,
    )

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('shows an inline alert when a mutation is rejected (e.g. staff just confirmed)', async () => {
    vi.mocked(apiClient.del).mockRejectedValue(new ApiError('CONFLICT', 'Order is Confirmed, not Pending'))
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This order was just confirmed by staff and can no longer be changed.',
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('shows the customer name when the order has one', () => {
    render(
      <OrderTicket
        order={{
          id: 'o1',
          orderNumber: 7,
          customerName: 'Edward',
          items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
        }}
      />,
    )

    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })

  it('renders no name line when the order has none', () => {
    render(
      <OrderTicket
        order={{
          id: 'o1',
          orderNumber: 7,
          customerName: null,
          items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
        }}
      />,
    )

    expect(screen.queryByText(/^For /)).not.toBeInTheDocument()
  })

  it('does not claim the order is confirmed while it is still Pending', () => {
    render(<OrderTicket order={twoLineOrder()} />)

    expect(screen.getByText('Order #47')).toBeInTheDocument()
    expect(screen.queryByText(/confirmed/i)).not.toBeInTheDocument()
  })
})
