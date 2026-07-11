import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { OrderStatusPoller } from './OrderStatusPoller'
import { apiClient } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), del: vi.fn() } }
})

const order = {
  id: 'o1',
  orderNumber: 101,
  customerName: 'Edward',
  paymentChoice: 'Counter' as const,
  paymentMethodNameSnapshot: null,
  paymentReference: null,
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
}

describe('OrderStatusPoller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the editable OrderTicket while status is Pending', () => {
    render(<OrderStatusPoller order={order} />)
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('swaps to the locked TicketCard when a poll detects Confirmed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ fulfillmentStatus: 'Confirmed' })
    render(<OrderStatusPoller order={order} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(apiClient.get).toHaveBeenCalledWith('/api/orders/o1/status')
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
    expect(screen.getByText('Order #101 confirmed')).toBeInTheDocument()
    expect(screen.getByText('Confirmed by staff — ask staff to change anything.')).toBeInTheDocument()
  })

  it('renders the cancelled view when a poll detects Cancelled', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ fulfillmentStatus: 'Cancelled' })
    render(<OrderStatusPoller order={order} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('This order was cancelled.')).toBeInTheDocument()
  })

  it('stops polling once status is no longer Pending', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ fulfillmentStatus: 'Confirmed' })
    render(<OrderStatusPoller order={order} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })
    expect(apiClient.get).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })
    expect(apiClient.get).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the editable ticket when a poll tick fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network error'))
    render(<OrderStatusPoller order={order} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('shows the payment note on the confirmed ticket', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ fulfillmentStatus: 'Confirmed' })
    render(<OrderStatusPoller order={{ ...order, paymentChoice: 'Online', paymentMethodNameSnapshot: 'GCash', paymentReference: 'TXN123' }} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('You chose to pay online via GCash. Reference: TXN123.')).toBeInTheDocument()
  })
})
