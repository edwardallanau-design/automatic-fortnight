# Staff Dashboard Live Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the staff dashboard into a three-lane, tap-to-open-modal experience with prices and motion, and make the customer confirmation page reflect a staff confirmation live instead of on next reload.

**Architecture:** Extend `listOrders`/`GET /api/orders` with `paymentStatus`/`date=today` filters so the dashboard can poll three lanes (Pending, Confirmed & Unpaid, Completed today count) instead of one flat list. Extract the modal chrome duplicated across `ConfirmDialog`/`OrderReviewModal` into a shared `Modal` component and build a new `OrderDetailModal` on top of it for the dashboard's tap-to-open interaction. Add a new lightweight `GET /api/orders/[id]/status` endpoint and a small client poller on the customer confirmation page that swaps the editable ticket for the locked one the moment staff confirms.

**Tech Stack:** Next.js (App Router, React 19), TypeScript, Prisma 7 + Postgres, Vitest 4 + React Testing Library, plain global CSS (no CSS modules/Tailwind in this repo).

## Global Constraints

- No changes to `confirmOrder`, `setPaymentStatus`, `cancelOrder`, `removeOrderItem`, or any state-machine invariant (`INV-4/5/8/9`) — this is a read/presentation-layer feature only.
- Follow this repo's existing test-file split: `**/*.test.ts` runs under Vitest's `node` project, `**/*.test.tsx` runs under `jsdom` (`vitest.config.ts`).
- Reuse the `vi.advanceTimersByTimeAsync` pattern (not plain `advanceTimersByTime`) for any test involving polling `useEffect`s or `setTimeout`-based state transitions — this codebase has repeatedly hit hangs/false-passes with the plain version (see `BUILD_STATUS.md` gotchas log).
- No new CSS methodology — extend the single `app/globals.css` file using the existing custom-property tokens (`--espresso`, `--crema`, `--paper`, `--copper`, `--copper-bright`, `--sage`, `--clay`, `--clay-faint`, `--danger`, `--font-display`, `--font-body`, `--font-mono`) and the existing `prefers-reduced-motion` convention.
- Verify manually via `docker compose up --build`, not host `npm run dev` — this repo's established local dev/test loop.

---

### Task 1: `listOrders` gains `paymentStatus` and `date=today` filters

**Files:**
- Modify: `lib/orderService.ts:57-63` (the `listOrders` function)
- Test: `lib/orderService.test.ts` (extend the existing `describe('orderService.listOrders', ...)` block, currently at line 138)

**Interfaces:**
- Produces: `listOrders(options?: { status?: FulfillmentStatus; paymentStatus?: PaymentStatus; date?: 'today' }): Promise<OrderWithItemsAndTable[]>` — used by Task 2's API route and, transitively, by the dashboard poll.

- [ ] **Step 1: Write the failing tests**

Add to `lib/orderService.test.ts`, inside the existing `describe('orderService.listOrders', ...)` block (after the two existing `it(...)` cases):

```ts
  it('queries with a paymentStatus filter combined with status', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Confirmed', paymentStatus: 'Unpaid' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' },
      include: { items: true, table: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('queries with a same-day confirmedAt range for date=today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T15:30:00.000Z'))
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Confirmed', paymentStatus: 'Paid', date: 'today' })

    const call = vi.mocked(prisma.order.findMany).mock.calls[0][0] as {
      where: { fulfillmentStatus?: string; paymentStatus?: string; confirmedAt?: { gte: Date; lt: Date } }
    }
    expect(call.where.fulfillmentStatus).toBe('Confirmed')
    expect(call.where.paymentStatus).toBe('Paid')
    const { gte, lt } = call.where.confirmedAt!
    expect(lt.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000)
    expect(gte.getTime()).toBeLessThanOrEqual(Date.now())
    expect(lt.getTime()).toBeGreaterThan(Date.now())

    vi.useRealTimers()
  })

  it('omits paymentStatus and confirmedAt from the where clause when not requested', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Pending' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending' },
      include: { items: true, table: true },
      orderBy: { createdAt: 'asc' },
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/orderService.test.ts`
Expected: the three new tests FAIL (current `listOrders` ignores `paymentStatus`/`date` and never sets those `where` keys — the first new test's `toHaveBeenCalledWith` assertion won't match).

- [ ] **Step 3: Implement the filters**

In `lib/orderService.ts`, change the import line and `listOrders` function:

```ts
import type { Order, OrderItem, Table, FulfillmentStatus, PaymentStatus, Prisma } from '@prisma/client'
```

```ts
export async function listOrders(
  options: { status?: FulfillmentStatus; paymentStatus?: PaymentStatus; date?: 'today' } = {},
): Promise<OrderWithItemsAndTable[]> {
  const where: Prisma.OrderWhereInput = {}
  if (options.status) where.fulfillmentStatus = options.status
  if (options.paymentStatus) where.paymentStatus = options.paymentStatus
  if (options.date === 'today') {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startOfNextDay = new Date(startOfDay)
    startOfNextDay.setDate(startOfNextDay.getDate() + 1)
    where.confirmedAt = { gte: startOfDay, lt: startOfNextDay }
  }

  return prisma.order.findMany({
    where,
    include: { items: true, table: true },
    orderBy: { createdAt: 'asc' },
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/orderService.test.ts`
Expected: PASS (all `orderService.listOrders` tests, including the pre-existing two).

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "feat: add paymentStatus and date=today filters to listOrders"
```

---

### Task 2: `GET /api/orders` accepts `paymentStatus` and `date` query params

**Files:**
- Modify: `app/api/orders/route.ts:1-34` (the `GET` handler)
- Test: `app/api/orders/route.test.ts` (extend the `describe('GET /api/orders', ...)` block, currently at line 121; two existing assertions need updating)

**Interfaces:**
- Consumes: `listOrders(options)` from Task 1.
- Produces: `GET /api/orders?status=&paymentStatus=&date=` — consumed by the dashboard poll in Task 7.

- [ ] **Step 1: Update the two existing assertions that will break, and write the new failing tests**

In `app/api/orders/route.test.ts`, update these two existing `it` blocks (inside `describe('GET /api/orders', ...)`):

```ts
  it('returns 200 with the filtered list for status=pending', async () => {
    const orders = [{ id: 'o1', orderNumber: 1, fulfillmentStatus: 'Pending', table: { number: 4 }, items: [] }]
    vi.mocked(listOrders).mockResolvedValue(orders as never)

    const res = await GET(makeGetRequest('?status=pending'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].orderNumber).toBe(1)
    expect(listOrders).toHaveBeenCalledWith({ status: 'Pending', paymentStatus: undefined, date: undefined })
  })

  it('returns 200 with an unfiltered call when no status is given', async () => {
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest())

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: undefined, paymentStatus: undefined, date: undefined })
  })
```

Then add these new tests after the existing `it('returns an empty array (not 404) ...)` case, still inside `describe('GET /api/orders', ...)`:

```ts
  it('returns 200 with a paymentStatus filter combined with status', async () => {
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest('?status=confirmed&paymentStatus=unpaid'))

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: 'Confirmed', paymentStatus: 'Unpaid', date: undefined })
  })

  it('returns 200 with a date=today filter', async () => {
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest('?status=confirmed&paymentStatus=paid&date=today'))

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: 'Confirmed', paymentStatus: 'Paid', date: 'today' })
  })

  it('returns 400 for an invalid paymentStatus value', async () => {
    const res = await GET(makeGetRequest('?paymentStatus=bogus'))

    expect(res.status).toBe(400)
    expect(listOrders).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid date value', async () => {
    const res = await GET(makeGetRequest('?date=yesterday'))

    expect(res.status).toBe(400)
    expect(listOrders).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the tests to verify the new/updated ones fail**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: FAIL on the two updated assertions (route doesn't pass `paymentStatus`/`date` yet) and the four new tests (route doesn't parse those params yet, so `bogus`/`yesterday` don't 400 and valid values aren't threaded through).

- [ ] **Step 3: Implement the query param parsing**

Replace the `GET` handler in `app/api/orders/route.ts`:

```ts
import { NextResponse } from 'next/server'
import type { FulfillmentStatus, PaymentStatus } from '@prisma/client'
import { createOrder, listOrders } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'

const STATUS_PARAM_MAP: Record<string, FulfillmentStatus> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

const PAYMENT_STATUS_PARAM_MAP: Record<string, PaymentStatus> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
}

export async function GET(request: Request) {
  try {
    await requireApiRole('staff')

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const paymentStatusParam = searchParams.get('paymentStatus')
    const dateParam = searchParams.get('date')

    let status: FulfillmentStatus | undefined
    if (statusParam !== null) {
      status = STATUS_PARAM_MAP[statusParam]
      if (!status) {
        throw new ValidationError(`Invalid status: ${statusParam}`)
      }
    }

    let paymentStatus: PaymentStatus | undefined
    if (paymentStatusParam !== null) {
      paymentStatus = PAYMENT_STATUS_PARAM_MAP[paymentStatusParam]
      if (!paymentStatus) {
        throw new ValidationError(`Invalid paymentStatus: ${paymentStatusParam}`)
      }
    }

    let date: 'today' | undefined
    if (dateParam !== null) {
      if (dateParam !== 'today') {
        throw new ValidationError(`Invalid date: ${dateParam}`)
      }
      date = dateParam
    }

    const orders = await listOrders({ status, paymentStatus, date })
    return NextResponse.json(orders, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

Leave the `POST` handler below it untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: PASS (all `GET /api/orders` and `POST /api/orders` tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "feat: accept paymentStatus and date query params on GET /api/orders"
```

---

### Task 3: New `GET /api/orders/[id]/status` endpoint

**Files:**
- Create: `app/api/orders/[id]/status/route.ts`
- Test: `app/api/orders/[id]/status/route.test.ts`

**Interfaces:**
- Consumes: `getOrderById(orderId: string): Promise<OrderWithItemsAndTable>` (`lib/orderService.ts:143`, unchanged).
- Produces: `GET /api/orders/:id/status → { fulfillmentStatus: FulfillmentStatus }` — consumed by `OrderStatusPoller` in Task 8. No auth required, matching the existing customer-facing `DELETE /api/orders/[id]` route's access model (possession of the order id is the access control).

- [ ] **Step 1: Write the failing test**

Create `app/api/orders/[id]/status/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  getOrderById: vi.fn(),
}))

import { getOrderById } from '@/lib/orderService'

function makeRequest(id: string): Request {
  return new Request(`http://localhost/api/orders/${id}/status`)
}

describe('GET /api/orders/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with just the fulfillmentStatus', async () => {
    vi.mocked(getOrderById).mockResolvedValue({ fulfillmentStatus: 'Confirmed' } as never)

    const res = await GET(makeRequest('o1'), { params: Promise.resolve({ id: 'o1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ fulfillmentStatus: 'Confirmed' })
    expect(getOrderById).toHaveBeenCalledWith('o1')
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(getOrderById).mockRejectedValue(new NotFoundError('Order not found'))

    const res = await GET(makeRequest('missing'), { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/orders/[id]/status/route.test.ts`
Expected: FAIL with a module-not-found error for `./route` (file doesn't exist yet).

- [ ] **Step 3: Implement the route**

Create `app/api/orders/[id]/status/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getOrderById } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const order = await getOrderById(id)
    return NextResponse.json({ fulfillmentStatus: order.fulfillmentStatus }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/orders/[id]/status/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/orders/[id]/status/route.ts app/api/orders/[id]/status/route.test.ts
git commit -m "feat: add GET /api/orders/:id/status endpoint"
```

---

### Task 4: Shared `Modal` component; refactor `ConfirmDialog` and `OrderReviewModal` onto it

**Files:**
- Create: `app/components/Modal.tsx`
- Test: `app/components/Modal.test.tsx`
- Modify: `app/order/[id]/ConfirmDialog.tsx` (full rewrite to build on `Modal`, same external behavior)
- Modify: `app/order/OrderReviewModal.tsx` (full rewrite to build on `Modal`, same external behavior)

**Interfaces:**
- Produces: `Modal({ ariaLabel, backdropClassName, backdropTestId, dialogClassName, onClose, children })` — a behavior-only wrapper (Escape-to-close, backdrop-click-to-close, `role="dialog"`/`aria-modal`) with zero new CSS classes, so it introduces no visual change. Consumed by `ConfirmDialog`, `OrderReviewModal` (this task) and `OrderDetailModal` (Task 6).
- This task must not change `ConfirmDialog.test.tsx` or `OrderReviewModal.test.tsx` — both must pass unmodified against the refactored implementation, proving the extraction is behavior-preserving.

- [ ] **Step 1: Write the failing test for the new `Modal` component**

Create `app/components/Modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders children inside a labeled dialog', () => {
    render(
      <Modal
        ariaLabel="Test dialog"
        backdropClassName="backdrop"
        backdropTestId="test-backdrop"
        dialogClassName="dialog"
        onClose={vi.fn()}
      >
        <p>Dialog content</p>
      </Modal>,
    )

    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument()
    expect(screen.getByText('Dialog content')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal
        ariaLabel="Test dialog"
        backdropClassName="backdrop"
        backdropTestId="test-backdrop"
        dialogClassName="dialog"
        onClose={onClose}
      >
        <p>Dialog content</p>
      </Modal>,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click but not on a click inside the dialog', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal
        ariaLabel="Test dialog"
        backdropClassName="backdrop"
        backdropTestId="test-backdrop"
        dialogClassName="dialog"
        onClose={onClose}
      >
        <p>Dialog content</p>
      </Modal>,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('test-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('applies the given backdrop and dialog class names', () => {
    render(
      <Modal
        ariaLabel="Test dialog"
        backdropClassName="backdrop backdrop--exiting"
        backdropTestId="test-backdrop"
        dialogClassName="dialog dialog--exiting"
        onClose={vi.fn()}
      >
        <p>Dialog content</p>
      </Modal>,
    )

    expect(screen.getByTestId('test-backdrop')).toHaveClass('backdrop', 'backdrop--exiting')
    expect(screen.getByRole('dialog')).toHaveClass('dialog', 'dialog--exiting')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/components/Modal.test.tsx`
Expected: FAIL with a module-not-found error for `./Modal`.

- [ ] **Step 3: Implement `Modal`**

Create `app/components/Modal.tsx`:

```tsx
'use client'

import { useEffect, type ReactNode } from 'react'

export function Modal({
  ariaLabel,
  backdropClassName,
  backdropTestId,
  dialogClassName,
  onClose,
  children,
}: {
  ariaLabel: string
  backdropClassName: string
  backdropTestId: string
  dialogClassName: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className={backdropClassName} data-testid={backdropTestId} onClick={onClose}>
      <div
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/components/Modal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Refactor `ConfirmDialog` to build on `Modal`**

Replace the full contents of `app/order/[id]/ConfirmDialog.tsx`:

```tsx
'use client'

import { Modal } from '@/app/components/Modal'

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  exiting,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  busy: boolean
  exiting: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      ariaLabel={title}
      backdropClassName={`confirm-dialog__backdrop${exiting ? ' confirm-dialog__backdrop--exiting' : ''}`}
      backdropTestId="confirm-dialog-backdrop"
      dialogClassName={`confirm-dialog${exiting ? ' confirm-dialog--exiting' : ''}`}
      onClose={onClose}
    >
      <h2 className="confirm-dialog__title">{title}</h2>
      <p className="confirm-dialog__message">{message}</p>
      <div className="confirm-dialog__actions">
        <button type="button" className="confirm-dialog__cancel" onClick={onClose} disabled={busy}>
          Never mind
        </button>
        <button type="button" className="confirm-dialog__confirm" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 6: Run `ConfirmDialog`'s existing tests unmodified**

Run: `npx vitest run app/order/[id]/ConfirmDialog.test.tsx`
Expected: PASS, with zero changes to that test file — this proves the refactor preserved the exact DOM/class-name contract the tests depend on.

- [ ] **Step 7: Refactor `OrderReviewModal` to build on `Modal`**

Replace the full contents of `app/order/OrderReviewModal.tsx`:

```tsx
'use client'

import { Modal } from '@/app/components/Modal'

type ReviewLine = {
  menuItemId: string
  name: string
  price: string
  quantity: number
}

export function OrderReviewModal({
  lines,
  total,
  error,
  submitting,
  exiting,
  customerName,
  onCustomerNameChange,
  onConfirm,
  onClose,
}: {
  lines: ReviewLine[]
  total: number
  error: string | null
  submitting: boolean
  exiting: boolean
  customerName: string
  onCustomerNameChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      ariaLabel="Review your order"
      backdropClassName={`review-modal__backdrop${exiting ? ' review-modal__backdrop--exiting' : ''}`}
      backdropTestId="review-modal-backdrop"
      dialogClassName={`review-modal${exiting ? ' review-modal--exiting' : ''}`}
      onClose={onClose}
    >
      <h2 className="review-modal__title">Review your order</h2>
      <ul className="review-modal__lines">
        {lines.map((line) => (
          <li key={line.menuItemId} className="review-modal__line">
            <span className="review-modal__line-name">
              {line.quantity}x {line.name}
            </span>
            <span className="review-modal__line-price">
              ${(Number(line.price) * line.quantity).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div className="review-modal__total">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>
      <div className="review-modal__name">
        <label className="review-modal__name-label" htmlFor="order-customer-name">
          Name for this order
        </label>
        <input
          id="order-customer-name"
          type="text"
          className="review-modal__name-input"
          value={customerName}
          maxLength={50}
          placeholder="e.g. Alex"
          disabled={submitting}
          onChange={(event) => onCustomerNameChange(event.target.value)}
        />
        <p className="review-modal__name-hint">Add a name so we can find you</p>
      </div>
      {error && (
        <p role="alert" className="review-modal__error">
          {error}
        </p>
      )}
      <div className="review-modal__actions">
        <button type="button" className="review-modal__back" onClick={onClose} disabled={submitting}>
          Back to menu
        </button>
        <button type="button" className="review-modal__confirm" onClick={onConfirm} disabled={submitting}>
          Confirm Order
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 8: Run `OrderReviewModal`'s existing tests unmodified**

Run: `npx vitest run app/order/OrderReviewModal.test.tsx`
Expected: PASS, with zero changes to that test file.

- [ ] **Step 9: Run the full suite to catch any other regression**

Run: `npx vitest run`
Expected: PASS (no other file references `ConfirmDialog`'s or `OrderReviewModal`'s internals directly).

- [ ] **Step 10: Commit**

```bash
git add app/components/Modal.tsx app/components/Modal.test.tsx app/order/[id]/ConfirmDialog.tsx app/order/OrderReviewModal.tsx
git commit -m "refactor: extract shared Modal chrome from ConfirmDialog and OrderReviewModal"
```

---

### Task 5: `OrderCard` — compact, tappable dashboard card

**Files:**
- Create: `app/dashboard/OrderCard.tsx`
- Test: `app/dashboard/OrderCard.test.tsx`
- Modify: `app/globals.css` (replace the action-button card styles with the new tappable-card styles)

**Interfaces:**
- Produces: `OrderCard({ order, exiting, onOpen })` where `order: OrderCardOrder` (exported type: `{ id, orderNumber, createdAt, fulfillmentStatus: 'Pending' | 'Confirmed', paymentStatus: 'Unpaid' | 'Paid', customerName: string | null, table: { number: number }, items: OrderCardItem[] }`, `OrderCardItem = { id, nameSnapshot, priceSnapshot, quantity }`). Consumed by `PendingOrdersDashboard` in Task 7, which also reuses the `OrderCardOrder`/`OrderCardItem` types as its own order shape.

- [ ] **Step 1: Write the failing test**

Create `app/dashboard/OrderCard.test.tsx`:

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

  it('shows "Needs confirmation" for a Pending order and "Awaiting payment" for a Confirmed one', () => {
    const { rerender } = render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Needs confirmation')).toBeInTheDocument()

    rerender(<OrderCard order={{ ...order, fulfillmentStatus: 'Confirmed' }} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
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
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: FAIL with a module-not-found error for `./OrderCard`.

- [ ] **Step 3: Implement `OrderCard`**

Create `app/dashboard/OrderCard.tsx`:

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
  const badgeLabel = order.fulfillmentStatus === 'Pending' ? 'Needs confirmation' : 'Awaiting payment'
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <li className="order-grid__item">
      <button
        type="button"
        className={`order-card${exiting ? ' order-card--exiting' : ''}`}
        aria-label={`Order ${order.orderNumber}, table ${order.table.number}`}
        onClick={onOpen}
      >
        <div className="order-card__head">
          <span className="order-card__table">
            Table {order.table.number}
            {order.customerName && <span className="order-card__customer"> · {order.customerName}</span>}
          </span>
          <span className="order-card__number">#{order.orderNumber}</span>
        </div>
        <span className="order-card__time">{formatTimeAgo(order.createdAt)}</span>
        <span className="order-card__badge">{badgeLabel}</span>
        <span className="order-card__summary">
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </span>
        <span className="order-card__total">${orderTotal(order).toFixed(2)}</span>
      </button>
    </li>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `app/globals.css` — replace action-button card styles with tappable-card styles**

In `app/globals.css`, remove these now-dead rules (they applied to the inline Confirm/Mark Paid buttons and per-card error text that no longer exist once actions move into the modal in Task 7): `.order-card--unpaid` (lines 1208-1210), `.order-card__items`/`.order-card__item` (lines 1257-1270), `.order-card__actions` through `.order-card__paid-badge` (lines 1272-1343), and `.order-card__error` (lines 1345-1348).

Replace the `.order-card` rule (lines 1195-1206) with:

```css
.order-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  width: 100%;
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

.order-card:hover {
  border-left-color: var(--copper-bright);
}

.order-card:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.order-card--exiting {
  opacity: 0;
  transform: scale(0.97);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

@keyframes order-card-highlight {
  0% {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--copper-bright) 60%, transparent);
  }
  100% {
    box-shadow: 0 6px 18px var(--clay-faint);
  }
}
```

Immediately after the existing `@media (prefers-reduced-motion: reduce) { .order-card { animation: none; } }` block (lines 1223-1227), add:

```css
@media (prefers-reduced-motion: reduce) {
  .order-card--exiting {
    transition: none;
  }
}
```

After the existing `.order-card__time` rule (lines 1252-1255), add the three new classes `OrderCard` renders:

```css
.order-card__badge {
  align-self: flex-start;
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

.order-card__summary {
  font-size: 0.85rem;
  color: var(--clay);
}

.order-card__total {
  font-family: var(--font-mono), monospace;
  font-weight: 700;
  font-size: 1rem;
  color: var(--espresso);
}
```

Leave `.order-card__head`, `.order-card__table`, `.order-card__customer`, `.order-card__number`, `.order-card__time`, `.order-grid`, `@keyframes order-card-arrive`, and its `prefers-reduced-motion` block untouched — `OrderCard` reuses them as-is.

- [ ] **Step 6: Re-run the component test to confirm CSS changes didn't break class expectations**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: PASS (RTL doesn't execute CSS, but this confirms the class names referenced in Step 3's JSX still match what Step 5's CSS targets).

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/OrderCard.tsx app/dashboard/OrderCard.test.tsx app/globals.css
git commit -m "feat: add tappable OrderCard summary component for the dashboard"
```

---

### Task 6: `OrderDetailModal` — order detail + Confirm/Pay actions

**Files:**
- Create: `app/dashboard/OrderDetailModal.tsx`
- Test: `app/dashboard/OrderDetailModal.test.tsx`
- Modify: `app/globals.css` (new `.order-detail-modal*` rules)

**Interfaces:**
- Consumes: `Modal` from Task 4 (`@/app/components/Modal`); `OrderCardOrder`/`OrderCardItem` types from Task 5 (`./OrderCard`); `Role` from `@/lib/types`.
- Produces: `OrderDetailModal({ order: OrderCardOrder, role: Role, busy: boolean, error: string | null, exiting: boolean, onConfirm: () => void, onSetPaymentStatus: (status: 'Paid' | 'Unpaid') => void, onClose: () => void })`. Consumed by `PendingOrdersDashboard` in Task 7.

- [ ] **Step 1: Write the failing test**

Create `app/dashboard/OrderDetailModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderDetailModal } from './OrderDetailModal'
import type { OrderCardOrder } from './OrderCard'

const pendingOrder: OrderCardOrder = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  customerName: 'Edward',
  table: { number: 4 },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

describe('OrderDetailModal', () => {
  it('renders items, line totals, and the order total', () => {
    render(
      <OrderDetailModal
        order={pendingOrder}
        role="staff"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
  })

  it('shows Confirm and Mark Paid for a Pending order, and calls the right callback for each', async () => {
    const onConfirm = vi.fn()
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderDetailModal
        order={pendingOrder}
        role="staff"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={onConfirm}
        onSetPaymentStatus={onSetPaymentStatus}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm order' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Mark Paid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Paid')
  })

  it('hides Confirm for a Confirmed & Unpaid order but keeps Mark Paid', () => {
    render(
      <OrderDetailModal
        order={{ ...pendingOrder, fulfillmentStatus: 'Confirmed' }}
        role="staff"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()
  })

  it('shows a static Paid badge (no revert button) for staff on a Paid order', () => {
    render(
      <OrderDetailModal
        order={{ ...pendingOrder, paymentStatus: 'Paid' }}
        role="staff"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark Unpaid' })).not.toBeInTheDocument()
  })

  it('lets an admin revert a Paid order to Unpaid', async () => {
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderDetailModal
        order={{ ...pendingOrder, paymentStatus: 'Paid' }}
        role="admin"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={onSetPaymentStatus}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Mark Unpaid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Unpaid')
  })

  it('shows the error message and disables actions when busy', () => {
    render(
      <OrderDetailModal
        order={pendingOrder}
        role="staff"
        busy={true}
        error="Order is Confirmed, not Pending"
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Order is Confirmed, not Pending')
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx`
Expected: FAIL with a module-not-found error for `./OrderDetailModal`.

- [ ] **Step 3: Implement `OrderDetailModal`**

Create `app/dashboard/OrderDetailModal.tsx`:

```tsx
'use client'

import { Modal } from '@/app/components/Modal'
import type { Role } from '@/lib/types'
import type { OrderCardItem, OrderCardOrder } from './OrderCard'

function lineTotal(item: OrderCardItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

export function OrderDetailModal({
  order,
  role,
  busy,
  error,
  exiting,
  onConfirm,
  onSetPaymentStatus,
  onClose,
}: {
  order: OrderCardOrder
  role: Role
  busy: boolean
  error: string | null
  exiting: boolean
  onConfirm: () => void
  onSetPaymentStatus: (paymentStatus: 'Paid' | 'Unpaid') => void
  onClose: () => void
}) {
  const total = order.items.reduce((sum, item) => sum + lineTotal(item), 0)

  return (
    <Modal
      ariaLabel={`Order ${order.orderNumber}`}
      backdropClassName={`order-detail-modal__backdrop${exiting ? ' order-detail-modal__backdrop--exiting' : ''}`}
      backdropTestId="order-detail-modal-backdrop"
      dialogClassName={`order-detail-modal${exiting ? ' order-detail-modal--exiting' : ''}`}
      onClose={onClose}
    >
      <h2 className="order-detail-modal__title">
        Table {order.table.number} · #{order.orderNumber}
      </h2>
      {order.customerName && <p className="order-detail-modal__customer">{order.customerName}</p>}

      <ul className="order-detail-modal__lines">
        {order.items.map((item) => (
          <li key={item.id} className="order-detail-modal__line">
            <span className="order-detail-modal__line-name">
              {item.quantity}x {item.nameSnapshot}
            </span>
            <span className="order-detail-modal__line-price">${lineTotal(item).toFixed(2)}</span>
          </li>
        ))}
      </ul>

      <div className="order-detail-modal__total">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>

      {error && (
        <p role="alert" className="order-detail-modal__error">
          {error}
        </p>
      )}

      <div className="order-detail-modal__actions">
        {order.fulfillmentStatus === 'Pending' && (
          <button type="button" className="order-detail-modal__confirm" disabled={busy} onClick={onConfirm}>
            Confirm order
          </button>
        )}
        {order.paymentStatus === 'Unpaid' ? (
          <button
            type="button"
            className="order-detail-modal__pay"
            disabled={busy}
            onClick={() => onSetPaymentStatus('Paid')}
          >
            Mark Paid
          </button>
        ) : role === 'admin' ? (
          <button
            type="button"
            className="order-detail-modal__pay order-detail-modal__pay--revert"
            disabled={busy}
            onClick={() => onSetPaymentStatus('Unpaid')}
          >
            Mark Unpaid
          </button>
        ) : (
          <span className="order-detail-modal__paid-badge">Paid</span>
        )}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add `.order-detail-modal*` CSS**

Append to `app/globals.css` (after the `.order-card__total` block added in Task 5):

```css
/* Order detail modal (dashboard) */

.order-detail-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: color-mix(in srgb, var(--espresso) 60%, transparent);
  animation: confirm-dialog-backdrop-enter 0.2s ease-out;
}

.order-detail-modal__backdrop--exiting {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.order-detail-modal {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--paper);
  color: var(--espresso);
  border-radius: 16px;
  padding: 1.5rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 8px 24px var(--clay-faint);
  animation: confirm-dialog-enter 0.2s ease-out;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.order-detail-modal--exiting {
  opacity: 0;
  transform: scale(0.96);
}

@media (max-width: 480px) {
  .order-detail-modal__backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .order-detail-modal {
    max-width: none;
    max-height: 90vh;
    border-radius: 16px 16px 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .order-detail-modal__backdrop,
  .order-detail-modal {
    animation: none;
    transition: none;
  }
}

.order-detail-modal__title {
  font-family: var(--font-display), Georgia, serif;
  font-style: italic;
  font-weight: 600;
  font-size: 1.3rem;
  margin-bottom: 0.25rem;
}

.order-detail-modal__customer {
  color: var(--clay);
  margin-bottom: 0.75rem;
}

.order-detail-modal__lines {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.order-detail-modal__line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.95rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed var(--clay-faint);
}

.order-detail-modal__line-price {
  font-family: var(--font-mono), monospace;
  white-space: nowrap;
}

.order-detail-modal__total {
  display: flex;
  justify-content: space-between;
  padding-top: 0.75rem;
  border-top: 1px solid var(--clay-faint);
  font-weight: 600;
  font-family: var(--font-mono), monospace;
  margin-bottom: 1rem;
}

.order-detail-modal__error {
  color: var(--danger);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.order-detail-modal__actions {
  display: flex;
  gap: 0.75rem;
}

.order-detail-modal__confirm,
.order-detail-modal__pay {
  flex: 1;
  min-height: 48px;
  border-radius: 10px;
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  border: 1px solid transparent;
}

.order-detail-modal__confirm {
  background: var(--espresso);
  color: var(--crema);
}

.order-detail-modal__confirm:hover:not(:disabled) {
  background: var(--copper);
}

.order-detail-modal__pay {
  background: transparent;
  color: var(--sage);
  border-color: var(--sage);
}

.order-detail-modal__pay:hover:not(:disabled) {
  background: var(--sage);
  color: var(--paper);
}

.order-detail-modal__pay--revert {
  color: var(--clay);
  border-color: var(--clay-faint);
}

.order-detail-modal__pay--revert:hover:not(:disabled) {
  background: var(--clay);
  color: var(--paper);
}

.order-detail-modal__confirm:disabled,
.order-detail-modal__pay:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.order-detail-modal__confirm:focus-visible,
.order-detail-modal__pay:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.order-detail-modal__paid-badge {
  align-self: flex-start;
  font-family: var(--font-mono), monospace;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sage);
  background: color-mix(in srgb, var(--sage) 15%, transparent);
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
}
```

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/OrderDetailModal.tsx app/dashboard/OrderDetailModal.test.tsx app/globals.css
git commit -m "feat: add OrderDetailModal with confirm/pay actions for the dashboard"
```

---

### Task 7: Rewrite `PendingOrdersDashboard` — three lanes, exit animation, completed-today counter

**Files:**
- Modify: `app/dashboard/PendingOrdersDashboard.tsx` (full rewrite)
- Modify: `app/dashboard/PendingOrdersDashboard.test.tsx` (full rewrite)
- Modify: `app/globals.css` (add lane/summary-chip rules)

**Interfaces:**
- Consumes: `OrderCard`/`OrderCardOrder`/`OrderCardItem` (Task 5), `OrderDetailModal` (Task 6), `apiClient`/`ApiError` (`@/lib/apiClient`), `Role` (`@/lib/types`).
- Produces: `PendingOrdersDashboard({ role: Role })` — same export name/props as today, so `app/dashboard/page.tsx` needs no change.

- [ ] **Step 1: Write the failing tests (full replacement of the test file)**

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — the current implementation only fetches one endpoint, has no modal, and has no lane/counter markup.

- [ ] **Step 3: Rewrite `PendingOrdersDashboard`**

Replace the full contents of `app/dashboard/PendingOrdersDashboard.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { apiClient, ApiError } from '@/lib/apiClient'
import type { Role } from '@/lib/types'
import { OrderCard, type OrderCardOrder } from './OrderCard'
import { OrderDetailModal } from './OrderDetailModal'

const POLL_INTERVAL_MS = 3500
const LANE_EXIT_MS = 200
const SUMMARY_BUMP_MS = 300

type DashboardOrder = OrderCardOrder

type ModalState = { orderId: string; busy: boolean; error: string | null; closing: boolean }

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
}

async function fetchLanes(): Promise<{
  pending: DashboardOrder[]
  confirmedUnpaid: DashboardOrder[]
  completedTodayCount: number
}> {
  const [pending, confirmedUnpaid, completedToday] = await Promise.all([
    apiClient.get<DashboardOrder[]>('/api/orders?status=pending'),
    apiClient.get<DashboardOrder[]>('/api/orders?status=confirmed&paymentStatus=unpaid'),
    apiClient.get<DashboardOrder[]>('/api/orders?status=confirmed&paymentStatus=paid&date=today'),
  ])
  return { pending, confirmedUnpaid, completedTodayCount: completedToday.length }
}

export function PendingOrdersDashboard({ role }: { role: Role }) {
  const [pendingOrders, setPendingOrders] = useState<DashboardOrder[]>([])
  const [confirmedUnpaidOrders, setConfirmedUnpaidOrders] = useState<DashboardOrder[]>([])
  const [completedTodayCount, setCompletedTodayCount] = useState(0)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState | null>(null)
  const [summaryBump, setSummaryBump] = useState(false)
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const lanes = await fetchLanes()
        if (cancelled) return
        setPendingOrders(lanes.pending)
        setConfirmedUnpaidOrders(lanes.confirmedUnpaid)
        setCompletedTodayCount(lanes.completedTodayCount)
      } catch {
        // Transient poll failure: keep the last-known lanes, retry next tick.
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
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current)
    }
  }, [])

  function bumpSummary() {
    setSummaryBump(true)
    if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current)
    bumpTimerRef.current = setTimeout(() => setSummaryBump(false), SUMMARY_BUMP_MS)
  }

  const selectedOrder = modal
    ? [...pendingOrders, ...confirmedUnpaidOrders].find((order) => order.id === modal.orderId) ?? null
    : null

  function openModal(orderId: string) {
    setModal({ orderId, busy: false, error: null, closing: false })
  }

  function closeModal() {
    setModal((current) => (current ? { ...current, closing: true } : current))
    setTimeout(() => setModal(null), LANE_EXIT_MS)
  }

  async function handleConfirm(order: DashboardOrder) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      const updated = await apiClient.patch<DashboardOrder>(`/api/orders/${order.id}/confirm`, {})
      setExitingIds((current) => new Set(current).add(order.id))
      setModal((current) => (current ? { ...current, closing: true } : current))
      setTimeout(() => {
        setPendingOrders((current) => current.filter((o) => o.id !== order.id))
        if (updated.paymentStatus === 'Paid') {
          setCompletedTodayCount((count) => count + 1)
          bumpSummary()
        } else {
          setConfirmedUnpaidOrders((current) => [
            ...current,
            { ...order, fulfillmentStatus: 'Confirmed', paymentStatus: updated.paymentStatus },
          ])
        }
        setExitingIds((current) => {
          const next = new Set(current)
          next.delete(order.id)
          return next
        })
        setModal(null)
      }, LANE_EXIT_MS)
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  async function handleSetPaymentStatus(order: DashboardOrder, paymentStatus: 'Paid' | 'Unpaid') {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      const updated = await apiClient.patch<DashboardOrder>(`/api/orders/${order.id}/pay`, { paymentStatus })

      if (order.fulfillmentStatus === 'Pending') {
        setPendingOrders((current) =>
          current.map((o) => (o.id === order.id ? { ...o, paymentStatus: updated.paymentStatus } : o)),
        )
        setModal((current) => (current ? { ...current, busy: false, error: null } : current))
        return
      }

      if (paymentStatus === 'Paid') {
        setExitingIds((current) => new Set(current).add(order.id))
        setModal((current) => (current ? { ...current, closing: true } : current))
        setTimeout(() => {
          setConfirmedUnpaidOrders((current) => current.filter((o) => o.id !== order.id))
          setCompletedTodayCount((count) => count + 1)
          bumpSummary()
          setExitingIds((current) => {
            const next = new Set(current)
            next.delete(order.id)
            return next
          })
          setModal(null)
        }, LANE_EXIT_MS)
      } else {
        setConfirmedUnpaidOrders((current) =>
          current.map((o) => (o.id === order.id ? { ...o, paymentStatus: updated.paymentStatus } : o)),
        )
        setModal((current) => (current ? { ...current, busy: false, error: null } : current))
      }
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  const totalVisible = pendingOrders.length + confirmedUnpaidOrders.length

  return (
    <div className="order-rail">
      <div className="order-rail__status">
        <span className="order-rail__pulse" aria-hidden="true" />
        <span>Live — refreshes every few seconds</span>
        <span className={`order-rail__summary${summaryBump ? ' order-rail__summary--bump' : ''}`}>
          {completedTodayCount} completed today
        </span>
      </div>

      {totalVisible === 0 ? (
        <div className="order-rail__empty">
          <span className="order-rail__empty-eyebrow">All caught up</span>
          <p>No pending orders</p>
        </div>
      ) : (
        <>
          <section className="order-rail__lane" aria-label="Pending orders">
            <h2 className="order-rail__lane-heading">Pending</h2>
            {pendingOrders.length === 0 ? (
              <p className="order-rail__empty-eyebrow">No pending orders</p>
            ) : (
              <ul className="order-grid">
                {pendingOrders.map((order) => (
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

          {confirmedUnpaidOrders.length > 0 && (
            <section className="order-rail__lane" aria-label="Confirmed and unpaid orders">
              <h2 className="order-rail__lane-heading">Confirmed · awaiting payment</h2>
              <ul className="order-grid">
                {confirmedUnpaidOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    exiting={exitingIds.has(order.id)}
                    onOpen={() => openModal(order.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

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

- [ ] **Step 5: Add lane/summary CSS**

Append to `app/globals.css` (after the `.order-detail-modal__paid-badge` block from Task 6):

```css
/* Dashboard lanes and completed-today summary */

.order-rail__summary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  font-family: var(--font-mono), monospace;
  font-size: 0.78rem;
  color: var(--sage);
  background: color-mix(in srgb, var(--sage) 12%, transparent);
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
}

.order-rail__summary--bump {
  animation: order-rail-summary-bump 0.3s ease-out;
}

@keyframes order-rail-summary-bump {
  0% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .order-rail__summary--bump {
    animation: none;
  }
}

.order-rail__lane {
  margin-top: 2rem;
}

.order-rail__lane:first-of-type {
  margin-top: 0;
}

.order-rail__lane-heading {
  font-family: var(--font-display), Georgia, serif;
  font-style: italic;
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
  color: var(--espresso);
}
```

Also update `.order-rail__status` (existing rule, currently `display: flex; align-items: center; gap: 0.5rem; ...`) to allow the new summary chip to sit at the far right — change `gap: 0.5rem;` to `gap: 0.5rem; flex-wrap: wrap;` so it wraps gracefully on narrow viewports instead of overflowing (the `margin-left: auto` on `.order-rail__summary` handles right-alignment on wider ones).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/globals.css
git commit -m "feat: rewrite staff dashboard into three lanes with a tap-to-open detail modal"
```

---

### Task 8: `OrderStatusPoller` — live-update the customer confirmation page

**Files:**
- Create: `app/order/[id]/OrderStatusPoller.tsx`
- Test: `app/order/[id]/OrderStatusPoller.test.tsx`
- Modify: `app/order/[id]/page.tsx:1-88` (wire the Pending branch to `OrderStatusPoller`)
- Modify: `app/order/[id]/page.test.tsx` (swap the `./OrderTicket` mock for `./OrderStatusPoller`)

**Interfaces:**
- Consumes: `GET /api/orders/[id]/status` (Task 3); `OrderTicket`/`OrderTicketProps` (`./OrderTicket`); `TicketCard` (`./TicketCard`); `apiClient` (`@/lib/apiClient`).
- Produces: `OrderStatusPoller({ order: OrderTicketProps })` — drop-in replacement for `<OrderTicket order={ticket} />` in the Pending branch of `page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `app/order/[id]/OrderStatusPoller.test.tsx`:

```tsx
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
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/order/[id]/OrderStatusPoller.test.tsx`
Expected: FAIL with a module-not-found error for `./OrderStatusPoller`.

- [ ] **Step 3: Implement `OrderStatusPoller`**

Create `app/order/[id]/OrderStatusPoller.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { OrderTicket, type OrderTicketProps } from './OrderTicket'
import { TicketCard } from './TicketCard'

const POLL_INTERVAL_MS = 3500

type FulfillmentStatus = 'Pending' | 'Confirmed' | 'Cancelled'
type StatusResponse = { fulfillmentStatus: FulfillmentStatus }

export function OrderStatusPoller({ order }: { order: OrderTicketProps }) {
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus>('Pending')

  useEffect(() => {
    if (fulfillmentStatus !== 'Pending') return

    let cancelled = false

    async function poll() {
      try {
        const result = await apiClient.get<StatusResponse>(`/api/orders/${order.id}/status`)
        if (!cancelled) setFulfillmentStatus(result.fulfillmentStatus)
      } catch {
        // Transient poll failure: keep the current status, retry next tick.
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [fulfillmentStatus, order.id])

  if (fulfillmentStatus === 'Confirmed') {
    return (
      <TicketCard
        heading={`Order #${order.orderNumber} confirmed`}
        customerName={order.customerName}
        items={order.items}
        statusNote="Confirmed by staff — ask staff to change anything."
      />
    )
  }

  if (fulfillmentStatus === 'Cancelled') {
    return (
      <section aria-label="Order cancelled" className="ticket">
        <div className="ticket__stub">
          <h2 className="ticket__number">Order #{order.orderNumber}</h2>
          <p className="ticket__note">This order was cancelled.</p>
        </div>
      </section>
    )
  }

  return <OrderTicket order={order} />
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/order/[id]/OrderStatusPoller.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire `OrderStatusPoller` into `page.tsx`'s Pending branch**

In `app/order/[id]/page.tsx`, change the import on line 4 from:

```ts
import { OrderTicket, type OrderTicketProps } from './OrderTicket'
```

to:

```ts
import type { OrderTicketProps } from './OrderTicket'
import { OrderStatusPoller } from './OrderStatusPoller'
```

Change the final return block (lines 82-87) from:

```tsx
  return (
    <main className="order-page">
      {header}
      <OrderTicket order={ticket} />
    </main>
  )
```

to:

```tsx
  return (
    <main className="order-page">
      {header}
      <OrderStatusPoller order={ticket} />
    </main>
  )
```

- [ ] **Step 6: Update `page.test.tsx`'s mock to match**

In `app/order/[id]/page.test.tsx`, change the mock block (lines 11-17) from:

```ts
// OrderTicket is a client component with next/navigation + apiClient deps;
// stub it so the page test stays focused on branching.
vi.mock('./OrderTicket', () => ({
  OrderTicket: ({ order }: { order: { orderNumber: number } }) => (
    <div data-testid="order-ticket">editable #{order.orderNumber}</div>
  ),
}))
```

to:

```ts
// OrderStatusPoller is a client component with next/navigation + apiClient deps;
// stub it so the page test stays focused on branching.
vi.mock('./OrderStatusPoller', () => ({
  OrderStatusPoller: ({ order }: { order: { orderNumber: number } }) => (
    <div data-testid="order-ticket">editable #{order.orderNumber}</div>
  ),
}))
```

No other lines in `page.test.tsx` need to change — the two tests that reference `getByTestId('order-ticket')` (`'renders the editable ticket for a Pending order'` and `'renders a locked note for a Confirmed order and no editable ticket'`) keep passing against the renamed mock unchanged.

- [ ] **Step 7: Run the page test and the full suite**

Run: `npx vitest run app/order/[id]/page.test.tsx`
Expected: PASS.

Run: `npx vitest run`
Expected: PASS (entire suite).

- [ ] **Step 8: Commit**

```bash
git add app/order/[id]/OrderStatusPoller.tsx app/order/[id]/OrderStatusPoller.test.tsx app/order/[id]/page.tsx app/order/[id]/page.test.tsx
git commit -m "feat: live-update the customer confirmation page when staff confirms"
```

---

### Task 9: Manual verification via Docker

**Files:** none (verification only).

- [ ] **Step 1: Rebuild and start the stack**

Run: `docker compose up --build`
Expected: app reachable at `http://localhost:3001`, Postgres at host port `5433` (per this repo's established Docker workflow, `BUILD_STATUS.md` gotchas log).

- [ ] **Step 2: Seed data and open two browser windows**

Window A: staff dashboard, logged in as staff (or admin) at `/dashboard`.
Window B: a customer order page — scan/open a table's `/order?table=<id>` link, add an item, submit, and stay on the resulting `/order/<id>` confirmation page.

- [ ] **Step 3: Verify the new-order arrival and lane behavior**

In Window A, confirm the new order fades/slides in with a brief highlight pulse within ~4 seconds of submission (no manual reload). Tap the card, confirm the modal opens with the correct items, per-line prices, and total. Click "Confirm order" — the card should animate out of the Pending lane, and a new card should appear in the "Confirmed · awaiting payment" lane.

- [ ] **Step 4: Verify Window B updates live**

Within ~4 seconds of the confirm in Step 3, Window B's ticket should switch from the editable view (Remove/Cancel buttons) to the locked "confirmed" ticket — without the customer reloading or touching anything. Confirm Remove/Cancel controls are gone.

- [ ] **Step 5: Verify payment flow and the completed-today counter**

Back in Window A, tap the card now in the "Confirmed · awaiting payment" lane, click "Mark Paid" in the modal. Confirm the card animates out of that lane and the "N completed today" chip increments with its bump animation.

- [ ] **Step 6: Verify responsive layout**

Resize the browser (or use device emulation) from phone width through desktop width. Confirm the card grid reflows without overlap, and that opening a card's modal on a narrow viewport renders as a bottom sheet rather than a centered dialog that could overflow the screen.

- [ ] **Step 7: Verify reduced-motion**

Enable "prefers reduced motion" in OS/browser settings, reload, and repeat Step 3. Confirm no animation plays (cards and modal should appear/disappear instantly, with no functional difference).

No commit for this task — if any step fails, return to the relevant earlier task, fix, and re-run its test suite before re-verifying here.
