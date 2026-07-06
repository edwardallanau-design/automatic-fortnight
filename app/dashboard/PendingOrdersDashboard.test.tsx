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

const orderA = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  paymentStatus: 'Unpaid',
  table: { number: 4 },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

const orderB = {
  id: 'o2',
  orderNumber: 102,
  createdAt: '2026-07-04T12:01:00.000Z',
  paymentStatus: 'Unpaid',
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

  it('renders orders returned by the initial fetch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(apiClient.get).toHaveBeenCalledWith('/api/orders?status=pending')
  })

  it('re-fetches on each polling interval and renders newly-arrived orders', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce([orderA])
      .mockResolvedValueOnce([orderA, orderB])
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.queryByText('Table 7')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('Table 7')).toBeInTheDocument()
    expect(apiClient.get).toHaveBeenCalledTimes(2)
  })

  it('keeps showing the last-known orders when a poll tick fails', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce([orderA])
      .mockRejectedValueOnce(new Error('network error'))
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Table 4')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('Table 4')).toBeInTheDocument()
  })

  it('shows "No pending orders" when the list is empty', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([])
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('No pending orders')).toBeInTheDocument()
  })

  it('confirms an order and removes it from the list on success', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })

    expect(window.confirm).toHaveBeenCalledWith('Confirm order #101?')
    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/confirm', {})
    expect(screen.queryByText('#101')).not.toBeInTheDocument()
    expect(screen.getByText('No pending orders')).toBeInTheDocument()
  })

  it('does not call the confirm API when the confirm dialog is cancelled', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })

    expect(apiClient.patch).not.toHaveBeenCalled()
    expect(screen.getByText('#101')).toBeInTheDocument()
  })

  it('shows an inline error and re-enables the Confirm button when confirming fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('CONFLICT', 'Order is Confirmed, not Pending'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Order is Confirmed, not Pending')
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled()
  })

  it('disables the Confirm button while the request is in flight', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let resolvePatch: (value: unknown) => void = () => {}
    vi.mocked(apiClient.patch).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve
      }),
    )
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    await act(async () => {
      resolvePatch({ ...orderA, fulfillmentStatus: 'Confirmed' })
      await Promise.resolve()
    })
  })

  it('marks an order Paid and keeps it visible with updated status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, paymentStatus: 'Paid' })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/pay', { paymentStatus: 'Paid' })
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('shows a static Paid label (no revert button) for staff on a Paid order', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ ...orderA, paymentStatus: 'Paid' }])
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark Unpaid' })).not.toBeInTheDocument()
  })

  it('allows an admin to revert a Paid order back to Unpaid', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ ...orderA, paymentStatus: 'Paid' }])
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, paymentStatus: 'Unpaid' })
    render(<PendingOrdersDashboard role="admin" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Unpaid' }))
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/pay', { paymentStatus: 'Unpaid' })
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()
  })

  it('shows an inline error and re-enables the button when marking Paid fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('NOT_FOUND', 'Order not found'))
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Order not found')
    expect(screen.getByRole('button', { name: 'Mark Paid' })).not.toBeDisabled()
  })

  it('disables the Mark Paid button while the request is in flight and clears a prior error on success', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    let rejectFirst: (err: unknown) => void = () => {}
    vi.mocked(apiClient.patch).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirst = reject
      }),
    )
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()

    await act(async () => {
      rejectFirst(new ApiError('NOT_FOUND', 'Order not found'))
      await Promise.resolve()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Order not found')

    vi.mocked(apiClient.patch).mockResolvedValueOnce({ ...orderA, paymentStatus: 'Paid' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
      await Promise.resolve()
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })
})
