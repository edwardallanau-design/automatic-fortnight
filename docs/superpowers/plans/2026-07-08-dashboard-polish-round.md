# Dashboard Polish Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the customer confirmation page's false "confirmed" heading (ISSUE-10), relax `INV-9` so any staff (not just admin) can revert Paid→Unpaid, and give the dashboard's Confirmed tab a wall-clock timestamp plus a newest/oldest sort toggle.

**Architecture:** Three independent changes sequenced as four tasks (the `INV-9` relaxation splits into a backend task and a dashboard-UI task, since a reviewer could reasonably evaluate the domain-rule change separately from its UI consequences). Each task is self-contained and independently testable.

**Tech Stack:** Next.js (App Router, React 19), TypeScript, Prisma 7 + Postgres, Vitest 4 + React Testing Library, plain global CSS (`app/globals.css`).

## Global Constraints

- No schema/migration changes anywhere in this plan — `confirmedAt` is already a real, populated column on `Order`, already returned by `GET /api/orders` (Prisma's default `findMany` returns all scalar fields), and already used server-side for the existing `date=today` filter.
- `INV-9`'s relaxation is a deliberate, explicitly-approved domain-rule change — not to be treated as scope creep. `INV-8` (payment/confirmation timing independence) is unrelated and untouched.
- Reuse `vi.advanceTimersByTimeAsync` (not plain `advanceTimersByTime`) for any test involving `PendingOrdersDashboard`'s polling `useEffect`, per this codebase's established convention.
- CSS uses only existing custom-property tokens already defined in `app/globals.css`.

---

### Task 1: Fix `ISSUE-10` — `OrderTicket` no longer claims "confirmed" while Pending

**Files:**
- Modify: `app/order/[id]/OrderTicket.tsx`
- Modify: `app/order/[id]/OrderTicket.test.tsx`

**Interfaces:** No change to `OrderTicket`'s props or exports.

- [ ] **Step 1: Write the failing test**

Add to `app/order/[id]/OrderTicket.test.tsx`, inside the `describe('OrderTicket', ...)` block:

```tsx
  it('does not claim the order is confirmed while it is still Pending', () => {
    render(<OrderTicket order={twoLineOrder()} />)

    expect(screen.getByText('Order #47')).toBeInTheDocument()
    expect(screen.queryByText(/confirmed/i)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/order/[id]/OrderTicket.test.tsx"`
Expected: FAIL — the current heading is `Order #47 confirmed`, so `getByText('Order #47')` won't find an exact match and `queryByText(/confirmed/i)` will find the heading text.

- [ ] **Step 3: Fix the heading**

In `app/order/[id]/OrderTicket.tsx`, change:

```tsx
        heading={`Order #${order.orderNumber} confirmed`}
```

to:

```tsx
        heading={`Order #${order.orderNumber}`}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/order/[id]/OrderTicket.test.tsx"`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Update `ISSUES.md`**

In `ISSUES.md`, move the `ISSUE-10` row from the `## Open` table to the `## Resolved` table (matching that table's columns: `ID | Summary | Found in | Root cause | Fix / commit`):

```markdown
| ISSUE-10 | `/order/[id]` showed "Order #N confirmed" as the ticket heading while the order was still `Pending` (editable) — contradicting the status note directly below it | User report while verifying Story 10a's dashboard tabs/tile work | `OrderTicket.tsx`'s `heading` prop was copy-pasted verbatim from the actual-Confirmed branch in `page.tsx` without updating the copy for the Pending state | Heading changed to `Order #{N}` (no status claim), matching the Cancelled branch's plain heading; commit `<fill in after Step 6>` |
```

- [ ] **Step 6: Commit**

```bash
git add "app/order/[id]/OrderTicket.tsx" "app/order/[id]/OrderTicket.test.tsx" ISSUES.md
git commit -m "fix: OrderTicket no longer claims an order is confirmed while Pending (ISSUE-10)"
```

---

### Task 2: Relax `INV-9` — backend (domain doc, `orderService`, API route)

**Files:**
- Modify: `docs/design/02-domain-model.md`
- Modify: `lib/orderService.ts`
- Modify: `lib/orderService.test.ts`
- Modify: `app/api/orders/[id]/pay/route.ts`
- Modify: `app/api/orders/[id]/pay/route.test.ts`

**Interfaces:**
- Produces: `setPaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<OrderWithItems>` — signature drops the `role` parameter. Consumed by Task 3's dashboard code (which stops passing a role) and by `app/api/orders/[id]/pay/route.ts` in this same task.

- [ ] **Step 1: Update the domain model doc**

In `docs/design/02-domain-model.md`, change:

```markdown
- `INV-9` Reverting `paymentStatus` from Paid back to Unpaid may only be performed by Owner/Admin (correcting a staff error) — Staff cannot un-mark a payment.
```

to:

```markdown
- `INV-9` Reverting `paymentStatus` from Paid back to Unpaid may be performed by any authenticated staff or admin session — no role restriction. (Originally Owner/Admin-only; relaxed 2026-07-08 so staff can self-correct a mis-marked payment without needing an admin.)
```

- [ ] **Step 2: Update the failing tests in `lib/orderService.test.ts`**

Replace the full `describe('orderService.setPaymentStatus', ...)` block with:

```ts
describe('orderService.setPaymentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NotFoundError when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    await expect(setPaymentStatus('missing', 'Paid')).rejects.toThrow(NotFoundError)
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('marks an order Paid regardless of fulfillmentStatus', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentStatus: 'Unpaid', fulfillmentStatus: 'Confirmed' } as never)
    const updated = { id: 'o1', paymentStatus: 'Paid', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await setPaymentStatus('o1', 'Paid')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentStatus: 'Paid' },
      include: { items: true },
    })
  })

  it('reverts Paid to Unpaid regardless of caller role', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', paymentStatus: 'Paid', fulfillmentStatus: 'Pending' } as never)
    const updated = { id: 'o1', paymentStatus: 'Unpaid', items: [] }
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never)

    const result = await setPaymentStatus('o1', 'Unpaid')

    expect(result).toEqual(updated)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentStatus: 'Unpaid' },
      include: { items: true },
    })
  })
})
```

Also remove `ForbiddenError` from this file's top-of-file import (it becomes unused once the test above is the only `setPaymentStatus` coverage):

```ts
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from './errors'
```

becomes:

```ts
import { NotFoundError, ConflictError, ValidationError } from './errors'
```

(`ForbiddenError` is not referenced anywhere else in this file — confirm with a search before removing if you have any doubt.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/orderService.test.ts`
Expected: FAIL — `setPaymentStatus` still requires a third `role` argument, so calling it with two arguments is a type error / the old signature still enforces the admin check the new tests don't set up for.

- [ ] **Step 4: Update `setPaymentStatus` and its imports in `lib/orderService.ts`**

Change the top-of-file imports from:

```ts
import type { Order, OrderItem, Table, FulfillmentStatus, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getTableOrThrow } from './tableService'
import { findMenuItemsByIds } from './menuService'
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from './errors'
import type { Role } from './types'
```

to:

```ts
import type { Order, OrderItem, Table, FulfillmentStatus, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getTableOrThrow } from './tableService'
import { findMenuItemsByIds } from './menuService'
import { NotFoundError, ConflictError, ValidationError } from './errors'
```

(`ForbiddenError` and the `Role` type were used only by `setPaymentStatus`'s old admin check — both become unused once it's removed.)

Change:

```ts
export async function setPaymentStatus(
  orderId: string,
  paymentStatus: PaymentStatus,
  role: Role,
): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }
  if (paymentStatus === 'Unpaid' && order.paymentStatus === 'Paid' && role !== 'admin') {
    throw new ForbiddenError('Only admin may revert payment status to Unpaid')
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus },
    include: { items: true },
  })
}
```

to:

```ts
export async function setPaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    throw new NotFoundError('Order not found')
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus },
    include: { items: true },
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/orderService.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Update `app/api/orders/[id]/pay/route.test.ts`**

Replace the full contents of `app/api/orders/[id]/pay/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  setPaymentStatus: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { setPaymentStatus } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/o1/pay', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/orders/[id]/pay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff' })
  })

  it('returns 200 with the updated order when marking Paid', async () => {
    const updated = { id: 'o1', paymentStatus: 'Paid', fulfillmentStatus: 'Pending', items: [] }
    vi.mocked(setPaymentStatus).mockResolvedValue(updated as never)

    const res = await PATCH(makeRequest({ paymentStatus: 'Paid' }), makeContext('o1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.paymentStatus).toBe('Paid')
    expect(setPaymentStatus).toHaveBeenCalledWith('o1', 'Paid')
  })

  it('returns 400 when paymentStatus is missing', async () => {
    const res = await PATCH(makeRequest({}), makeContext('o1'))

    expect(res.status).toBe(400)
    expect(setPaymentStatus).not.toHaveBeenCalled()
  })

  it('returns 400 when paymentStatus is an invalid value', async () => {
    const res = await PATCH(makeRequest({ paymentStatus: 'Refunded' }), makeContext('o1'))

    expect(res.status).toBe(400)
    expect(setPaymentStatus).not.toHaveBeenCalled()
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(setPaymentStatus).mockRejectedValue(new NotFoundError('Order not found'))

    const res = await PATCH(makeRequest({ paymentStatus: 'Paid' }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 200 when reverting Paid to Unpaid', async () => {
    const updated = { id: 'o1', paymentStatus: 'Unpaid', fulfillmentStatus: 'Pending', items: [] }
    vi.mocked(setPaymentStatus).mockResolvedValue(updated as never)

    const res = await PATCH(makeRequest({ paymentStatus: 'Unpaid' }), makeContext('o1'))

    expect(res.status).toBe(200)
    expect(setPaymentStatus).toHaveBeenCalledWith('o1', 'Unpaid')
  })

  it('returns 403 when the caller is not staff or admin at all', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makeRequest({ paymentStatus: 'Paid' }), makeContext('o1'))

    expect(res.status).toBe(403)
    expect(setPaymentStatus).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run "app/api/orders/[id]/pay/route.test.ts"`
Expected: FAIL — the route still destructures `role` and passes it as a third argument to `setPaymentStatus`.

- [ ] **Step 8: Update the route**

In `app/api/orders/[id]/pay/route.ts`, change:

```ts
    const { role } = await requireApiRole('staff')

    const { id } = await context.params
    const body = await request.json()

    if (!VALID_PAYMENT_STATUSES.includes(body.paymentStatus)) {
      throw new ValidationError('paymentStatus must be "Unpaid" or "Paid"')
    }

    const order = await setPaymentStatus(id, body.paymentStatus, role)
```

to:

```ts
    await requireApiRole('staff')

    const { id } = await context.params
    const body = await request.json()

    if (!VALID_PAYMENT_STATUSES.includes(body.paymentStatus)) {
      throw new ValidationError('paymentStatus must be "Unpaid" or "Paid"')
    }

    const order = await setPaymentStatus(id, body.paymentStatus)
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run "app/api/orders/[id]/pay/route.test.ts"`
Expected: PASS.

- [ ] **Step 10: Run the full suite**

Run: `npx vitest run`
Expected: Everything passes EXCEPT `OrderDetailModal.test.tsx` and `PendingOrdersDashboard.test.tsx`, which will fail until Task 3 updates their `role`-dependent assertions — that's expected and handled next task, not a regression from this one.

- [ ] **Step 11: Commit**

```bash
git add docs/design/02-domain-model.md lib/orderService.ts lib/orderService.test.ts "app/api/orders/[id]/pay/route.ts" "app/api/orders/[id]/pay/route.test.ts"
git commit -m "feat: relax INV-9 — any staff may revert Paid to Unpaid, not just admin"
```

---

### Task 3: Relax `INV-9` — dashboard UI consequences

**Files:**
- Modify: `app/dashboard/OrderDetailModal.tsx`
- Modify: `app/dashboard/OrderDetailModal.test.tsx`
- Modify: `app/dashboard/PendingOrdersDashboard.tsx`
- Modify: `app/dashboard/PendingOrdersDashboard.test.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `setPaymentStatus(orderId, paymentStatus)` (Task 2, role-less signature).
- Produces: `OrderDetailModal`'s props drop `role`; `PendingOrdersDashboard`'s props drop `role`. `app/dashboard/page.test.tsx` is unaffected — it doesn't assert on `PendingOrdersDashboard`'s prop signature, only on rendered text/links.

- [ ] **Step 1: Update the failing tests in `OrderDetailModal.test.tsx`**

Replace the full contents of `app/dashboard/OrderDetailModal.test.tsx`:

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
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    const allTotals = screen.getAllByText('$25.00')
    expect(allTotals.length).toBeGreaterThanOrEqual(2) // line + order total
  })

  it('shows Confirm and Mark Paid for a Pending order, and calls the right callback for each', async () => {
    const onConfirm = vi.fn()
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderDetailModal
        order={pendingOrder}
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

  it('shows Mark Unpaid for any role on a Paid order', async () => {
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderDetailModal
        order={{ ...pendingOrder, paymentStatus: 'Paid' }}
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

(This drops the old `role` prop from every render call, removes the "shows a static Paid badge (no revert button) for staff" test since that branch no longer exists, and replaces the old admin-only revert test with a role-agnostic one.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx`
Expected: FAIL — `OrderDetailModal` still requires a `role` prop (TypeScript) and still branches on it to decide between "Mark Unpaid" and a static badge.

- [ ] **Step 3: Update `OrderDetailModal.tsx`**

Remove the `Role` import — change:

```tsx
import { Modal } from '@/app/components/Modal'
import type { Role } from '@/lib/types'
import type { OrderCardItem, OrderCardOrder } from './OrderCard'
```

to:

```tsx
import { Modal } from '@/app/components/Modal'
import type { OrderCardItem, OrderCardOrder } from './OrderCard'
```

Remove `role` from the props type — change:

```tsx
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
```

to:

```tsx
export function OrderDetailModal({
  order,
  busy,
  error,
  exiting,
  onConfirm,
  onSetPaymentStatus,
  onClose,
}: {
  order: OrderCardOrder
  busy: boolean
  error: string | null
  exiting: boolean
  onConfirm: () => void
  onSetPaymentStatus: (paymentStatus: 'Paid' | 'Unpaid') => void
  onClose: () => void
}) {
```

Collapse the payment-action branch — change:

```tsx
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
```

to:

```tsx
        {order.paymentStatus === 'Unpaid' ? (
          <button
            type="button"
            className="order-detail-modal__pay"
            disabled={busy}
            onClick={() => onSetPaymentStatus('Paid')}
          >
            Mark Paid
          </button>
        ) : (
          <button
            type="button"
            className="order-detail-modal__pay order-detail-modal__pay--revert"
            disabled={busy}
            onClick={() => onSetPaymentStatus('Unpaid')}
          >
            Mark Unpaid
          </button>
        )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Remove the now-dead `.order-detail-modal__paid-badge` CSS rule**

In `app/globals.css`, delete this rule (nothing renders it anymore):

```css
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

- [ ] **Step 6: Update the failing tests in `PendingOrdersDashboard.test.tsx`**

In `app/dashboard/PendingOrdersDashboard.test.tsx`, remove `role="staff"` / `role="admin"` from every `render(<PendingOrdersDashboard role="..." />)` call — change every occurrence of:

```tsx
render(<PendingOrdersDashboard role="staff" />)
```

to:

```tsx
render(<PendingOrdersDashboard />)
```

and every occurrence of:

```tsx
render(<PendingOrdersDashboard role="admin" />)
```

to:

```tsx
render(<PendingOrdersDashboard />)
```

Then rename and simplify the admin-specific test. Change:

```tsx
  it('allows an admin to revert a Paid Confirmed order back to Unpaid, in place', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' })
    render(<PendingOrdersDashboard role="admin" />)
```

to:

```tsx
  it('reverts a Paid Confirmed order back to Unpaid, in place', async () => {
    mockTabs({ confirmed: [{ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }] })
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' })
    render(<PendingOrdersDashboard />)
```

(The rest of that test's body is unchanged — only its name and the render call change.)

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — `PendingOrdersDashboard` still requires a `role` prop (TypeScript) and still forwards it to `OrderDetailModal`.

- [ ] **Step 8: Update `PendingOrdersDashboard.tsx`**

Remove the `Role` import and the `role` prop — change:

```tsx
import { useEffect, useRef, useState } from 'react'
import { apiClient, ApiError } from '@/lib/apiClient'
import type { Role } from '@/lib/types'
import { OrderCard, type OrderCardOrder } from './OrderCard'
import { OrderDetailModal } from './OrderDetailModal'
```

to:

```tsx
import { useEffect, useRef, useState } from 'react'
import { apiClient, ApiError } from '@/lib/apiClient'
import { OrderCard, type OrderCardOrder } from './OrderCard'
import { OrderDetailModal } from './OrderDetailModal'
```

Change:

```tsx
export function PendingOrdersDashboard({ role }: { role: Role }) {
```

to:

```tsx
export function PendingOrdersDashboard() {
```

Change:

```tsx
      {modal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          role={role}
          busy={modal.busy}
```

to:

```tsx
      {modal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          busy={modal.busy}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 10: Update `app/dashboard/page.tsx`**

Change:

```tsx
      <PendingOrdersDashboard role={role} />
```

to:

```tsx
      <PendingOrdersDashboard />
```

(`role` itself stays computed via `requireRole('staff')` above this line — it's still used for the admin-only nav-link check earlier in this file.)

- [ ] **Step 11: Run the full suite**

Run: `npx vitest run`
Expected: PASS — including `app/dashboard/page.test.tsx`, which doesn't assert on `PendingOrdersDashboard`'s props and is unaffected by this change.

- [ ] **Step 12: Commit**

```bash
git add app/dashboard/OrderDetailModal.tsx app/dashboard/OrderDetailModal.test.tsx app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/dashboard/page.tsx app/globals.css
git commit -m "refactor: drop role-gating from the dashboard payment-revert UI"
```

---

### Task 4: Confirmed tab — wall-clock timestamp + newest/oldest sort

**Files:**
- Modify: `app/dashboard/OrderCard.tsx`
- Modify: `app/dashboard/OrderCard.test.tsx`
- Modify: `app/dashboard/PendingOrdersDashboard.tsx`
- Modify: `app/dashboard/PendingOrdersDashboard.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `OrderCardOrder` gains an optional `confirmedAt?: string | null` field. Made optional (not required) deliberately — the field is already present at runtime on every order the API returns, but making it optional avoids having to touch every pre-existing test fixture across this codebase that constructs an `OrderCardOrder`-shaped object and doesn't care about this field; only tests that specifically exercise the new timestamp/sort behavior need to set it.

- [ ] **Step 1: Write the failing tests in `OrderCard.test.tsx`**

Add these two tests inside the `describe('OrderCard', ...)` block in `app/dashboard/OrderCard.test.tsx` (after the existing "shows the badge..." test):

```tsx
  it('shows relative time for a Pending order', () => {
    render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('2 min ago')).toBeInTheDocument()
  })

  it('shows a wall-clock timestamp for a Confirmed order, derived from confirmedAt not createdAt', () => {
    render(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Confirmed', confirmedAt: '2026-07-04T18:30:00.000Z' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).toBeInTheDocument()
    expect(screen.queryByText(/min ago|just now/)).not.toBeInTheDocument()
  })
```

(The timestamp test deliberately checks the *pattern*, not an exact clock string — `toLocaleTimeString` renders in the test runner's local timezone, which varies between machines/CI, so asserting an exact "2:34 PM" would be flaky. The pattern proves it's a clock time, and the second assertion proves it's not the relative-time format.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: FAIL on the new "wall-clock timestamp" test — `OrderCard` currently always uses `formatTimeAgo(createdAt)` regardless of `fulfillmentStatus`, and `confirmedAt` isn't a field on `OrderCardOrder` yet (TypeScript error). The "shows relative time for a Pending order" test should already pass (documenting existing behavior) — if it doesn't, something else changed; investigate before proceeding.

- [ ] **Step 3: Update `OrderCard.tsx`**

Add `confirmedAt` to the type — change:

```tsx
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
```

to:

```tsx
export type OrderCardOrder = {
  id: string
  orderNumber: number
  createdAt: string
  confirmedAt?: string | null
  fulfillmentStatus: 'Pending' | 'Confirmed'
  paymentStatus: 'Unpaid' | 'Paid'
  customerName: string | null
  table: { number: number }
  items: OrderCardItem[]
}
```

Add a wall-clock formatter next to `formatTimeAgo` — change:

```tsx
function formatTimeAgo(createdAt: string): string {
  const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago`
}
```

to:

```tsx
function formatTimeAgo(createdAt: string): string {
  const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago`
}

function formatTimestamp(confirmedAt: string): string {
  return new Date(confirmedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
```

Compute and render the right time label — change:

```tsx
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
```

to:

```tsx
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const timeLabel =
    order.fulfillmentStatus === 'Confirmed' && order.confirmedAt
      ? formatTimestamp(order.confirmedAt)
      : formatTimeAgo(order.createdAt)

  return (
```

and change:

```tsx
          <span className="order-card__time">{formatTimeAgo(order.createdAt)}</span>
```

to:

```tsx
          <span className="order-card__time">{timeLabel}</span>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Write the failing tests for the sort toggle in `PendingOrdersDashboard.test.tsx`**

Add these two tests to `app/dashboard/PendingOrdersDashboard.test.tsx`, inside the `describe('PendingOrdersDashboard', ...)` block (anywhere after the existing tab tests is fine):

```tsx
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
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — there's no sort control and no sort logic yet.

- [ ] **Step 7: Add sort state and logic to `PendingOrdersDashboard.tsx`**

Add a `sortDirection` state — change:

```tsx
export function PendingOrdersDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [pendingOrders, setPendingOrders] = useState<DashboardOrder[]>([])
  const [confirmedOrders, setConfirmedOrders] = useState<DashboardOrder[]>([])
```

to:

```tsx
export function PendingOrdersDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest')
  const [pendingOrders, setPendingOrders] = useState<DashboardOrder[]>([])
  const [confirmedOrders, setConfirmedOrders] = useState<DashboardOrder[]>([])
```

Add a sort helper and use it — change:

```tsx
  const activeOrders = activeTab === 'pending' ? pendingOrders : confirmedOrders
  const emptyMessage = activeTab === 'pending' ? 'No pending orders' : 'No orders confirmed yet today'
```

to:

```tsx
  function sortConfirmedOrders(orders: DashboardOrder[]): DashboardOrder[] {
    const sorted = [...orders].sort((a, b) => {
      const aTime = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0
      const bTime = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0
      return aTime - bTime
    })
    return sortDirection === 'newest' ? sorted.reverse() : sorted
  }

  const activeOrders = activeTab === 'pending' ? pendingOrders : sortConfirmedOrders(confirmedOrders)
  const emptyMessage = activeTab === 'pending' ? 'No pending orders' : 'No orders confirmed yet today'
```

Add the sort toggle button to the JSX, right after the tab bar and before the panel — change:

```tsx
      <section
        className="order-rail__panel"
        aria-label={activeTab === 'pending' ? 'Pending orders' : 'Confirmed orders'}
      >
```

to:

```tsx
      {activeTab === 'confirmed' && (
        <button
          type="button"
          className="order-rail__sort"
          onClick={() => setSortDirection((current) => (current === 'newest' ? 'oldest' : 'newest'))}
        >
          <span className="order-rail__sort-arrow" aria-hidden="true">
            {sortDirection === 'newest' ? '↓' : '↑'}
          </span>
          {sortDirection === 'newest' ? 'Newest first' : 'Oldest first'}
        </button>
      )}

      <section
        className="order-rail__panel"
        aria-label={activeTab === 'pending' ? 'Pending orders' : 'Confirmed orders'}
      >
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 9: Add the sort-button CSS**

Append to `app/globals.css`, after the `.order-rail__tab--active` rule:

```css
.order-rail__sort {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  letter-spacing: 0.03em;
  color: var(--clay);
  background: none;
  border: 1px solid var(--clay-faint);
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  margin-bottom: 1rem;
}

.order-rail__sort:hover {
  color: var(--espresso);
  border-color: var(--copper);
}

.order-rail__sort:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}
```

- [ ] **Step 10: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add app/dashboard/OrderCard.tsx app/dashboard/OrderCard.test.tsx app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/globals.css
git commit -m "feat: Confirmed tab gets a wall-clock timestamp and a newest/oldest sort toggle"
```
