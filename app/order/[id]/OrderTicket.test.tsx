import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('removes a line via the item DELETE route and refreshes', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1/items/oi1')
    expect(refresh).toHaveBeenCalled()
  })

  it('cancels the order via the order DELETE route and refreshes', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1')
    expect(refresh).toHaveBeenCalled()
  })

  it('hides the Remove button when only one line remains', () => {
    render(
      <OrderTicket
        order={{ id: 'o1', orderNumber: 47, items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }] }}
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This order was just confirmed by staff and can no longer be changed.',
    )
    expect(refresh).toHaveBeenCalled()
  })
})
