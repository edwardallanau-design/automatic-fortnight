import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'
import { apiClient } from '@/lib/apiClient'

vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: vi.fn() },
}))

const orderA = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  table: { number: 4 },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

const orderB = {
  id: 'o2',
  orderNumber: 102,
  createdAt: '2026-07-04T12:01:00.000Z',
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
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('No pending orders')).toBeInTheDocument()
  })
})
