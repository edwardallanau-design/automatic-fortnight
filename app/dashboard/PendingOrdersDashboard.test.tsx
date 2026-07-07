import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'
import { apiClient, ApiError } from '@/lib/apiClient'

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { get: vi.fn(), patch: vi.fn() },
  }
})

type Lanes = { pending?: unknown[]; confirmedUnpaid?: unknown[]; completedToday?: unknown[] }

function mockLanes({ pending = [], confirmedUnpaid = [], completedToday = [] }: Lanes = {}) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path.includes('paymentStatus=unpaid')) return Promise.resolve(confirmedUnpaid)
    if (path.includes('paymentStatus=paid')) return Promise.resolve(completedToday)
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

  it('renders Pending orders returned by the initial fetch', async () => {
    mockLanes({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(apiClient.get).toHaveBeenCalledWith('/api/orders?status=pending')
    expect(apiClient.get).toHaveBeenCalledWith('/api/orders?status=confirmed&paymentStatus=unpaid')
    expect(apiClient.get).toHaveBeenCalledWith('/api/orders?status=confirmed&paymentStatus=paid&date=today')
  })

  it('renders a separate lane for Confirmed & Unpaid orders', async () => {
    mockLanes({ pending: [orderA], confirmedUnpaid: [{ ...orderB, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByRole('region', { name: 'Pending orders' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Confirmed and unpaid orders' })).toBeInTheDocument()
    expect(screen.getByText('Table 7')).toBeInTheDocument()
  })

  it('shows the completed-today count', async () => {
    mockLanes({ completedToday: [{ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('1 completed today')).toBeInTheDocument()
  })

  it('re-fetches on each polling interval and renders newly-arrived orders', async () => {
    mockLanes({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.queryByText('Table 7')).not.toBeInTheDocument()

    mockLanes({ pending: [orderA, orderB] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('Table 7')).toBeInTheDocument()
  })

  it('keeps showing the last-known orders when a poll tick fails', async () => {
    mockLanes({ pending: [orderA] })
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

  it('shows "No pending orders" when every lane is empty', async () => {
    mockLanes()
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('No pending orders')).toBeInTheDocument()
  })

  it('opens the detail modal when a card is tapped', async () => {
    mockLanes({ pending: [orderA] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeInTheDocument()
  })

  it('confirms a Pending order from the modal and moves it to the Confirmed & Unpaid lane', async () => {
    mockLanes({ pending: [orderA] })
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
    expect(screen.getByRole('region', { name: 'Confirmed and unpaid orders' })).toBeInTheDocument()
  })

  it('confirming an already-Paid Pending order moves it straight to the completed-today count', async () => {
    mockLanes({ pending: [{ ...orderA, paymentStatus: 'Paid' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.queryByRole('region', { name: 'Confirmed and unpaid orders' })).not.toBeInTheDocument()
    expect(screen.getByText('1 completed today')).toBeInTheDocument()
  })

  it('marks a Pending order Paid without closing the modal or changing lanes', async () => {
    mockLanes({ pending: [orderA] })
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
    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('marking a Confirmed & Unpaid order Paid moves it to the completed-today count', async () => {
    mockLanes({ confirmedUnpaid: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('1 completed today')).toBeInTheDocument()
  })

  it('shows an inline error in the modal and keeps it open when confirming fails', async () => {
    mockLanes({ pending: [orderA] })
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

  it('allows an admin to revert a Paid, Confirmed & Unpaid-lane order back to Unpaid', async () => {
    mockLanes({ confirmedUnpaid: [{ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' })
    render(<PendingOrdersDashboard role="admin" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Unpaid' }))
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/pay', { paymentStatus: 'Unpaid' })
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()
  })

  it('closes the modal on backdrop click without calling any mutation', async () => {
    mockLanes({ pending: [orderA] })
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
})
