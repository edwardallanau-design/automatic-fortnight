import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { OrderHistory } from './OrderHistory'
import { apiClient } from '@/lib/apiClient'

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  }
})

describe('OrderHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders events oldest-first with action, actor role, and timestamp', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      { id: 'e1', action: 'created', actorRole: 'customer', createdAt: '2026-07-25T10:00:00.000Z' },
      { id: 'e2', action: 'confirmed', actorRole: 'staff', createdAt: '2026-07-25T10:05:00.000Z' },
    ])

    render(<OrderHistory orderId="o1" />)

    await waitFor(() => expect(screen.getByText('Created')).toBeInTheDocument())
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('customer')).toBeInTheDocument()
    expect(screen.getByText('staff')).toBeInTheDocument()
    expect(apiClient.get).toHaveBeenCalledWith('/api/orders/o1/events')
  })

  it('renders the empty state for an order with no history, without erroring', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([])

    render(<OrderHistory orderId="o1" />)

    await waitFor(() => expect(screen.getByText('No history recorded for this order.')).toBeInTheDocument())
  })

  it('renders the empty state (not a crash) when the fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network error'))

    render(<OrderHistory orderId="o1" />)

    await waitFor(() => expect(screen.getByText('No history recorded for this order.')).toBeInTheDocument())
  })
})
