import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'
import { apiClient, ApiError } from '@/lib/apiClient'

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { get: vi.fn(), patch: vi.fn(), del: vi.fn(), post: vi.fn() },
  }
})

let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

type Tabs = { pending?: unknown[]; confirmed?: unknown[]; menuByBranch?: Record<string, unknown[]> }

function mockTabs({ pending = [], confirmed = [], menuByBranch = {} }: Tabs = {}) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path.includes('/api/menu-items')) {
      const branchId = new URL(path, 'http://localhost').searchParams.get('branchId')
      return Promise.resolve((branchId && menuByBranch[branchId]) ?? [])
    }
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
  branchId: 'b1',
  branch: { name: 'Main' },
  orderingPoint: { label: 'Table 4' },
  items: [{ id: 'i1', menuItemId: 'm1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

const orderB = {
  id: 'o2',
  orderNumber: 102,
  createdAt: '2026-07-04T12:01:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  customerName: null,
  branchId: 'b2',
  branch: { name: 'Downtown' },
  orderingPoint: { label: 'Table 7' },
  items: [{ id: 'i2', menuItemId: 'm2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
}

describe('PendingOrdersDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:02:00.000Z'))
    mockSearchParams = new URLSearchParams()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders Pending orders on the Pending tab by default and polls both endpoints', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))

    expect(screen.getByText('Table 7')).toBeInTheDocument()
    expect(screen.queryByText('Table 4')).not.toBeInTheDocument()
  })

  it('re-fetches on each polling interval and updates the active tab', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('No pending orders')).toBeInTheDocument()
  })

  it('shows an empty message on the Confirmed tab when nothing has been confirmed today', async () => {
    mockTabs()
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (0)' }))

    expect(screen.getByText('No orders confirmed yet today')).toBeInTheDocument()
  })

  it('shows no sort control on the Pending tab', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.queryByRole('button', { name: /Newest first|Oldest first/ })).not.toBeInTheDocument()
  })

  it('sorts the Confirmed tab newest-first by default and toggles to oldest-first', async () => {
    const older = { ...orderA, fulfillmentStatus: 'Confirmed', confirmedAt: '2026-07-04T10:00:00.000Z' }
    const newer = { ...orderB, fulfillmentStatus: 'Confirmed', confirmedAt: '2026-07-04T11:00:00.000Z' }
    mockTabs({ confirmed: [older, newer] })
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (2)' }))

    const newestFirst = screen.getAllByRole('button', { name: /Order 10[12]/ })
    expect(newestFirst[0]).toHaveAttribute('aria-label', expect.stringContaining('Order 102'))
    expect(newestFirst[1]).toHaveAttribute('aria-label', expect.stringContaining('Order 101'))

    fireEvent.click(screen.getByRole('button', { name: 'Newest first' }))

    const oldestFirst = screen.getAllByRole('button', { name: /Order 10[12]/ })
    expect(oldestFirst[0]).toHaveAttribute('aria-label', expect.stringContaining('Order 101'))
    expect(oldestFirst[1]).toHaveAttribute('aria-label', expect.stringContaining('Order 102'))
  })

  it('opens the detail modal when a card is tapped', async () => {
    mockTabs({ pending: [orderA] })
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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
    expect(within(dialog).getByRole('button', { name: 'Mark Unpaid' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Pending (1)' })).toBeInTheDocument()
  })

  it('marks a Confirmed order Paid in place — stays on the Confirmed tab, modal stays open', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' })
    render(<PendingOrdersDashboard />)

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
    expect(within(dialog).getByRole('button', { name: 'Mark Unpaid' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Confirmed (1)' })).toBeInTheDocument()
  })

  it('reverts a Paid Confirmed order back to Unpaid, in place', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' })
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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

  it('shows a Cancel order button for a Pending order and cancels it after confirming', async () => {
    mockTabs({ pending: [orderA] })
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }))
    })

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Table 4')).not.toBeInTheDocument()
  })

  it('does not show a Cancel order button for a Confirmed order', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('fetches the menu for the order\'s own branch when the modal opens, and caches it per branch', async () => {
    mockTabs({
      pending: [orderA, orderB],
      menuByBranch: {
        b1: [{ id: 'm3', name: 'Cola', price: '3.00', available: true, category: null }],
        b2: [{ id: 'm4', name: 'Water', price: '2.00', available: true, category: null }],
      },
    })
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(apiClient.get).toHaveBeenCalledWith('/api/menu-items?branchId=b1')
    expect(screen.getByRole('button', { name: /Cola/ })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-detail-modal-backdrop'))
      await vi.advanceTimersByTimeAsync(200)
    })

    // Reopening order A must not refetch b1's menu -- it's already cached.
    vi.mocked(apiClient.get).mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(apiClient.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/menu-items'))

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-detail-modal-backdrop'))
      await vi.advanceTimersByTimeAsync(200)
    })

    // Order B is on a different branch -- must fetch b2's menu, not reuse b1's cache.
    fireEvent.click(screen.getByRole('button', { name: /Order 102/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(apiClient.get).toHaveBeenCalledWith('/api/menu-items?branchId=b2')
    expect(screen.getByRole('button', { name: /Water/ })).toBeInTheDocument()
  })

  it('adds an item from the picker optimistically, splicing the POST response instead of refetching the tabs', async () => {
    mockTabs({
      pending: [orderA],
      menuByBranch: { b1: [{ id: 'm2', name: 'Fries', price: '4.00', available: true, category: null }] },
    })
    // POST /items only returns lib/orderService's OrderWithItems (id + items, no orderingPoint/
    // branch) -- deliberately narrow so a regression back to spliceOrder(response) (which crashes
    // OrderDetailModal on order.orderingPoint.label, caught live via Docker Compose smoke test) fails
    // this test instead of passing on an over-generous mock.
    vi.mocked(apiClient.post).mockResolvedValue({
      id: orderA.id,
      items: [...orderA.items, { id: 'i2', menuItemId: 'm2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
    })
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    vi.mocked(apiClient.get).mockClear()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fries/ }))
    })

    expect(apiClient.post).toHaveBeenCalledWith('/api/orders/o1/items', { menuItemId: 'm2', quantity: 1 })
    // The line and total update from the POST response alone -- refreshTabs (a GET) is not called.
    expect(apiClient.get).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Increase Fries quantity' })).toBeInTheDocument()
  })

  it('shows the new line immediately, before the POST resolves (optimistic)', async () => {
    mockTabs({
      pending: [orderA],
      menuByBranch: { b1: [{ id: 'm2', name: 'Fries', price: '4.00', available: true, category: null }] },
    })
    let resolvePost!: (value: unknown) => void
    vi.mocked(apiClient.post).mockReturnValue(new Promise((resolve) => { resolvePost = resolve }))
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Fries/ }))

    expect(screen.getByRole('button', { name: 'Increase Fries quantity' })).toBeInTheDocument()

    await act(async () => {
      resolvePost({
        id: orderA.id,
        items: [...orderA.items, { id: 'i2', menuItemId: 'm2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
      })
    })
  })

  it('rolls back an optimistic add and shows the error when the POST is rejected with SOLD_OUT', async () => {
    mockTabs({
      pending: [orderA],
      menuByBranch: { b1: [{ id: 'm2', name: 'Fries', price: '4.00', available: true, category: null }] },
    })
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('SOLD_OUT', 'Fries is no longer available'))
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fries/ }))
    })

    expect(screen.queryByRole('button', { name: 'Increase Fries quantity' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Fries is no longer available')
    // The row itself is marked unavailable so a re-tap doesn't repeat the same failed request.
    expect(screen.getByRole('button', { name: /Fries/ })).toBeDisabled()
  })

  it('rolls back a rejected add WITHOUT marking the item unavailable when the conflict is not SOLD_OUT (ISSUE-28)', async () => {
    // A generic CONFLICT -- e.g. INV-16 ("order is marked Paid") or a stale non-Pending order --
    // must not be treated as "this item is sold out". Regression: an earlier version keyed this
    // off the broad CONFLICT code, so ANY 409 on an add greyed out a perfectly available item for
    // the rest of the dashboard session, live-reproduced via a real Docker Compose smoke test.
    mockTabs({
      pending: [orderA],
      menuByBranch: { b1: [{ id: 'm2', name: 'Fries', price: '4.00', available: true, category: null }] },
    })
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError('CONFLICT', 'This order is marked Paid. Revert it to Unpaid to change items.'),
    )
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fries/ }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('This order is marked Paid')
    // Fries is still genuinely available -- the row must not be disabled by this unrelated conflict.
    expect(screen.getByRole('button', { name: /Fries/ })).not.toBeDisabled()
  })

  it('disables Confirm/Cancel/Mark Paid/Print while an add is in flight, and re-enables once it settles', async () => {
    mockTabs({
      pending: [orderA],
      menuByBranch: { b1: [{ id: 'm2', name: 'Fries', price: '4.00', available: true, category: null }] },
    })
    let resolvePost!: (value: unknown) => void
    vi.mocked(apiClient.post).mockReturnValue(new Promise((resolve) => { resolvePost = resolve }))
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Fries/ }))

    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDisabled()
    // Steppers stay usable -- only settle actions are guarded.
    expect(screen.getByRole('button', { name: 'Increase Burger quantity' })).not.toBeDisabled()

    await act(async () => {
      resolvePost({
        id: orderA.id,
        items: [...orderA.items, { id: 'i2', menuItemId: 'm2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
      })
    })

    expect(screen.getByRole('button', { name: 'Confirm order' })).not.toBeDisabled()
  })

  it('adjusts a line item quantity with the stepper, calling PATCH and splicing the response', async () => {
    mockTabs({ pending: [orderA] })
    // PATCH /items/:id returns the same narrow OrderWithItems shape as POST /items -- see the
    // comment on the optimistic-add test above.
    vi.mocked(apiClient.patch).mockResolvedValue({ id: orderA.id, items: [{ ...orderA.items[0], quantity: 3 }] })
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    vi.mocked(apiClient.get).mockClear()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/items/i1', { quantity: 3 })
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('removes a line item after confirming, calling DELETE and splicing the response', async () => {
    const twoItemOrder = {
      ...orderA,
      items: [...orderA.items, { id: 'i2', menuItemId: 'm2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
    }
    mockTabs({ pending: [twoItemOrder] })
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    render(<PendingOrdersDashboard />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Remove Fries' }))
    vi.mocked(apiClient.get).mockClear()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    })

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1/items/i2')
    expect(apiClient.get).not.toHaveBeenCalled()
    expect(screen.queryByText('Fries')).not.toBeInTheDocument()
  })

  it('does not render editable item controls for a Confirmed order when the session role is staff', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    expect(screen.queryByRole('button', { name: 'Increase Burger quantity' })).not.toBeInTheDocument()
  })

  it('renders editable item controls for a Confirmed order when the session role is admin', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed' }] })
    render(<PendingOrdersDashboard role="admin" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Confirmed (1)' }))
    fireEvent.click(screen.getByRole('button', { name: /Order 101/ }))

    expect(screen.getByRole('button', { name: 'Increase Burger quantity' })).toBeInTheDocument()
  })

  it('does not let a stale close timer from order A clobber a modal reopened for order B', async () => {
    mockTabs({ pending: [orderA, orderB] })
    render(<PendingOrdersDashboard />)

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
    render(<PendingOrdersDashboard />)

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

  describe('branch scoping (admin only, via header context)', () => {
    it('renders no branch tab strip regardless of branches or ?branch=', async () => {
      mockSearchParams = new URLSearchParams('branch=b2')
      mockTabs({ pending: [orderA, orderB] })
      render(
        <PendingOrdersDashboard
          branches={[
            { id: 'b1', name: 'Main' },
            { id: 'b2', name: 'Downtown' },
          ]}
        />,
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.queryByRole('tablist', { name: 'Branch' })).not.toBeInTheDocument()
    })

    it('defaults to showing every branch\'s orders with a branch tag when there is no ?branch=', async () => {
      mockTabs({ pending: [orderA, orderB] })
      render(
        <PendingOrdersDashboard
          branches={[
            { id: 'b1', name: 'Main' },
            { id: 'b2', name: 'Downtown' },
          ]}
        />,
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.getByText('Table 4')).toBeInTheDocument()
      expect(screen.getByText('Table 7')).toBeInTheDocument()
      expect(screen.getByText('· Main')).toBeInTheDocument()
      expect(screen.getByText('· Downtown')).toBeInTheDocument()
    })

    it('scopes orders to the branch named in ?branch=, hiding the branch tag', async () => {
      mockSearchParams = new URLSearchParams('branch=b2')
      mockTabs({ pending: [orderA, orderB] })
      render(
        <PendingOrdersDashboard
          branches={[
            { id: 'b1', name: 'Main' },
            { id: 'b2', name: 'Downtown' },
          ]}
        />,
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.getByText('Table 7')).toBeInTheDocument()
      expect(screen.queryByText('Table 4')).not.toBeInTheDocument()
      expect(screen.queryByText('· Downtown')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Pending (1)' })).toBeInTheDocument()
    })

    it('an explicit ?branch=all behaves the same as no ?branch= at all', async () => {
      mockSearchParams = new URLSearchParams('branch=all')
      mockTabs({ pending: [orderA, orderB] })
      render(
        <PendingOrdersDashboard
          branches={[
            { id: 'b1', name: 'Main' },
            { id: 'b2', name: 'Downtown' },
          ]}
        />,
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.getByText('Table 4')).toBeInTheDocument()
      expect(screen.getByText('Table 7')).toBeInTheDocument()
    })

    it('never shows a branch tag when branches is empty, even with no ?branch=', async () => {
      mockTabs({ pending: [orderA] })
      render(<PendingOrdersDashboard />)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.queryByText('· Main')).not.toBeInTheDocument()
    })
  })
})
