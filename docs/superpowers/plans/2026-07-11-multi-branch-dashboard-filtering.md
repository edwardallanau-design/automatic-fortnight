# Multi-branch dashboard filtering Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the real security gap where `GET /api/orders` has zero branch awareness — a non-Main branch's staff currently sees every branch's orders — and give admin a branch-tab view on the dashboard on top of the fix.

**Architecture:** `lib/orderService.ts`'s `listOrders()` gains an optional `branchId` filter and an unconditional `branch: true` include. `app/api/orders/route.ts`'s `GET` handler forces `branchId = session.branchId` for staff, falling back to an optional `?branchId=` only for admin (mirrors the exact `resolveBranchId` security boundary Plans 1/2 already established). `PendingOrdersDashboard` (client component) gains a `branches` prop and an `activeBranch` client `useState` — a second, outer tab strip that filters the already-fetched order list in memory, with no new network calls, exactly like the existing Pending/Confirmed tabs already do. `OrderCard` gains a `showBranch` prop for a small branch-name tag, shown only on the "All" tab. `app/dashboard/page.tsx` fetches `listBranches()` only for admin sessions and passes it down — no new API route.

**Tech Stack:** Next.js App Router (server components + route handlers), Prisma/PostgreSQL, Vitest + Testing Library. No new dependencies, no migration.

## Global Constraints

- Staff sessions **always** win: a staff session's own `branchId` is forced into `listOrders()` unconditionally, even if a client sends a different `?branchId=`. This is the actual security fix and must never be weakened by a query param.
- Admin's `?branchId=` is optional; omitted means "All" (every branch's orders).
- The branch tab strip is plain client `useState` (`activeBranch`), **not** a URL param — deliberately inconsistent with Plan 2's `?branch=<id>` convention, because this component is a live-polling component that never does page navigation. Do not introduce `useRouter`/`usePathname` here.
- `fetchTabs()` stays unfiltered-by-branch on every poll; the branch tab filters the already-fetched list client-side. Do not add a `branchId` query param to the dashboard's own `/api/orders` calls.
- Zero staff-facing UI change. A staff dashboard (`branches` prop empty) must never render the branch tab strip and must never show the `OrderCard` branch tag, even though `activeBranch` still defaults to `'all'` internally.
- No new API route for branches — `app/dashboard/page.tsx` is a server component and reads `lib/branchService.ts`'s `listBranches()` directly, matching Plan 2's precedent (no `GET /api/branches` exists).
- `getOrderById` (backs the single-order fetch used elsewhere) is **out of scope** — do not add `branch` to its Prisma `include` or touch `OrderWithItemsAndOrderingPoint`. Introduce a new, separate type for `listOrders`'s return instead, so `getOrderById`'s existing contract is untouched.
- `OrderDetailModal` is unchanged — it already receives a full order object and has no branch-specific action.
- Spec: `docs/superpowers/specs/2026-07-11-multi-branch-dashboard-filtering-design.md`.

---

### Task 1: `lib/orderService.ts` — `branchId` filter + `branch` include on `listOrders()`

**Files:**
- Modify: `lib/orderService.ts`
- Modify: `lib/orderService.test.ts`

**Interfaces:**
- Consumes: `prisma.order.findMany` (existing).
- Produces: `listOrders(options: { status?: FulfillmentStatus; paymentStatus?: PaymentStatus; date?: 'today'; branchId?: string }): Promise<OrderWithItemsOrderingPointAndBranch[]>` — a new type, `OrderWithItemsOrderingPointAndBranch = OrderWithItemsAndOrderingPoint & { branch: Branch }`. `OrderWithItemsAndOrderingPoint` itself (used by `getOrderById`) is untouched. Consumed by Task 2's route handler.

- [ ] **Step 1: Write the failing tests**

Replace the entire `describe('orderService.listOrders', ...)` block in `lib/orderService.test.ts` (currently lines 181-268) with:

```ts
describe('orderService.listOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries with a status filter, ordered oldest-first, including items, orderingPoint, and branch', async () => {
    const orders = [
      {
        id: 'o1',
        orderNumber: 1,
        orderingPointId: 'op1',
        branchId: 'b1',
        fulfillmentStatus: 'Pending',
        paymentStatus: 'Unpaid',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        confirmedAt: null,
        items: [],
        orderingPoint: { id: 'op1', branchId: 'b1', label: 'Table 4', isCounter: false, createdAt: new Date() },
        branch: { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      },
    ]
    vi.mocked(prisma.order.findMany).mockResolvedValue(orders as never)

    const result = await listOrders({ status: 'Pending' })

    expect(result).toEqual(orders)
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('omits the where filter when no options are given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders()

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {},
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('queries with a paymentStatus filter combined with status', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Confirmed', paymentStatus: 'Unpaid' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' },
      include: { items: true, orderingPoint: true, branch: true },
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
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('adds a branchId filter to the where clause when branchId is given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ branchId: 'b2' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { branchId: 'b2' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('combines a branchId filter with status and paymentStatus', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Pending', paymentStatus: 'Unpaid', branchId: 'b2' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending', paymentStatus: 'Unpaid', branchId: 'b2' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('omits the branchId filter when not given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)

    await listOrders({ status: 'Pending' })

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { fulfillmentStatus: 'Pending' },
      include: { items: true, orderingPoint: true, branch: true },
      orderBy: { createdAt: 'asc' },
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/orderService.test.ts`
Expected: FAIL — every assertion expecting `include: { items: true, orderingPoint: true, branch: true }` fails because the current source only includes `{ items: true, orderingPoint: true }`; the two new `branchId`-filter tests fail because `listOrders` doesn't accept `branchId` yet.

- [ ] **Step 3: Implement the source change**

In `lib/orderService.ts`, change the import line (line 1) to add `Branch`:

```ts
import type { Order, OrderItem, OrderingPoint, Branch, FulfillmentStatus, PaymentStatus, Prisma } from '@prisma/client'
```

Replace the existing type declaration and `listOrders` function (lines 69-90) with:

```ts
export type OrderWithItemsAndOrderingPoint = Order & { items: OrderItem[]; orderingPoint: OrderingPoint }
export type OrderWithItemsOrderingPointAndBranch = OrderWithItemsAndOrderingPoint & { branch: Branch }

export async function listOrders(
  options: { status?: FulfillmentStatus; paymentStatus?: PaymentStatus; date?: 'today'; branchId?: string } = {},
): Promise<OrderWithItemsOrderingPointAndBranch[]> {
  const where: Prisma.OrderWhereInput = {}
  if (options.status) where.fulfillmentStatus = options.status
  if (options.paymentStatus) where.paymentStatus = options.paymentStatus
  if (options.branchId) where.branchId = options.branchId
  if (options.date === 'today') {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startOfNextDay = new Date(startOfDay)
    startOfNextDay.setDate(startOfNextDay.getDate() + 1)
    where.confirmedAt = { gte: startOfDay, lt: startOfNextDay }
  }

  return prisma.order.findMany({
    where,
    include: { items: true, orderingPoint: true, branch: true },
    orderBy: { createdAt: 'asc' },
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/orderService.test.ts`
Expected: PASS (all tests in the file, including `getOrderById`'s untouched tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (the `getOrderById` block still compiles against the unchanged `OrderWithItemsAndOrderingPoint`)

- [ ] **Step 6: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "feat: add branchId filter and branch include to listOrders"
```

---

### Task 2: `app/api/orders/route.ts` — force branch scoping on `GET`

**Files:**
- Modify: `app/api/orders/route.ts`
- Modify: `app/api/orders/route.test.ts`

**Interfaces:**
- Consumes: `listOrders(options)` from Task 1 (now accepts `branchId`); `requireApiRole('staff')` returns `{ role: Role; branchId?: string }` (existing, from `lib/authGuard.ts`).
- Produces: no new exports — this is the actual security fix, scoping `GET /api/orders`'s existing behavior.

- [ ] **Step 1: Write the failing tests**

In `app/api/orders/route.test.ts`, update the four existing `listOrders` call assertions to include the new `branchId` key, and append four new tests, inside the existing `describe('GET /api/orders', ...)` block:

Update line 137 (`'returns 200 with the filtered list for status=pending'`):
```ts
    expect(listOrders).toHaveBeenCalledWith({ status: 'Pending', paymentStatus: undefined, date: undefined, branchId: undefined })
```

Update line 146 (`'returns 200 with an unfiltered call when no status is given'`):
```ts
    expect(listOrders).toHaveBeenCalledWith({ status: undefined, paymentStatus: undefined, date: undefined, branchId: undefined })
```

Update line 181 (`'returns 200 with a paymentStatus filter combined with status'`):
```ts
    expect(listOrders).toHaveBeenCalledWith({ status: 'Confirmed', paymentStatus: 'Unpaid', date: undefined, branchId: undefined })
```

Update line 190 (`'returns 200 with a date=today filter'`):
```ts
    expect(listOrders).toHaveBeenCalledWith({ status: 'Confirmed', paymentStatus: 'Paid', date: 'today', branchId: undefined })
```

Append these four tests just before the closing `})` of the `describe('GET /api/orders', ...)` block (after the existing `'returns 400 for an invalid date value'` test):

```ts
  it("forces a staff session's own branchId regardless of a client-supplied ?branchId=, even a different one", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff', branchId: 'b1' })
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest('?status=pending&branchId=b2'))

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: 'Pending', paymentStatus: undefined, date: undefined, branchId: 'b1' })
  })

  it("forces a staff session's own branchId even when no ?branchId= is supplied", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'staff', branchId: 'b1' })
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest('?status=pending'))

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: 'Pending', paymentStatus: undefined, date: undefined, branchId: 'b1' })
  })

  it("honors an admin session's ?branchId= when present", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest('?branchId=b2'))

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: undefined, paymentStatus: undefined, date: undefined, branchId: 'b2' })
  })

  it("gives an admin session every branch's orders when no ?branchId= is supplied", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listOrders).mockResolvedValue([] as never)

    const res = await GET(makeGetRequest())

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalledWith({ status: undefined, paymentStatus: undefined, date: undefined, branchId: undefined })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: FAIL — the updated assertions fail because `GET` doesn't yet pass `branchId` to `listOrders`; the four new tests fail for the same reason.

- [ ] **Step 3: Implement the source change**

In `app/api/orders/route.ts`, replace the `GET` function (lines 19-57) with:

```ts
export async function GET(request: Request) {
  try {
    const session = await requireApiRole('staff')

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const paymentStatusParam = searchParams.get('paymentStatus')
    const dateParam = searchParams.get('date')
    const branchIdParam = searchParams.get('branchId')

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

    const branchId = session.branchId ?? branchIdParam ?? undefined

    const orders = await listOrders({ status, paymentStatus, date, branchId })
    return NextResponse.json(orders, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: PASS (all tests in the file, including the unrelated `POST` tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "fix: scope GET /api/orders to the caller's branch"
```

---

### Task 3: `app/dashboard/OrderCard.tsx` — `showBranch` prop and branch-name tag

**Files:**
- Modify: `app/dashboard/OrderCard.tsx`
- Modify: `app/dashboard/OrderCard.test.tsx`
- Modify: `app/dashboard/OrderDetailModal.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OrderCardOrder` gains `branchId: string` and `branch: { name: string }` (breaking change to the type — every literal typed as `OrderCardOrder` must supply these two fields from now on). `OrderCard` gains `showBranch?: boolean` (default `false`). Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

In `app/dashboard/OrderCard.test.tsx`, add `branchId: 'b1', branch: { name: 'Main' },` to the `order` fixture object (after the `customerName: 'Edward',` line, before `orderingPoint: { label: 'Table 4' },`):

```ts
const order: OrderCardOrder = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  paymentChoice: 'None',
  paymentMethodNameSnapshot: null,
  paymentReference: null,
  customerName: 'Edward',
  branchId: 'b1',
  branch: { name: 'Main' },
  orderingPoint: { label: 'Table 4' },
  items: [
    { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 },
    { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 },
  ],
}
```

Append two new tests at the end of the `describe('OrderCard', ...)` block, just before its closing `})`:

```ts
  it('shows a branch-name tag when showBranch is true', () => {
    render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} showBranch />)
    expect(screen.getByText('· Main')).toBeInTheDocument()
  })

  it('shows no branch-name tag when showBranch is false or omitted', () => {
    render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.queryByText('· Main')).not.toBeInTheDocument()
  })
```

In `app/dashboard/OrderDetailModal.test.tsx`, add the same two fields to the `pendingOrder` fixture (after `customerName: 'Edward',`, before `orderingPoint: { label: 'Table 4' },`):

```ts
const pendingOrder: OrderCardOrder = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  paymentChoice: 'None',
  paymentMethodNameSnapshot: null,
  paymentReference: null,
  customerName: 'Edward',
  branchId: 'b1',
  branch: { name: 'Main' },
  orderingPoint: { label: 'Table 4' },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx app/dashboard/OrderDetailModal.test.tsx`
Expected: FAIL — `tsc`/vitest reports `branchId`/`branch` missing from the fixtures is not actually a runtime failure (TS types aren't checked by vitest at runtime), so the two new tests are the ones that fail: `showBranch` doesn't exist yet, so no `· Main` tag ever renders.

Run: `npx tsc --noEmit`
Expected: FAIL at this point — Step 3 will add the `branchId`/`branch` fields to the `OrderCardOrder` type, which is what these fixtures are pre-emptively satisfying. Confirm this failure is exactly "Task 4 hasn't happened yet" scoped — i.e. errors only in files this task and Task 4 touch, not elsewhere. (If `tsc` is clean already, that's fine too — it means the fixtures merely added extra fields the current type allows.)

- [ ] **Step 3: Implement the source change**

In `app/dashboard/OrderCard.tsx`, replace the `OrderCardOrder` type (lines 5-18) with:

```ts
export type OrderCardOrder = {
  id: string
  orderNumber: number
  createdAt: string
  confirmedAt?: string | null
  fulfillmentStatus: 'Pending' | 'Confirmed'
  paymentStatus: 'Unpaid' | 'Paid'
  paymentChoice: 'None' | 'Counter' | 'Online'
  paymentMethodNameSnapshot: string | null
  paymentReference: string | null
  customerName: string | null
  branchId: string
  branch: { name: string }
  orderingPoint: { label: string }
  items: OrderCardItem[]
}
```

Replace the `OrderCard` function (lines 33-74) with:

```ts
export function OrderCard({
  order,
  exiting,
  showBranch = false,
  onOpen,
}: {
  order: OrderCardOrder
  exiting: boolean
  showBranch?: boolean
  onOpen: () => void
}) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const timeLabel =
    order.fulfillmentStatus === 'Confirmed' && order.confirmedAt
      ? formatTimestamp(order.confirmedAt)
      : formatTimeAgo(order.createdAt)

  return (
    <li className="order-grid__item">
      <button
        type="button"
        className={`order-card${exiting ? ' order-card--exiting' : ''}`}
        aria-label={`Order ${order.orderNumber}, ${order.orderingPoint.label}`}
        onClick={onOpen}
      >
        <span className="order-card__stub">#{order.orderNumber}</span>
        <span className="order-card__table">
          {order.orderingPoint.label}
          {order.customerName && <span className="order-card__customer"> · {order.customerName}</span>}
          {showBranch && <span className="order-card__branch-tag"> · {order.branch.name}</span>}
        </span>
        <span className="order-card__meta">
          <span className="order-card__time">{timeLabel}</span>
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

In `app/globals.css`, add this rule directly after the existing `.order-card__customer` rule (around line 1466):

```css
.order-card__branch-tag {
  font-weight: 400;
  color: var(--clay);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/OrderCard.test.tsx app/dashboard/OrderDetailModal.test.tsx`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/OrderCard.tsx app/dashboard/OrderCard.test.tsx app/dashboard/OrderDetailModal.test.tsx app/globals.css
git commit -m "feat: add showBranch tag to OrderCard"
```

---

### Task 4: `app/dashboard/PendingOrdersDashboard.tsx` — branch tab strip and client-side filtering

**Files:**
- Modify: `app/dashboard/PendingOrdersDashboard.tsx`
- Modify: `app/dashboard/PendingOrdersDashboard.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `OrderCardOrder` (now requires `branchId`/`branch`) and `OrderCard`'s `showBranch` prop from Task 3.
- Produces: `PendingOrdersDashboard({ role?: Role; branches?: { id: string; name: string }[] })` — the new `branches` prop, consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

In `app/dashboard/PendingOrdersDashboard.test.tsx`, add `branchId`/`branch` fields to the two existing fixtures (`orderA` gets Main, `orderB` gets Downtown — this lets the new tests exercise real cross-branch filtering without separate fixtures):

```ts
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
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
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
  items: [{ id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 }],
}
```

Append a new `describe` block at the end of the file, just before the final closing `})` of `describe('PendingOrdersDashboard', ...)`:

```ts
  describe('branch tabs (admin only)', () => {
    it('renders no branch tab strip when branches is empty', async () => {
      mockTabs({ pending: [orderA] })
      render(<PendingOrdersDashboard />)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.queryByRole('tablist', { name: 'Branch' })).not.toBeInTheDocument()
    })

    it('renders an All tab plus one tab per branch when branches is non-empty', async () => {
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

      const branchTablist = screen.getByRole('tablist', { name: 'Branch' })
      expect(within(branchTablist).getByRole('tab', { name: 'All' })).toBeInTheDocument()
      expect(within(branchTablist).getByRole('tab', { name: 'Main' })).toBeInTheDocument()
      expect(within(branchTablist).getByRole('tab', { name: 'Downtown' })).toBeInTheDocument()
    })

    it('defaults to the All tab, showing every branch\'s orders with a branch tag on each card', async () => {
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

    it('switching to a specific branch tab filters the already-fetched list client-side, with no new fetch call', async () => {
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
      const fetchCallCount = vi.mocked(apiClient.get).mock.calls.length

      const branchTablist = screen.getByRole('tablist', { name: 'Branch' })
      fireEvent.click(within(branchTablist).getByRole('tab', { name: 'Downtown' }))

      expect(screen.getByText('Table 7')).toBeInTheDocument()
      expect(screen.queryByText('Table 4')).not.toBeInTheDocument()
      expect(vi.mocked(apiClient.get).mock.calls.length).toBe(fetchCallCount)
    })

    it('hides the branch tag and branch-scopes the tab counts once a specific branch tab is active', async () => {
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

      const branchTablist = screen.getByRole('tablist', { name: 'Branch' })
      fireEvent.click(within(branchTablist).getByRole('tab', { name: 'Downtown' }))

      expect(screen.queryByText('· Downtown')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Pending (1)' })).toBeInTheDocument()
    })

    it('never shows a branch tag when branches is empty, even though activeBranch defaults to "all"', async () => {
      mockTabs({ pending: [orderA] })
      render(<PendingOrdersDashboard />)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.queryByText('· Main')).not.toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — `branches` prop doesn't exist yet, so no branch tab strip ever renders and no branch tag ever shows.

- [ ] **Step 3: Implement the source change**

In `app/dashboard/PendingOrdersDashboard.tsx`:

Change the component signature (line 29) to:

```ts
export function PendingOrdersDashboard({
  role = 'staff',
  branches = [],
}: { role?: Role; branches?: { id: string; name: string }[] } = {}) {
```

Add a new state declaration right after the existing `sortDirection` state (after line 31):

```ts
  const [activeBranch, setActiveBranch] = useState<'all' | string>('all')
```

Replace the `activeOrders`/`emptyMessage` computation (lines 211-212) with:

```ts
  function branchFiltered(list: DashboardOrder[]): DashboardOrder[] {
    return activeBranch === 'all' ? list : list.filter((o) => o.branchId === activeBranch)
  }

  const activeOrders = branchFiltered(activeTab === 'pending' ? pendingOrders : sortConfirmedOrders(confirmedOrders))
  const showBranchTag = branches.length > 0 && activeBranch === 'all'
  const emptyMessage = activeTab === 'pending' ? 'No pending orders' : 'No orders confirmed yet today'
```

Insert a new branch tab strip right before the existing `<div className="order-rail__tabs" role="tablist">` (line 221), guarded by `branches.length > 0`:

```tsx
      {branches.length > 0 && (
        <div className="order-rail__tabs order-rail__tabs--branch" role="tablist" aria-label="Branch">
          <button
            type="button"
            role="tab"
            aria-selected={activeBranch === 'all'}
            className={`order-rail__tab${activeBranch === 'all' ? ' order-rail__tab--active' : ''}`}
            onClick={() => setActiveBranch('all')}
          >
            All
          </button>
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              role="tab"
              aria-selected={activeBranch === branch.id}
              className={`order-rail__tab${activeBranch === branch.id ? ' order-rail__tab--active' : ''}`}
              onClick={() => setActiveBranch(branch.id)}
            >
              {branch.name}
            </button>
          ))}
        </div>
      )}
```

Update the two tab-count labels (currently `Pending ({pendingOrders.length})` and `Confirmed ({confirmedOrders.length})`) to be branch-scoped:

```tsx
          Pending ({branchFiltered(pendingOrders).length})
```

```tsx
          Confirmed ({branchFiltered(confirmedOrders).length})
```

Update the `OrderCard` usage inside the `order-grid` map (lines 264-269) to pass `showBranch`:

```tsx
              <OrderCard
                key={order.id}
                order={order}
                exiting={exitingIds.has(order.id)}
                showBranch={showBranchTag}
                onOpen={() => openModal(order.id)}
              />
```

In `app/globals.css`, add this rule directly after the existing `.order-rail__tabs` rule (around line 1747):

```css
.order-rail__tabs--branch {
  margin-bottom: 0.75rem;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: PASS (all tests in the file, old and new)

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/globals.css
git commit -m "feat: add admin-only branch tab strip to the dashboard"
```

---

### Task 5: `app/dashboard/page.tsx` — fetch branches for admin sessions

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `listBranches(): Promise<Branch[]>` from `lib/branchService.ts` (existing, from Plan 2); `PendingOrdersDashboard`'s `branches` prop from Task 4.
- Produces: nothing new — this is the wiring task that closes out the plan.

- [ ] **Step 1: Write the failing tests**

In `app/dashboard/page.test.tsx`, add a mock for `lib/branchService` right after the existing `vi.mock('@/lib/apiClient', ...)` block:

```ts
vi.mock('@/lib/branchService', () => ({
  listBranches: vi.fn(),
}))
```

Add the import at the top, alongside the existing `apiClient` import:

```ts
import { listBranches } from '@/lib/branchService'
```

Add `vi.mocked(listBranches).mockResolvedValue([])` to the existing `beforeEach`:

```ts
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue([])
    vi.mocked(listBranches).mockResolvedValue([])
  })
```

Append two new tests at the end of the `describe('DashboardPage', ...)` block, just before its closing `})`:

```ts
  it('does not call listBranches for a staff session', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await DashboardPage()
    render(ui)

    expect(listBranches).not.toHaveBeenCalled()
    expect(screen.queryByRole('tablist', { name: 'Branch' })).not.toBeInTheDocument()
  })

  it('shows a branch tab strip for an admin session with more than one branch', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    const ui = await DashboardPage()
    render(ui)

    expect(listBranches).toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Downtown' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/page.test.tsx`
Expected: FAIL — `listBranches` is never called by `DashboardPage` yet, so no branch tabs render for the admin test, and the mock module doesn't match a real export yet either way (it will resolve once Step 3 lands, since `vi.mock` just needs the module to exist).

- [ ] **Step 3: Implement the source change**

Replace `app/dashboard/page.tsx` in full:

```tsx
import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { listBranches } from '@/lib/branchService'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'

export default async function DashboardPage() {
  const { role } = await requireRole('staff')
  const branches = role === 'admin' ? await listBranches() : []

  return (
    <main className="staff-dashboard">
      <header className="staff-header">
        <div>
          <span className="staff-header__eyebrow">Order rail</span>
          <h1 className="staff-header__title">Staff Dashboard</h1>
        </div>
        <Link href="/order/new" className="staff-header__new-order">
          + New order
        </Link>
      </header>
      <PendingOrdersDashboard role={role} branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
    </main>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/page.test.tsx`
Expected: PASS (all tests in the file, including the three pre-existing ones)

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/page.test.tsx
git commit -m "feat: pass admin branch list into the dashboard"
```

---

### Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --exclude "**/.worktrees/**"`
Expected: PASS, no regressions (per `BUILD_STATUS.md`'s gotcha (d), exclude any worktree if one exists alongside the main checkout)

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no new errors (any pre-existing `ISSUE-20` lint errors are already known and unrelated to this plan)

- [ ] **Step 3: Manual smoke test**

Per `BUILD_STATUS.md`'s established pattern, smoke-test via `docker compose up --build` against real Postgres data with at least two branches (Plan 2's `/admin/branches` page, or seed data, must have created a second branch already):
1. Log in as staff for a non-Main branch; confirm the dashboard shows only that branch's orders and has no branch tab strip (pixel-identical to before this plan).
2. Log in as admin; confirm the branch tab strip appears above Pending/Confirmed, defaults to "All", and every card shows a branch-name tag.
3. Click a specific branch tab as admin; confirm only that branch's orders show, the tag disappears, and the network tab shows no new `/api/orders` request fired by the click (only the tab counts/list changed client-side).
4. Confirm the existing 3.5s poll still refreshes both Pending and Confirmed tabs while a specific branch tab is selected.
