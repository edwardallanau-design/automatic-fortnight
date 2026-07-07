# Order Tile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `OrderCard` — order number becomes a ticket-stub corner tag, the Paid/Unpaid badge always reflects the order's real payment status (no more tab-conditional "Needs confirmation"), time/item-count consolidate into one meta line, and total price becomes the visual focal point.

**Architecture:** Single-component change. `OrderCard.tsx`'s render output and `app/globals.css`'s `.order-card*` rules change together; the component's props and exported types are untouched, so nothing that consumes `OrderCard` needs to change.

**Tech Stack:** Next.js (App Router, React 19), TypeScript, Vitest 4 + React Testing Library, plain global CSS (`app/globals.css`).

## Global Constraints

- No changes to `app/dashboard/PendingOrdersDashboard.tsx`, `app/dashboard/OrderDetailModal.tsx`, `app/dashboard/page.tsx`, any API route, `lib/orderService.ts`, or any state-machine invariant.
- `OrderCard`'s exported types (`OrderCardOrder`, `OrderCardItem`) and props (`order`, `exiting`, `onOpen`) do not change.
- CSS uses only existing custom-property tokens (`--espresso`, `--crema`, `--paper`, `--copper`, `--copper-bright`, `--sage`, `--clay`, `--clay-faint`, `--font-display`, `--font-body`, `--font-mono`) and the existing `prefers-reduced-motion` convention.
- Do not reuse or modify `TicketCard.tsx`'s `.ticket__stub` class — the new `.order-card__stub` is a distinct rule for a different shape (corner tag vs. in-card label).

---

### Task 1: `OrderCard` — stub tag, always-visible payment badge, consolidated meta line, bigger total

**Files:**
- Modify: `app/dashboard/OrderCard.tsx`
- Modify: `app/dashboard/OrderCard.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- No change to `OrderCard`'s props or exported types. Consumed unchanged by `PendingOrdersDashboard.tsx` and `OrderDetailModal.tsx` (neither is touched by this task).

- [ ] **Step 1: Replace the full contents of `OrderCard.test.tsx` (TDD: this is the failing-test step)**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderCard, type OrderCardOrder } from './OrderCard'

const order: OrderCardOrder = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  customerName: 'Edward',
  table: { number: 4 },
  items: [
    { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 },
    { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 },
  ],
}

describe('OrderCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:02:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders table, order number, customer name, item count, and total', () => {
    render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByText('· Edward')).toBeInTheDocument()
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByText('3 items')).toBeInTheDocument()
    expect(screen.getByText('$29.00')).toBeInTheDocument()
  })

  it('shows the badge as the order\'s paymentStatus verbatim, regardless of fulfillmentStatus', () => {
    const { rerender } = render(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Pending', paymentStatus: 'Unpaid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
    expect(screen.getByText('Unpaid')).not.toHaveClass('order-card__badge--paid')

    rerender(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Pending', paymentStatus: 'Paid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toHaveClass('order-card__badge--paid')

    rerender(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Unpaid')).toBeInTheDocument()

    rerender(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toHaveClass('order-card__badge--paid')
  })

  it('never renders "Needs confirmation" or "Awaiting payment"', () => {
    render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.queryByText('Needs confirmation')).not.toBeInTheDocument()
    expect(screen.queryByText('Awaiting payment')).not.toBeInTheDocument()
  })

  it('calls onOpen when clicked', async () => {
    vi.useRealTimers()
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<OrderCard order={order} exiting={false} onOpen={onOpen} />)

    await user.click(screen.getByRole('button', { name: /Order 101/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('applies the exiting class when exiting is true', () => {
    render(<OrderCard order={order} exiting={true} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Order 101/ })).toHaveClass('order-card--exiting')
  })

  it('singularizes the item count for a single item', () => {
    render(
      <OrderCard
        order={{ ...order, items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }] }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('shows no name segment when the order has none', () => {
    render(<OrderCard order={{ ...order, customerName: null }} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.queryByText(/· Edward/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: FAIL — the current implementation still renders "Needs confirmation" for Pending orders and has no `.order-card__stub`.

- [ ] **Step 3: Replace the full contents of `OrderCard.tsx`**

```tsx
'use client'

export type OrderCardItem = { id: string; nameSnapshot: string; priceSnapshot: string; quantity: number }

export type OrderCardOrder = {
  id: string
  orderNumber: number
  createdAt: string
  fulfillmentStatus: 'Pending' | 'Confirmed'
  paymentStatus: 'Unpaid' | 'Paid'
  customerName: string | null
  table: { number: number }
  items: OrderCardItem[]
}

function formatTimeAgo(createdAt: string): string {
  const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago`
}

function orderTotal(order: OrderCardOrder): number {
  return order.items.reduce((sum, item) => sum + Number(item.priceSnapshot) * item.quantity, 0)
}

export function OrderCard({
  order,
  exiting,
  onOpen,
}: {
  order: OrderCardOrder
  exiting: boolean
  onOpen: () => void
}) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <li className="order-grid__item">
      <button
        type="button"
        className={`order-card${exiting ? ' order-card--exiting' : ''}`}
        aria-label={`Order ${order.orderNumber}, table ${order.table.number}`}
        onClick={onOpen}
      >
        <span className="order-card__stub">#{order.orderNumber}</span>
        <span className="order-card__table">
          Table {order.table.number}
          {order.customerName && <span className="order-card__customer"> · {order.customerName}</span>}
        </span>
        <span className="order-card__meta">
          <span className="order-card__time">{formatTimeAgo(order.createdAt)}</span>
          <span className="order-card__summary">
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
          <span className={`order-card__badge${order.paymentStatus === 'Paid' ? ' order-card__badge--paid' : ''}`}>
            {order.paymentStatus}
          </span>
        </span>
        <span className="order-card__total">${orderTotal(order).toFixed(2)}</span>
      </button>
    </li>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: FAIL still — on the `getByText('3 items')`/`getByText('1 item')` assertions, since `.order-card__badge` currently has `align-self: flex-start` that will visually misplace it once nested in a flex row, and `.order-card__stub`/`.order-card__meta` have no CSS yet. This is expected; proceed to Step 5 (RTL assertions on text content will actually already pass at this point since CSS doesn't affect rendered text — but confirm this run before moving on, and note any unexpected failures before continuing).

- [ ] **Step 5: Update `app/globals.css`**

Replace the existing `.order-card` rule (find it — it starts with `display: flex; flex-direction: column; align-items: flex-start;`) by adding two properties, `position: relative;` and `margin-top: 0.9rem;`:

```css
.order-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  width: 100%;
  margin-top: 0.9rem;
  text-align: left;
  background: var(--paper);
  color: var(--espresso);
  border: 1px solid var(--clay-faint);
  border-left: 4px solid var(--copper);
  border-radius: 10px;
  padding: 1rem 1.1rem 1.1rem;
  box-shadow: 0 6px 18px var(--clay-faint);
  cursor: pointer;
  font-family: var(--font-body), Arial, sans-serif;
  animation: order-card-arrive 0.25s ease-out, order-card-highlight 1.4s ease-out;
}
```

Then replace the whole block of rules from `.order-card__head` through `.order-card__total` (i.e. delete `.order-card__head`, `.order-card__table`, `.order-card__customer`, `.order-card__number`, `.order-card__time`, `.order-card__badge`, `.order-card__badge--paid`, `.order-card__summary`, `.order-card__total` as they currently stand) with:

```css
.order-card__stub {
  position: absolute;
  top: -0.9rem;
  right: 0.85rem;
  background: var(--espresso);
  color: var(--crema);
  font-family: var(--font-mono), monospace;
  font-weight: 700;
  font-size: 0.78rem;
  padding: 0.3rem 0.65rem;
  border-radius: 6px 6px 2px 2px;
  box-shadow: 0 3px 8px var(--clay-faint);
}

.order-card__stub::after {
  content: '';
  position: absolute;
  left: 0.35rem;
  bottom: -0.32rem;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid var(--espresso);
}

.order-card__table {
  display: block;
  font-family: var(--font-display), Georgia, serif;
  font-weight: 600;
  font-size: 1.2rem;
}

.order-card__customer {
  font-weight: 400;
  color: var(--clay);
}

.order-card__meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.order-card__time {
  font-size: 0.78rem;
  color: var(--clay);
}

.order-card__summary {
  font-size: 0.85rem;
  color: var(--clay);
}

.order-card__summary::before {
  content: '·';
  margin-right: 0.4rem;
  color: var(--clay);
}

.order-card__badge {
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--copper);
  background: color-mix(in srgb, var(--copper) 12%, transparent);
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
}

.order-card__badge--paid {
  color: var(--sage);
  background: color-mix(in srgb, var(--sage) 15%, transparent);
}

.order-card__total {
  font-family: var(--font-mono), monospace;
  font-weight: 700;
  font-size: 1.5rem;
  color: var(--espresso);
}
```

Note `.order-card__badge` drops its previous `align-self: flex-start` — that property only made sense when the badge was a direct child of the outer column-flex `.order-card`; nested inside `.order-card__meta` (a flex row with `align-items: center`), it's no longer needed and would fight the row's own centering.

- [ ] **Step 6: Run the tests again to confirm they pass**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: PASS (CSS doesn't affect RTL's text-content assertions, but this confirms nothing else broke).

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS — no other test file queries `.order-card__head`, `.order-card__number`, or the old "Needs confirmation"/"Awaiting payment" text, since `PendingOrdersDashboard.test.tsx` and `OrderDetailModal.test.tsx` interact with `OrderCard` only through its stable props/exported types, not its internal markup.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/OrderCard.tsx app/dashboard/OrderCard.test.tsx app/globals.css
git commit -m "feat: redesign order tile — corner stub tag, always-visible payment badge, bigger total"
```
