# Order Customer Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers can optionally attach a name to an order at submission time; the name shows on the staff dashboard, the order ticket, and the menu header.

**Architecture:** Additive nullable `customerName` column on `Order`, flowing through the existing create-order path (service → POST route → review modal). The name is remembered per table in `sessionStorage` (same pattern as the cart) to prefill the next order and to display in the menu header. Immutable after creation — no rename endpoints.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (`@prisma/adapter-pg`), Vitest 4 + Testing Library, plain CSS in `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-07-07-order-customer-name-design.md`

## Global Constraints

- `customerName` is always optional — submission never blocks on it.
- Max **50 characters after trimming**; longer is a `ValidationError` (HTTP 400).
- The database never stores `""` — the service coerces empty/whitespace-only to `null`. Every consumer checks `customerName != null` only.
- sessionStorage key is exactly `orderName:${tableId}`. All reads/writes go through `app/order/orderNameStorage.ts` — never inline the key elsewhere.
- UI copy (exact strings): input label `Name for this order`, helper text `Add a name so we can find you`.
- sessionStorage failures are silently swallowed (existing cart pattern).
- Commit messages: conventional prefix (`feat:`/`test:`/`docs:`), **no Co-Authored-By trailer** (user preference).
- Test commands: `npm test -- <path>` runs one file; `npm test` runs everything.
- Repo gotchas that apply here (from `BUILD_STATUS.md` gotchas log): run `npx prisma generate` if `tsc`/tests report the new field missing after the migration; `vi.mock` factories are hoisted (use `vi.hoisted` for shared mock fns); prefer `127.0.0.1` over `localhost` in `DATABASE_URL`.

---

### Task 1: Schema migration + docs + story tracking

**Files:**
- Modify: `prisma/schema.prisma:48-58` (Order model)
- Modify: `docs/design/02-domain-model.md:22` (Order entity line)
- Modify: `BUILD_STATUS.md` (story table)
- Create (generated): `prisma/migrations/<timestamp>_add_order_customer_name/`

**Interfaces:**
- Consumes: nothing.
- Produces: `Order.customerName: string | null` available on the Prisma client for all later tasks.

- [ ] **Step 1: Add the story to BUILD_STATUS.md**

Append this row to the MVP story table (after row 6):

```markdown
| 9 | Order customer name (user-directed, post-epic) | Building | Spec: docs/superpowers/specs/2026-07-07-order-customer-name-design.md |
```

- [ ] **Step 2: Add the column to the Order model**

In `prisma/schema.prisma`, add one line to `model Order` after `paymentStatus`:

```prisma
model Order {
  id                String            @id @default(uuid())
  orderNumber       Int               @unique @default(autoincrement())
  tableId           String
  table             Table             @relation(fields: [tableId], references: [id])
  fulfillmentStatus FulfillmentStatus @default(Pending)
  paymentStatus     PaymentStatus     @default(Unpaid)
  customerName      String?
  createdAt         DateTime          @default(now())
  confirmedAt       DateTime?
  items             OrderItem[]
}
```

- [ ] **Step 3: Run the migration**

Requires the local Postgres from `docker-compose.yml` to be running (`docker-compose up -d` if not).

Run: `npx prisma migrate dev --name add_order_customer_name`
Expected: new folder under `prisma/migrations/`, output ending in "Your database is now in sync with your schema." If TypeScript later can't see `customerName`, run `npx prisma generate` (known gotcha).

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm test`
Expected: all tests pass (column is nullable and additive; nothing reads it yet).

- [ ] **Step 5: Update the domain model doc**

In `docs/design/02-domain-model.md`, change the Order entity line (line 22) to:

```markdown
- **Order** — `table` (ref), `fulfillmentStatus`, `paymentStatus`, `orderNumber`, `customerName` (optional, captured at submission, immutable afterward), `createdAt`, `confirmedAt` — the aggregate root for a customer's visit.
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations docs/design/02-domain-model.md BUILD_STATUS.md
git commit -m "feat: add nullable customerName column to Order"
```

---

### Task 2: sessionStorage helper for the order name

**Files:**
- Create: `app/order/orderNameStorage.ts`
- Test: `app/order/orderNameStorage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `readOrderName(tableId: string): string | null` and `saveOrderName(tableId: string, name: string): void` — used by Tasks 6 (Cart) and 7 (header).

- [ ] **Step 1: Write the failing tests**

Create `app/order/orderNameStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readOrderName, saveOrderName } from './orderNameStorage'

describe('orderNameStorage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips a saved name for a table', () => {
    saveOrderName('t1', 'Edward')
    expect(readOrderName('t1')).toBe('Edward')
  })

  it('returns null when no name is saved', () => {
    expect(readOrderName('t1')).toBeNull()
  })

  it('keeps names isolated per table', () => {
    saveOrderName('t1', 'Edward')
    expect(readOrderName('t2')).toBeNull()
  })

  it('returns null instead of throwing when storage is inaccessible', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readOrderName('t1')).toBeNull()
  })

  it('does not throw when saving to inaccessible storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => saveOrderName('t1', 'Edward')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/orderNameStorage.test.ts`
Expected: FAIL — module `./orderNameStorage` not found.

- [ ] **Step 3: Write the implementation**

Create `app/order/orderNameStorage.ts`:

```ts
const KEY_PREFIX = 'orderName:'

export function readOrderName(tableId: string): string | null {
  try {
    return sessionStorage.getItem(KEY_PREFIX + tableId)
  } catch {
    return null
  }
}

export function saveOrderName(tableId: string, name: string): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + tableId, name)
  } catch {
    // Inaccessible storage — skip persistence, matching the cart's behavior.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/orderNameStorage.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add app/order/orderNameStorage.ts app/order/orderNameStorage.test.ts
git commit -m "feat: add per-table sessionStorage helper for order name"
```

---

### Task 3: Service layer — createOrder accepts customerName

**Files:**
- Modify: `lib/orderService.ts:11-48` (`createOrder`)
- Test: `lib/orderService.test.ts` (the `orderService.createOrder` describe block)

**Interfaces:**
- Consumes: `Order.customerName` column from Task 1.
- Produces: `createOrder(tableId: string, items: CartItemInput[], customerName?: string): Promise<OrderWithItems>` — Task 4's route calls this with a third argument.

- [ ] **Step 1: Write the failing tests**

In `lib/orderService.test.ts`, inside the existing `describe('orderService.createOrder', ...)` block, add:

```ts
  it('persists a trimmed customerName', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.order.create).mockResolvedValue({} as never)

    await createOrder('t1', [{ menuItemId: 'm1', quantity: 1 }], '  Edward  ')

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerName: 'Edward' }),
      }),
    )
  })

  it('coerces an empty or whitespace-only customerName to null', async () => {
    vi.mocked(findMenuItemsByIds).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: new Prisma.Decimal('12.50'), available: true, archived: false, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.order.create).mockResolvedValue({} as never)

    await createOrder('t1', [{ menuItemId: 'm1', quantity: 1 }], '   ')

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerName: null }),
      }),
    )
  })
```

Also update the existing test `creates an order with snapshotted name/price for each item`: its `toHaveBeenCalledWith` data object must gain `customerName: null` (omitted name → null), i.e.:

```ts
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: {
        tableId: 't1',
        customerName: null,
        items: {
          create: [
            { menuItemId: 'm1', quantity: 2, nameSnapshot: 'Burger', priceSnapshot: new Prisma.Decimal('12.50') },
          ],
        },
      },
      include: { items: true },
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/orderService.test.ts`
Expected: FAIL — the two new tests and the updated existing test fail (no `customerName` in create data).

- [ ] **Step 3: Implement**

In `lib/orderService.ts`, change `createOrder`:

```ts
export async function createOrder(
  tableId: string,
  items: CartItemInput[],
  customerName?: string,
): Promise<OrderWithItems> {
  if (items.length === 0) {
    throw new ValidationError('Cart must contain at least one item')
  }

  await getTableOrThrow(tableId)

  const menuItems = await findMenuItemsByIds(items.map((item) => item.menuItemId))
  const menuItemsById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]))

  for (const item of items) {
    const menuItem = menuItemsById.get(item.menuItemId)
    if (!menuItem) {
      throw new NotFoundError(`Menu item ${item.menuItemId} not found`)
    }
    if (!menuItem.available) {
      throw new ConflictError(`${menuItem.name} is no longer available`)
    }
  }

  return prisma.order.create({
    data: {
      tableId,
      customerName: customerName?.trim() || null,
      items: {
        create: items.map((item) => {
          const menuItem = menuItemsById.get(item.menuItemId)!
          return {
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            nameSnapshot: menuItem.name,
            priceSnapshot: menuItem.price,
          }
        }),
      },
    },
    include: { items: true },
  })
}
```

If TypeScript reports `customerName` doesn't exist on the create input, run `npx prisma generate` (known gotcha).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/orderService.test.ts`
Expected: PASS (all, including the updated existing test).

- [ ] **Step 5: Commit**

```bash
git add lib/orderService.ts lib/orderService.test.ts
git commit -m "feat: createOrder accepts optional customerName, trims and null-coerces it"
```

---

### Task 4: API — POST /api/orders validates and forwards customerName

**Files:**
- Modify: `app/api/orders/route.ts:36-60` (POST handler)
- Test: `app/api/orders/route.test.ts` (the `POST /api/orders` describe block)

**Interfaces:**
- Consumes: `createOrder(tableId, items, customerName?)` from Task 3.
- Produces: `POST /api/orders` accepting optional body field `customerName: string` (≤50 chars post-trim). GET responses now include `customerName: string | null` automatically (Prisma returns the column) — Tasks 8–9 rely on that.

- [ ] **Step 1: Write the failing tests**

In `app/api/orders/route.test.ts`, inside `describe('POST /api/orders', ...)`, add:

```ts
  it('forwards a trimmed customerName to the service', async () => {
    vi.mocked(createOrder).mockResolvedValue({ id: 'o1' } as never)

    const res = await POST(
      makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }], customerName: '  Edward  ' }),
    )

    expect(res.status).toBe(201)
    expect(createOrder).toHaveBeenCalledWith('t1', [{ menuItemId: 'm1', quantity: 1 }], 'Edward')
  })

  it('returns 400 when customerName exceeds 50 characters after trimming', async () => {
    const res = await POST(
      makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }], customerName: 'x'.repeat(51) }),
    )

    expect(res.status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('returns 400 when customerName is not a string', async () => {
    const res = await POST(
      makeRequest({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }], customerName: 42 }),
    )

    expect(res.status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
  })
```

Also update the existing test `returns 201 with the created order on success`: its assertion becomes

```ts
    expect(createOrder).toHaveBeenCalledWith('t1', [{ menuItemId: 'm1', quantity: 2 }], undefined)
```

(the handler now always passes a third argument; when the body has no name it is `undefined`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/api/orders/route.test.ts`
Expected: FAIL — new tests fail (name not forwarded, no length validation), existing 201 test fails on arity.

- [ ] **Step 3: Implement**

In `app/api/orders/route.ts`, in the POST handler, after the items validation loop and before the `createOrder` call, add:

```ts
    let customerName: string | undefined
    if (body.customerName !== undefined && body.customerName !== null) {
      if (typeof body.customerName !== 'string') {
        throw new ValidationError('customerName must be a string')
      }
      customerName = body.customerName.trim()
      if (customerName.length > 50) {
        throw new ValidationError('customerName must be 50 characters or fewer')
      }
    }

    const order = await createOrder(body.tableId, body.items, customerName)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/api/orders/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "feat: POST /api/orders accepts optional customerName (max 50 chars)"
```

---

### Task 5: Review modal — name input with nudge

**Files:**
- Modify: `app/order/OrderReviewModal.tsx`
- Modify: `app/globals.css` (after the `.review-modal__total` block, ~line 626)
- Test: `app/order/OrderReviewModal.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OrderReviewModal` gains two required props: `customerName: string` and `onCustomerNameChange: (value: string) => void`. Task 6's Cart supplies them. Input is labelled exactly `Name for this order` (Task 6's tests query by that label).

- [ ] **Step 1: Write the failing tests**

In `app/order/OrderReviewModal.test.tsx`, first add the two new props to **all eight existing `render(<OrderReviewModal ... />)` calls** (mechanical — same two lines each):

```tsx
        customerName=""
        onCustomerNameChange={vi.fn()}
```

Then add these tests to the describe block:

```tsx
  it('renders the name input with its current value and the nudge text', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName="Edward"
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Name for this order')).toHaveValue('Edward')
    expect(screen.getByText('Add a name so we can find you')).toBeInTheDocument()
  })

  it('reports name edits through onCustomerNameChange', async () => {
    const onCustomerNameChange = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName=""
        onCustomerNameChange={onCustomerNameChange}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Name for this order'), 'E')
    expect(onCustomerNameChange).toHaveBeenCalledWith('E')
  })

  it('disables the name input while submitting', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={true}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Name for this order')).toBeDisabled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/OrderReviewModal.test.tsx`
Expected: FAIL — TypeScript/props errors and missing input.

- [ ] **Step 3: Implement**

In `app/order/OrderReviewModal.tsx`, extend the props type and destructuring:

```tsx
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
```

Insert this block between the `review-modal__total` div and the error paragraph:

```tsx
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
```

In `app/globals.css`, after the `.review-modal__total` rule (~line 626), add:

```css
.review-modal__name {
  margin-bottom: 1rem;
}

.review-modal__name-label {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.35rem;
}

.review-modal__name-input {
  width: 100%;
  min-height: 44px;
  padding: 0 0.75rem;
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.95rem;
  color: var(--espresso);
  background: none;
}

.review-modal__name-input:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.review-modal__name-hint {
  font-size: 0.8rem;
  color: var(--clay);
  margin-top: 0.35rem;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/OrderReviewModal.test.tsx`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add app/order/OrderReviewModal.tsx app/order/OrderReviewModal.test.tsx app/globals.css
git commit -m "feat: name input with nudge in the order review modal"
```

---

### Task 6: Cart — name state, prefill, payload, persistence

**Files:**
- Modify: `app/order/Cart.tsx`
- Test: `app/order/Cart.test.tsx`

**Interfaces:**
- Consumes: `readOrderName`/`saveOrderName` (Task 2), modal props (Task 5), API field (Task 4).
- Produces: submitted orders carry `customerName`; `orderName:${tableId}` is populated after a successful named submission (Task 7's header reads it).

- [ ] **Step 1: Write the failing tests**

In `app/order/Cart.test.tsx`, add (follow the file's existing pattern: `items` fixtures, `userEvent.setup()`, clicking a menu item button then `Submit order` to open the modal). Use the file's existing menu-item fixture names for the button queries.

```tsx
  it('prefills the name field from a previously saved order name', async () => {
    sessionStorage.setItem('orderName:t1', 'Edward')
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    expect(screen.getByLabelText('Name for this order')).toHaveValue('Edward')
  })

  it('includes the trimmed name in the payload and saves it for next time', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.type(screen.getByLabelText('Name for this order'), '  Edward ')
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
      customerName: 'Edward',
    })
    expect(sessionStorage.getItem('orderName:t1')).toBe('Edward')
  })

  it('omits customerName from the payload when the field is left blank', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
    })
    expect(sessionStorage.getItem('orderName:t1')).toBeNull()
  })
```

Adjust the `items` fixture reference and menu-item id (`m1`) to match the file's existing fixtures if they differ — keep the assertions identical.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — no name input reachable from Cart (missing props), no prefill, no payload field.

- [ ] **Step 3: Implement**

In `app/order/Cart.tsx`:

1. Import the helper:

```ts
import { readOrderName, saveOrderName } from './orderNameStorage'
```

2. Add state next to the other `useState` calls:

```ts
const [customerName, setCustomerName] = useState('')
```

3. In the existing mount effect (the one that loads the saved cart), after the cart-restore `try/catch`, add:

```ts
    const savedName = readOrderName(tableId)
    if (savedName) setCustomerName(savedName)
```

4. Update `handleSubmit`:

```ts
  async function handleSubmit() {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    const trimmedName = customerName.trim()
    try {
      const order = await apiClient.post<{ id: string }>('/api/orders', {
        tableId,
        items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
        ...(trimmedName ? { customerName: trimmedName } : {}),
      })
      sessionStorage.removeItem(cartStorageKey(tableId))
      if (trimmedName) saveOrderName(tableId, trimmedName)
      router.push(`/order/${order.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }
```

5. Pass the new props to the modal:

```tsx
        <OrderReviewModal
          lines={lines}
          total={cartTotal}
          error={error}
          submitting={submitting}
          exiting={!reviewOpen}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          onConfirm={handleSubmit}
          onClose={() => {
            if (!submitting) {
              closeReview()
              setError(null)
            }
          }}
        />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx
git commit -m "feat: cart submits customerName and remembers it per table"
```

---

### Task 7: Menu header shows the remembered name (display-only)

**Files:**
- Create: `app/order/OrderHeaderTitle.tsx`
- Modify: `app/order/page.tsx:29-32` (header block)
- Modify: `app/globals.css` (after `.order-header__title`, ~line 100)
- Test: `app/order/OrderHeaderTitle.test.tsx`

**Interfaces:**
- Consumes: `readOrderName` (Task 2).
- Produces: `OrderHeaderTitle({ tableId: string; tableNumber: number })` client component.

- [ ] **Step 1: Write the failing tests**

Create `app/order/OrderHeaderTitle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrderHeaderTitle } from './OrderHeaderTitle'

describe('OrderHeaderTitle', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('renders only the table number when no name is stored', () => {
    render(<OrderHeaderTitle tableId="t1" tableNumber={5} />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Table 5')
    expect(heading.textContent).not.toContain('·')
  })

  it('appends the stored name for this table', () => {
    sessionStorage.setItem('orderName:t1', 'Edward')
    render(<OrderHeaderTitle tableId="t1" tableNumber={5} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Table 5 · Edward')
  })

  it('ignores names stored for other tables', () => {
    sessionStorage.setItem('orderName:t2', 'Edward')
    render(<OrderHeaderTitle tableId="t1" tableNumber={5} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain('Edward')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/OrderHeaderTitle.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/order/OrderHeaderTitle.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { readOrderName } from './orderNameStorage'

export function OrderHeaderTitle({ tableId, tableNumber }: { tableId: string; tableNumber: number }) {
  // Read in an effect, not during render: sessionStorage does not exist on the server,
  // and the server-rendered HTML must match the first client render.
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    setName(readOrderName(tableId))
  }, [tableId])

  return (
    <h1 className="order-header__title">
      Table {tableNumber}
      {name && <span className="order-header__name"> · {name}</span>}
    </h1>
  )
}
```

In `app/order/page.tsx`, import it and replace the `<h1>`:

```tsx
import { OrderHeaderTitle } from './OrderHeaderTitle'
```

```tsx
        <header className="order-header">
          <span className="order-header__eyebrow">Now serving</span>
          <OrderHeaderTitle tableId={table.id} tableNumber={table.number} />
        </header>
```

In `app/globals.css`, after the `.order-header__title` rule (~line 100), add:

```css
.order-header__name {
  font-style: normal;
  font-size: 1.4rem;
  color: var(--copper-bright);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/OrderHeaderTitle.test.tsx app/order/page.test.tsx`
Expected: PASS — new tests pass and the existing page tests are unaffected (they don't assert header text).

- [ ] **Step 5: Commit**

```bash
git add app/order/OrderHeaderTitle.tsx app/order/OrderHeaderTitle.test.tsx app/order/page.tsx app/globals.css
git commit -m "feat: menu header displays the remembered order name"
```

---

### Task 8: Order ticket shows the customer name

**Files:**
- Modify: `app/order/[id]/OrderTicket.tsx` (props type + render)
- Modify: `app/order/[id]/page.tsx` (ticket mapping + Confirmed branch)
- Modify: `app/globals.css` (after `.ticket__number`, ~line 715)
- Test: `app/order/[id]/OrderTicket.test.tsx`, `app/order/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `customerName: string | null` on `getOrderById` results (present since Task 1 — Prisma returns the column).
- Produces: `OrderTicketProps` gains `customerName: string | null`.

- [ ] **Step 1: Write the failing tests**

In `app/order/[id]/OrderTicket.test.tsx`, existing order fixtures gain `customerName: null` (required prop). Add two tests, following the file's existing render pattern:

```tsx
  it('shows the customer name when the order has one', () => {
    render(
      <OrderTicket
        order={{
          id: 'o1',
          orderNumber: 7,
          customerName: 'Edward',
          items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
        }}
      />,
    )

    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })

  it('renders no name line when the order has none', () => {
    render(
      <OrderTicket
        order={{
          id: 'o1',
          orderNumber: 7,
          customerName: null,
          items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
        }}
      />,
    )

    expect(screen.queryByText(/^For /)).not.toBeInTheDocument()
  })
```

In `app/order/[id]/page.test.tsx`, add to the Confirmed-branch coverage (matching the file's existing `getOrderById` mock pattern — include `customerName: 'Edward'` on the mocked order):

```tsx
  it('shows the customer name on a confirmed order', async () => {
    vi.mocked(getOrderById).mockResolvedValue({
      id: 'o1',
      orderNumber: 7,
      fulfillmentStatus: 'Confirmed',
      customerName: 'Edward',
      items: [
        { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: { toString: () => '12.50' }, quantity: 1 },
      ],
    } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- OrderTicket.test.tsx`
(vitest CLI filters are regexes — a literal `[id]` path segment becomes a character class and matches nothing, so filter by file name instead. This also runs `app/order/[id]/page.test.tsx` via the next step's filter.)
Expected: FAIL — `For Edward` not rendered.

- [ ] **Step 3: Implement**

In `app/order/[id]/OrderTicket.tsx`, extend the props type:

```ts
export type OrderTicketProps = {
  id: string
  orderNumber: number
  customerName: string | null
  items: OrderTicketLine[]
}
```

and render the name directly under the `ticket__number` heading:

```tsx
        <h2 className="ticket__number">Order #{order.orderNumber} confirmed</h2>
        {order.customerName && <p className="ticket__customer">For {order.customerName}</p>}
```

In `app/order/[id]/page.tsx`:

1. Add to the ticket mapping:

```ts
  const ticket: OrderTicketProps = {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    items: order.items.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      priceSnapshot: item.priceSnapshot.toString(),
      quantity: item.quantity,
    })),
  }
```

2. In the Confirmed branch, add the same line under its `<h2>`:

```tsx
            <h2 className="ticket__number">Order #{ticket.orderNumber} confirmed</h2>
            {ticket.customerName && <p className="ticket__customer">For {ticket.customerName}</p>}
```

In `app/globals.css`, after the `.ticket__number` rule (~line 715), add:

```css
.ticket__customer {
  font-family: var(--font-mono), monospace;
  font-size: 0.85rem;
  color: var(--clay);
  margin-top: 0.25rem;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- OrderTicket.test.tsx page.test.tsx`
(the `page.test.tsx` filter matches every page test file in the repo — they should all still pass)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/order/[id]/OrderTicket.tsx" "app/order/[id]/OrderTicket.test.tsx" "app/order/[id]/page.tsx" "app/order/[id]/page.test.tsx" app/globals.css
git commit -m "feat: order ticket shows the customer name"
```

---

### Task 9: Staff dashboard shows the name + finish the story

**Files:**
- Modify: `app/dashboard/PendingOrdersDashboard.tsx` (type + card head)
- Modify: `app/globals.css` (after `.order-card__table`, ~line 985)
- Modify: `BUILD_STATUS.md` (story → Done)
- Test: `app/dashboard/PendingOrdersDashboard.test.tsx`

**Interfaces:**
- Consumes: `customerName: string | null` on `GET /api/orders?status=pending` responses (automatic since Task 1).
- Produces: nothing downstream — final task.

- [ ] **Step 1: Write the failing tests**

In `app/dashboard/PendingOrdersDashboard.test.tsx`, add (reuse the file's `orderA` fixture and fake-timer flush pattern):

```tsx
  it('shows the customer name on the order card when present', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ ...orderA, customerName: 'Edward' }])
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText(/· Edward/)).toBeInTheDocument()
  })

  it('shows no name segment when the order has none', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ ...orderA, customerName: null }])
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — name never rendered.

- [ ] **Step 3: Implement**

In `app/dashboard/PendingOrdersDashboard.tsx`:

1. Extend the type:

```ts
type PendingOrder = {
  id: string
  orderNumber: number
  createdAt: string
  paymentStatus: 'Unpaid' | 'Paid'
  customerName: string | null
  table: { number: number }
  items: PendingOrderItem[]
}
```

2. Update the card head:

```tsx
                <div className="order-card__head">
                  <span className="order-card__table">
                    Table {order.table.number}
                    {order.customerName && (
                      <span className="order-card__customer"> · {order.customerName}</span>
                    )}
                  </span>
                  <span className="order-card__number">#{order.orderNumber}</span>
                </div>
```

In `app/globals.css`, after the `.order-card__table` rule (~line 985), add:

```css
.order-card__customer {
  font-weight: 400;
  color: var(--clay);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full-suite verification**

Run: `npm test`
Expected: entire suite passes.

Run: `npx tsc --noEmit`
Expected: no errors (if `customerName` is reported missing on Prisma types, run `npx prisma generate` and retry — known gotcha).

- [ ] **Step 6: Mark the story Done and commit**

In `BUILD_STATUS.md`, change story 9's status from `Building` to `Done`.

```bash
git add app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/globals.css BUILD_STATUS.md
git commit -m "feat: staff dashboard shows customer name on pending order cards"
```
