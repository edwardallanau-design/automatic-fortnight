# Staff Dashboard Tabs Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's Pending / Confirmed & Unpaid / Completed-today three-way split with two real tabs (Pending, Confirmed-as-daily-history), and make the payment toggle a plain flag with no lane-routing side effects.

**Architecture:** `PendingOrdersDashboard` polls two endpoints continuously in the background regardless of which tab is active (`status=pending`, `status=confirmed&date=today`), and renders only the active tab's list. The only animated transition is Pending → Confirmed (via `handleConfirm`); marking Paid/Unpaid is a plain in-place field update in whichever list currently holds the order, with no exit animation and no lane movement.

**Tech Stack:** Next.js (App Router, React 19), TypeScript, Vitest 4 + React Testing Library, plain global CSS (`app/globals.css`).

## Global Constraints

- No changes to `confirmOrder`, `setPaymentStatus`, `cancelOrder`, `removeOrderItem`, or any state-machine invariant. `INV-9` (only admin reverts Paid→Unpaid) and `INV-8` (payment independent of confirmation) stay exactly as enforced today.
- No changes to `lib/orderService.ts`, `app/api/orders/route.ts`, `app/api/orders/[id]/status/route.ts`, `app/components/Modal.tsx`, `app/order/[id]/OrderStatusPoller.tsx` — this revision only touches the dashboard's own presentation layer, reusing the existing `date=today`/`paymentStatus` API filters as-is.
- Reuse `vi.advanceTimersByTimeAsync` (not plain `advanceTimersByTime`) for the polling `useEffect` and the 200ms exit-animation `setTimeout`, per this codebase's established convention.
- `app/dashboard/page.tsx` needs no changes — `PendingOrdersDashboard` keeps the same export name and `{ role }` prop.

---

### Task 1: `OrderCard` — badge reflects Paid/Unpaid on a Confirmed order

**Files:**
- Modify: `app/dashboard/OrderCard.tsx`
- Modify: `app/dashboard/OrderCard.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- No change to `OrderCard`'s props or exported types (`OrderCardOrder`, `OrderCardItem`) — only its internal badge-label logic changes. Consumed unchanged by Task 2.

- [ ] **Step 1: Update the failing test**

In `app/dashboard/OrderCard.test.tsx`, replace this existing test:

```tsx
  it('shows "Needs confirmation" for a Pending order and "Awaiting payment" for a Confirmed one', () => {
    const { rerender } = render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Needs confirmation')).toBeInTheDocument()

    rerender(<OrderCard order={{ ...order, fulfillmentStatus: 'Confirmed' }} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
  })
```

with:

```tsx
  it('shows "Needs confirmation" for a Pending order, "Unpaid" for a Confirmed-and-unpaid order, and "Paid" for a Confirmed-and-paid order', () => {
    const { rerender } = render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Needs confirmation')).toBeInTheDocument()

    rerender(<OrderCard order={{ ...order, fulfillmentStatus: 'Confirmed' }} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Unpaid')).toBeInTheDocument()

    rerender(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    const paidBadge = screen.getByText('Paid')
    expect(paidBadge).toBeInTheDocument()
    expect(paidBadge).toHaveClass('order-card__badge--paid')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: FAIL — the current badge logic never renders "Unpaid"/"Paid" text or the `order-card__badge--paid` class for a Confirmed order.

- [ ] **Step 3: Update the badge logic**

In `app/dashboard/OrderCard.tsx`, replace this line:

```tsx
  const badgeLabel = order.fulfillmentStatus === 'Pending' ? 'Needs confirmation' : 'Awaiting payment'
```

with:

```tsx
  const badgeLabel =
    order.fulfillmentStatus === 'Pending'
      ? 'Needs confirmation'
      : order.paymentStatus === 'Paid'
        ? 'Paid'
        : 'Unpaid'
  const badgePaid = order.fulfillmentStatus === 'Confirmed' && order.paymentStatus === 'Paid'
```

Then replace this line:

```tsx
        <span className="order-card__badge">{badgeLabel}</span>
```

with:

```tsx
        <span className={`order-card__badge${badgePaid ? ' order-card__badge--paid' : ''}`}>{badgeLabel}</span>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: FAIL still, on the `order-card__badge--paid` class assertion — the CSS modifier class exists in JSX now but hasn't been styled yet. This is expected; proceed to Step 5.

- [ ] **Step 5: Add the `--paid` badge CSS modifier**

In `app/globals.css`, immediately after the existing `.order-card__badge { ... }` rule, add:

```css
.order-card__badge--paid {
  color: var(--sage);
  background: color-mix(in srgb, var(--sage) 15%, transparent);
}
```

- [ ] **Step 6: Re-run the test to confirm it passes**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: PASS (CSS doesn't execute in jsdom, but the class-name assertion in Step 1 now matches the JSX from Step 3 — this run just re-confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/OrderCard.tsx app/dashboard/OrderCard.test.tsx app/globals.css
git commit -m "feat: OrderCard badge shows Paid/Unpaid for Confirmed orders"
```

---

### Task 2: `PendingOrdersDashboard` — replace lanes with tabs, simplify payment toggle

**Files:**
- Modify: `app/dashboard/PendingOrdersDashboard.tsx` (full rewrite)
- Modify: `app/dashboard/PendingOrdersDashboard.test.tsx` (full rewrite)
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `OrderCard`/`OrderCardOrder` (Task 1, unchanged props), `OrderDetailModal` (unchanged — its props and action-visibility branches are untouched by this revision; only its *caller's* post-mutation behavior changes).
- Produces: `PendingOrdersDashboard({ role: Role })` — same export name and prop shape as today, so `app/dashboard/page.tsx` needs no change.

- [ ] **Step 1: Replace the full test file (TDD: this is the failing-test step)**

Replace the full contents of `app/dashboard/PendingOrdersDashboard.test.tsx`:

```tsx
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
    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
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
    expect(screen.getByRole('dialog', { name: 'Order 101' })).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — the current implementation has no tab switcher, still fetches three endpoints, and still routes payment changes between lanes.

- [ ] **Step 3: Replace the full contents of `PendingOrdersDashboard.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { apiClient, ApiError } from '@/lib/apiClient'
import type { Role } from '@/lib/types'
import { OrderCard, type OrderCardOrder } from './OrderCard'
import { OrderDetailModal } from './OrderDetailModal'

const POLL_INTERVAL_MS = 3500
const EXIT_MS = 200

type DashboardOrder = OrderCardOrder
type Tab = 'pending' | 'confirmed'

type ModalState = { orderId: string; busy: boolean; error: string | null; closing: boolean }

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
}

async function fetchTabs(): Promise<{ pending: DashboardOrder[]; confirmed: DashboardOrder[] }> {
  const [pending, confirmed] = await Promise.all([
    apiClient.get<DashboardOrder[]>('/api/orders?status=pending'),
    apiClient.get<DashboardOrder[]>('/api/orders?status=confirmed&date=today'),
  ])
  return { pending, confirmed }
}

export function PendingOrdersDashboard({ role }: { role: Role }) {
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [pendingOrders, setPendingOrders] = useState<DashboardOrder[]>([])
  const [confirmedOrders, setConfirmedOrders] = useState<DashboardOrder[]>([])
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState | null>(null)
  const closeTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const tabs = await fetchTabs()
        if (cancelled) return
        setPendingOrders(tabs.pending)
        setConfirmedOrders(tabs.confirmed)
      } catch {
        // Transient poll failure: keep the last-known lists, retry next tick.
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    return () => {
      for (const timerId of closeTimersRef.current) clearTimeout(timerId)
      closeTimersRef.current.clear()
    }
  }, [])

  const selectedOrder = modal
    ? [...pendingOrders, ...confirmedOrders].find((order) => order.id === modal.orderId) ?? null
    : null

  function openModal(orderId: string) {
    setModal({ orderId, busy: false, error: null, closing: false })
  }

  function closeModal() {
    const closingOrderId = modal?.orderId
    setModal((current) => (current ? { ...current, closing: true } : current))
    const timerId: ReturnType<typeof setTimeout> = setTimeout(() => {
      closeTimersRef.current.delete(timerId)
      setModal((current) => (current && current.orderId === closingOrderId && current.closing ? null : current))
    }, EXIT_MS)
    closeTimersRef.current.add(timerId)
  }

  async function handleConfirm(order: DashboardOrder) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      await apiClient.patch<DashboardOrder>(`/api/orders/${order.id}/confirm`, {})
      setExitingIds((current) => new Set(current).add(order.id))
      setModal((current) => (current ? { ...current, closing: true } : current))
      const timerId: ReturnType<typeof setTimeout> = setTimeout(() => {
        closeTimersRef.current.delete(timerId)
        setPendingOrders((current) => current.filter((o) => o.id !== order.id))
        setExitingIds((current) => {
          const next = new Set(current)
          next.delete(order.id)
          return next
        })
        setModal((current) => (current && current.orderId === order.id && current.closing ? null : current))
      }, EXIT_MS)
      closeTimersRef.current.add(timerId)
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  async function handleSetPaymentStatus(order: DashboardOrder, paymentStatus: 'Paid' | 'Unpaid') {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      const updated = await apiClient.patch<DashboardOrder>(`/api/orders/${order.id}/pay`, { paymentStatus })
      const applyUpdate = (current: DashboardOrder[]) =>
        current.map((o) => (o.id === order.id ? { ...o, paymentStatus: updated.paymentStatus } : o))
      setPendingOrders(applyUpdate)
      setConfirmedOrders(applyUpdate)
      setModal((current) => (current ? { ...current, busy: false, error: null } : current))
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  const activeOrders = activeTab === 'pending' ? pendingOrders : confirmedOrders
  const emptyMessage = activeTab === 'pending' ? 'No pending orders' : 'No orders confirmed yet today'

  return (
    <div className="order-rail">
      <div className="order-rail__status">
        <span className="order-rail__pulse" aria-hidden="true" />
        <span>Live — refreshes every few seconds</span>
      </div>

      <div className="order-rail__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pending'}
          className={`order-rail__tab${activeTab === 'pending' ? ' order-rail__tab--active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({pendingOrders.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'confirmed'}
          className={`order-rail__tab${activeTab === 'confirmed' ? ' order-rail__tab--active' : ''}`}
          onClick={() => setActiveTab('confirmed')}
        >
          Confirmed ({confirmedOrders.length})
        </button>
      </div>

      <section
        className="order-rail__panel"
        aria-label={activeTab === 'pending' ? 'Pending orders' : 'Confirmed orders'}
      >
        {activeOrders.length === 0 ? (
          <p className="order-rail__empty-eyebrow">{emptyMessage}</p>
        ) : (
          <ul className="order-grid">
            {activeOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                exiting={exitingIds.has(order.id)}
                onOpen={() => openModal(order.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {modal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          role={role}
          busy={modal.busy}
          error={modal.error}
          exiting={modal.closing}
          onConfirm={() => handleConfirm(selectedOrder)}
          onSetPaymentStatus={(paymentStatus) => handleSetPaymentStatus(selectedOrder, paymentStatus)}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `app/globals.css` — remove dead rules, add tab styles**

Remove these now-unused rules (nothing renders `.order-rail__summary`, `.order-rail__lane`, `.order-rail__lane-heading`, or the top-level `.order-rail__empty` wrapper anymore — the JSX above uses `.order-rail__panel` and `.order-rail__empty-eyebrow` alone):
- `.order-rail__empty { ... }` (the flex-column wrapper — keep `.order-rail__empty-eyebrow`, it's still used directly on the per-tab empty `<p>`)
- `.order-rail__summary { ... }`, `.order-rail__summary--bump { ... }`, `@keyframes order-rail-summary-bump { ... }`, and its `@media (prefers-reduced-motion: reduce) { .order-rail__summary--bump { animation: none; } }` block
- `.order-rail__lane { ... }`, `.order-rail__lane:first-of-type { ... }`, `.order-rail__lane-heading { ... }`

Add, in place of the removed `.order-rail__lane*` rules:

```css
.order-rail__tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--clay-faint);
}

.order-rail__tab {
  padding: 0.6rem 0.2rem;
  margin-bottom: -1px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--clay);
  cursor: pointer;
}

.order-rail__tab:hover {
  color: var(--espresso);
}

.order-rail__tab:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.order-rail__tab--active {
  color: var(--espresso);
  border-bottom-color: var(--copper);
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/globals.css
git commit -m "feat: replace dashboard lanes with Pending/Confirmed tabs, simplify payment toggle"
```
