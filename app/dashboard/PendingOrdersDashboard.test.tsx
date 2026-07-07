import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'
import { apiClient, ApiError } from '@/lib/apiClient'

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { get: vi.fn(), patch: vi.fn() },
  }
})

type Tabs = { pending?: unknown[]; confirmed?: unknown[] }

function mockTabs({ pending = [], confirmed = [] }: Tabs = {}) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path.includes('status=confirmed')) return Promise.resolve(confirmed)
    return Promise.resolve(pending)
  })
}

const orderA = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  customerName: null,
  table: { number: 4 },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

const orderB = {
  id: 'o2',
  orderNumber: 102,
  createdAt: '2026-07-04T12:01:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  customerName: null,
  table: { number: 7 },
  items: [{ id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
}

describe('PendingOrdersDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:02:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders Pending orders on the Pending tab by default and polls both endpoints', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(apiClient.get).toHaveBeenCalledWith('/api/orders?status=pending')
    expect(apiClient.get).toHaveBeenCalledWith('/api/orders?status=confirmed&date=today')
  })

  it('shows live counts on both tab labels without switching tabs', async () => {
    mockTabs({ pending: [orderA], confirmed: [{ ...orderB, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByRole('tab', { name: 'Pending (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Confirmed (1)' })).toBeInTheDocument()
    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.queryByText('Table 7')).not.toBeInTheDocument()
  })

  it('switching to the Confirmed tab shows confirmed orders already fetched in the background', async () => {
    mockTabs({ pending: [orderA], confirmed: [{ ...orderB, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))

    expect(screen.getByText('Table 7')).toBeInTheDocument()
    expect(screen.queryByText('Table 4')).not.toBeInTheDocument()
  })

  it('re-fetches on each polling interval and updates the active tab', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.queryByText('Table 7')).not.toBeInTheDocument()

    mockTabs({ pending: [orderA, orderB] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('Table 7')).toBeInTheDocument()
  })

  it('keeps showing the last-known orders when a poll tick fails', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Table 4')).toBeInTheDocument()

    vi.mocked(apiClient.get).mockRejectedValue(new Error('network error'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('Table 4')).toBeInTheDocument()
  })

  it('shows an empty message on the Pending tab when there are no pending orders', async () => {
    mockTabs()
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('No pending orders')).toBeInTheDocument()
  })

  it('shows an empty message on the Confirmed tab when nothing has been confirmed today', async () => {
    mockTabs()
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (0)' }))

    expect(screen.getByText('No orders confirmed yet today')).toBeInTheDocument()
  })

  it('opens the detail modal when a card is tapped', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeInTheDocument()
  })

  it('confirms a Pending order: it exits the Pending tab immediately but does not appear on the Confirmed tab until the next poll', async () => {
    mockTabs({ pending: [orderA] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
    })
    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/confirm', {})

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Table 4')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Confirmed (0)' })).toBeInTheDocument()

    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByRole('tab', { name: 'Confirmed (1)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    expect(screen.getByText('Table 4')).toBeInTheDocument()
  })

  it('shows an inline error in the modal and keeps it open when confirming fails', async () => {
    mockTabs({ pending: [orderA] })
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('CONFLICT', 'Order is Confirmed, not Pending'))
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Order is Confirmed, not Pending')
    expect(screen.getByRole('button', { name: 'Confirm order' })).not.toBeDisabled()
  })

  it('marks a Pending order Paid in place — stays on the Pending tab, modal stays open', async () => {
    mockTabs({ pending: [orderA] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, paymentStatus: 'Paid' })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/pay', { paymentStatus: 'Paid' })
    const dialog = screen.getByRole('dialog', { name: 'Order 101' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Paid')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Pending (1)' })).toBeInTheDocument()
  })

  it('marks a Confirmed order Paid in place — stays on the Confirmed tab, modal stays open', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/pay', { paymentStatus: 'Paid' })
    const dialog = screen.getByRole('dialog', { name: 'Order 101' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Paid')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Confirmed (1)' })).toBeInTheDocument()
  })

  it('allows an admin to revert a Paid Confirmed order back to Unpaid, in place', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' })
    render(<PendingOrdersDashboard role="admin" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Unpaid' }))
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/pay', { paymentStatus: 'Unpaid' })
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Confirmed (1)' })).toBeInTheDocument()
  })

  it('closes the modal on backdrop click without calling any mutation', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-detail-modal-backdrop'))
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiClient.patch).not.toHaveBeenCalled()
  })

  it('does not let a stale close timer from order A clobber a modal reopened for order B', async () => {
    mockTabs({ pending: [orderA, orderB] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-detail-modal-backdrop'))
    })

    fireEvent.click(screen.getByRole('button', { name: /Order 102/ }))
    expect(screen.getByRole('dialog', { name: 'Order 102' })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.getByRole('dialog', { name: 'Order 102' })).toBeInTheDocument()
  })

  it('does not let a stale close timer clobber order A after it is reopened before the timer fires', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-detail-modal-backdrop'))
    })

    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeInTheDocument()
  })
})
