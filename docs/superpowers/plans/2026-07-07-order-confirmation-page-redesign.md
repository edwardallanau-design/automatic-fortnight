# Order Confirmation Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/order/[id]` (the post-submit order-confirmation screen) so it visually matches `/order` (the menu page), fixes the broken column alignment of ticket line items, gives the Remove control real button/touch feedback, adds a "back to menu" link, and requires confirmation before Cancel/Remove actually delete anything.

**Architecture:** Client/presentation-only change. Extract the currently-triplicated ticket markup (`page.tsx`'s inline Cancelled/Confirmed branches + `OrderTicket.tsx`'s Pending branch) into one shared presentational `TicketCard` component with fixed-width line columns. Add a new reusable `ConfirmDialog` component (built on the exact modal chrome `OrderReviewModal` already established) and wire it into `OrderTicket.tsx` so Remove/Cancel open a dialog instead of firing the DELETE immediately. Add a shared header band (with a "Back to menu" link) to `page.tsx`, rendered once above all three states.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript. Styling is plain global CSS in `app/globals.css` with CSS custom-property tokens (no Tailwind, no CSS Modules, no UI framework). No animation library — motion is hand-rolled CSS `@keyframes`/`transition`, always paired with a `@media (prefers-reduced-motion: reduce)` override. Tests: Vitest 4 + `@testing-library/react` + `@testing-library/user-event`, co-located next to source as `*.test.tsx`.

## Global Constraints

- No changes to `lib/orderService.ts`, `app/api/orders/[id]/route.ts`, `app/api/orders/[id]/items/[itemId]/route.ts`, or any `fulfillmentStatus` invariant/state machine — this is UI-only.
- Components never call `fetch` directly — all HTTP goes through `lib/apiClient.ts`'s `apiClient.{get,post,patch,del}` (per `06b-engineering-decisions.md`).
- No new dependencies (no Tailwind, no icon library, no animation library, no shared `components/ui` folder) — follow the existing one-file-per-feature convention, colocating new components under `app/order/[id]/`.
- Every new CSS transition/animation must include a `@media (prefers-reduced-motion: reduce)` override that disables it, matching every existing animated element in `app/globals.css`.
- Every interactive control keeps a `min-height`/`min-width` of 44px (existing touch-target convention) and a `:focus-visible` outline using `var(--copper-bright)`.
- Tests are co-located (`Foo.tsx` next to `Foo.test.tsx`), Vitest + React Testing Library, following the existing mocking patterns for `next/navigation` and `@/lib/apiClient` already used in `OrderTicket.test.tsx`.
- Run `npm test` (full suite) and `npm run build` after every task — both must pass before moving to the next task.

---

### Task 1: Add the `--danger` design token

**Files:**
- Modify: `app/globals.css:1-26` (the `:root` block and its `prefers-color-scheme: dark` override)
- Modify: `app/globals.css` (the `.review-modal__error` rule, currently around line 668-672)

**Interfaces:**
- Produces: a new CSS custom property `--danger`, usable by any later rule as `var(--danger)`.

- [ ] **Step 1: Add the token to both the light and dark `:root` blocks**

Find this block (currently lines 1-26):

```css
:root {
  --background: #ffffff;
  --foreground: #171717;

  --espresso: #2b1b14;
  --crema: #f7eee1;
  --paper: #fffdf9;
  --copper: #b5642c;
  --copper-bright: #d97b3c;
  --sage: #6b7a5e;
  --clay: #8c5a48;
  --clay-faint: #8c5a4833;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;

    --crema: #1c1410;
    --paper: #241a14;
    --espresso: #f7eee1;
    --clay: #c9a894;
    --clay-faint: #c9a89433;
  }
}
```

Replace it with:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;

  --espresso: #2b1b14;
  --crema: #f7eee1;
  --paper: #fffdf9;
  --copper: #b5642c;
  --copper-bright: #d97b3c;
  --sage: #6b7a5e;
  --clay: #8c5a48;
  --clay-faint: #8c5a4833;
  --danger: #b91c1c;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;

    --crema: #1c1410;
    --paper: #241a14;
    --espresso: #f7eee1;
    --clay: #c9a894;
    --clay-faint: #c9a89433;
    --danger: #e57373;
  }
}
```

- [ ] **Step 2: Repoint the one existing hardcoded red onto the new token**

Find (in the "Order review modal" section):

```css
.review-modal__error {
  color: #b91c1c;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}
```

Replace with:

```css
.review-modal__error {
  color: var(--danger);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}
```

- [ ] **Step 3: Verify nothing broke**

Run: `npm test`
Expected: all existing tests still pass (this is a pure CSS value swap, no markup or logic changed).

Run: `npm run build`
Expected: build succeeds (confirms the CSS is syntactically valid).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style: add --danger design token, repoint review-modal error color"
```

---

### Task 2: Extract `TicketCard` — shared, column-aligned ticket display

**Files:**
- Create: `app/order/[id]/TicketCard.tsx`
- Test: `app/order/[id]/TicketCard.test.tsx`
- Modify: `app/globals.css` (the `.ticket__line`/`.ticket__line-price` rules and the `.ticket__remove` rules, in the "Ticket-stub order confirmation" section, currently around lines 765-819)

**Interfaces:**
- Produces: `TicketCard` component and `TicketCardLine` type from `app/order/[id]/TicketCard.tsx`:
  ```ts
  export type TicketCardLine = {
    id: string
    nameSnapshot: string
    priceSnapshot: string
    quantity: number
    onRemove?: () => void
  }

  export function TicketCard(props: {
    heading: string
    customerName: string | null
    items: TicketCardLine[]
    statusNote: string
    busy?: boolean
    footer?: ReactNode
  }): JSX.Element
  ```
  `onRemove` on a line is what decides whether that row renders a Remove button — `undefined` means no button (used for read-only Confirmed views and for the sole remaining line of a Pending order). `footer` is an optional slot rendered between the total and the status note (used by `OrderTicket` to inject the inline error alert + "Cancel order" button — nothing else needs it, so it renders nothing by default).
- Consumes: nothing from other tasks — this is a plain, hook-free presentational component so it works unmodified from both a server component (`page.tsx`, Task 3) and a client component (`OrderTicket.tsx`, Task 5).

**Note:** after this task, `page.tsx`'s still-inline Confirmed branch and `OrderTicket.tsx`'s still-unmodified Pending view will render with the *old* JSX against the *new* CSS — lines will look visually off (no dedicated qty column, Remove still says the word "Remove" squeezed into the new icon-button sizing) until Tasks 3 and 5 land. This is expected; each task's own tests pass in isolation, and the visual result is only final after Task 5.

- [ ] **Step 1: Write the failing test**

Create `app/order/[id]/TicketCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TicketCard } from './TicketCard'

const items = [
  { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 },
  { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 2 },
]

describe('TicketCard', () => {
  it('renders the heading, each line, and the total', () => {
    render(<TicketCard heading="Order #47 confirmed" customerName={null} items={items} statusNote="Note text" />)

    expect(screen.getByText('Order #47 confirmed')).toBeInTheDocument()
    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('x1')).toBeInTheDocument()
    expect(screen.getByText('$12.50')).toBeInTheDocument()
    expect(screen.getByText('Fries')).toBeInTheDocument()
    expect(screen.getByText('x2')).toBeInTheDocument()
    expect(screen.getByText('$8.00')).toBeInTheDocument()
    expect(screen.getByText('$20.50')).toBeInTheDocument()
    expect(screen.getByText('Note text')).toBeInTheDocument()
  })

  it('shows the customer name when provided', () => {
    render(<TicketCard heading="Order #47" customerName="Edward" items={items} statusNote="Note" />)
    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })

  it('renders no name line when customerName is null', () => {
    render(<TicketCard heading="Order #47" customerName={null} items={items} statusNote="Note" />)
    expect(screen.queryByText(/^For /)).not.toBeInTheDocument()
  })

  it('does not render a remove button for lines with no onRemove', () => {
    render(<TicketCard heading="Order #47" customerName={null} items={items} statusNote="Note" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a remove button for lines with onRemove and calls it on click', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(
      <TicketCard
        heading="Order #47"
        customerName={null}
        items={[{ ...items[0], onRemove }]}
        statusNote="Note"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('disables remove buttons when busy', () => {
    render(
      <TicketCard
        heading="Order #47"
        customerName={null}
        items={[{ ...items[0], onRemove: vi.fn() }]}
        statusNote="Note"
        busy
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove Burger' })).toBeDisabled()
  })

  it('renders footer content between the total and the status note', () => {
    render(
      <TicketCard
        heading="Order #47"
        customerName={null}
        items={items}
        statusNote="Note text"
        footer={<button type="button">Cancel order</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/order/[id]/TicketCard.test.tsx"`
Expected: FAIL — `Cannot find module './TicketCard'`.

- [ ] **Step 3: Create the component**

Create `app/order/[id]/TicketCard.tsx`:

```tsx
import type { ReactNode } from 'react'

export type TicketCardLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
  onRemove?: () => void
}

export function TicketCard({
  heading,
  customerName,
  items,
  statusNote,
  busy = false,
  footer,
}: {
  heading: string
  customerName: string | null
  items: TicketCardLine[]
  statusNote: string
  busy?: boolean
  footer?: ReactNode
}) {
  const total = items.reduce((sum, item) => sum + Number(item.priceSnapshot) * item.quantity, 0)

  return (
    <section aria-label="Order confirmation" className="ticket">
      <div className="ticket__stub">
        <span className="ticket__label">Your ticket</span>
        <h2 className="ticket__number">{heading}</h2>
        {customerName && <p className="ticket__customer">For {customerName}</p>}
        <ul className="ticket__lines">
          {items.map((item) => (
            <li key={item.id} className="ticket__line">
              <span className="ticket__line-name">{item.nameSnapshot}</span>
              <span className="ticket__line-qty">x{item.quantity}</span>
              <span className="ticket__line-price">
                ${(Number(item.priceSnapshot) * item.quantity).toFixed(2)}
              </span>
              {item.onRemove && (
                <button
                  type="button"
                  className="ticket__remove"
                  aria-label={`Remove ${item.nameSnapshot}`}
                  disabled={busy}
                  onClick={item.onRemove}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="ticket__total">
          <span>Total</span>
          <span className="ticket__total-price">${total.toFixed(2)}</span>
        </div>
        {footer}
        <p className="ticket__note">{statusNote}</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/order/[id]/TicketCard.test.tsx"`
Expected: PASS (7 tests).

- [ ] **Step 5: Restyle the ticket lines into fixed columns and the Remove control into an icon button**

Find (currently around lines 774-783):

```css
.ticket__line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.ticket__line-price {
  font-family: var(--font-mono), monospace;
  white-space: nowrap;
}
```

Replace with:

```css
.ticket__line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ticket__line-name {
  flex: 1;
}

.ticket__line-qty {
  font-family: var(--font-mono), monospace;
  min-width: 3ch;
  text-align: center;
  color: var(--clay);
}

.ticket__line-price {
  font-family: var(--font-mono), monospace;
  min-width: 6ch;
  text-align: right;
  white-space: nowrap;
}
```

Find (currently around lines 803-819):

```css
.ticket__remove {
  margin-left: 0.75rem;
  border: none;
  background: none;
  color: #b91c1c;
  font-size: 0.85rem;
  text-decoration: underline;
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
  padding: 0.25rem 0.5rem;
}

.ticket__remove:disabled {
  opacity: 0.5;
  cursor: default;
}
```

Replace with:

```css
.ticket__remove {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  background: none;
  color: var(--danger);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.1s ease;
}

.ticket__remove:hover:not(:disabled) {
  border-color: var(--danger);
}

.ticket__remove:active:not(:disabled) {
  transform: scale(0.92);
}

.ticket__remove:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.ticket__remove:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .ticket__remove:active:not(:disabled) {
    transform: none;
  }
}
```

- [ ] **Step 6: Run the full suite and build**

Run: `npm test`
Expected: PASS. (`OrderTicket.test.tsx` and `page.test.tsx` still target the old JSX/CSS combination and are unaffected by a pure CSS change — they only assert roles/text/attributes, not computed styles.)

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/order/\[id\]/TicketCard.tsx app/order/\[id\]/TicketCard.test.tsx app/globals.css
git commit -m "feat: add shared TicketCard component with column-aligned lines"
```

---

### Task 3: Shared header + back-to-menu link, and Confirmed branch uses `TicketCard`

**Files:**
- Modify: `app/order/[id]/page.tsx`
- Modify: `app/order/[id]/page.test.tsx`
- Modify: `app/globals.css` (add `.order-header__row` / `.order-header__back`, near the existing `.order-header*` rules around lines 77-106)

**Interfaces:**
- Consumes: `TicketCard` from Task 2 (`app/order/[id]/TicketCard.tsx`).
- Produces: no new exports — this task only changes `page.tsx`'s rendering.

- [ ] **Step 1: Update the failing/changed tests first**

Replace the full contents of `app/order/[id]/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderDetailPage from './page'
import { getOrderById } from '@/lib/orderService'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  getOrderById: vi.fn(),
}))

// OrderTicket is a client component with next/navigation + apiClient deps;
// stub it so the page test stays focused on branching.
vi.mock('./OrderTicket', () => ({
  OrderTicket: ({ order }: { order: { orderNumber: number } }) => (
    <div data-testid="order-ticket">editable #{order.orderNumber}</div>
  ),
}))

function priceOf(value: string) {
  return { toString: () => value } as never
}

function order(fulfillmentStatus: string) {
  return {
    id: 'o1',
    orderNumber: 47,
    fulfillmentStatus,
    paymentStatus: 'Unpaid',
    items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: priceOf('12.50'), quantity: 1 }],
    table: { id: 't1', number: 4, createdAt: new Date() },
  }
}

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an error state when the order does not exist', async () => {
    vi.mocked(getOrderById).mockRejectedValue(new NotFoundError('Order not found'))

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'missing' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't find that order. Please ask staff for help.",
    )
  })

  it('does not show a header or back link when the order is not found', async () => {
    vi.mocked(getOrderById).mockRejectedValue(new NotFoundError('Order not found'))

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'missing' }) })
    render(ui)

    expect(screen.queryByRole('link', { name: '← Menu' })).not.toBeInTheDocument()
  })

  it('renders the editable ticket for a Pending order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Pending') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByTestId('order-ticket')).toHaveTextContent('editable #47')
  })

  it('shows the table header and a back-to-menu link for a Pending order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Pending') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Menu' })).toHaveAttribute('href', '/order?table=t1')
  })

  it('renders a locked note for a Confirmed order and no editable ticket', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Confirmed') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText(/Confirmed by staff/)).toBeInTheDocument()
    expect(screen.queryByTestId('order-ticket')).not.toBeInTheDocument()
  })

  it('renders a cancelled notice for a Cancelled order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Cancelled') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('This order was cancelled.')).toBeInTheDocument()
  })

  it('shows the table header and back-to-menu link for a Cancelled order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Cancelled') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByRole('link', { name: '← Menu' })).toHaveAttribute('href', '/order?table=t1')
  })

  it('shows the customer name on a confirmed order', async () => {
    vi.mocked(getOrderById).mockResolvedValue({
      id: 'o1',
      orderNumber: 7,
      fulfillmentStatus: 'Confirmed',
      customerName: 'Edward',
      items: [
        { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: { toString: () => '12.50' }, quantity: 1 },
      ],
      table: { id: 't1', number: 4, createdAt: new Date() },
    } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run "app/order/[id]/page.test.tsx"`
Expected: FAIL — the two new "header"/"back link" tests and "renders a locked note for a Confirmed order" fail (no header exists yet; `TicketCard` isn't wired in yet so the Confirmed branch's exact text may still pass by coincidence but the header assertions will not).

- [ ] **Step 3: Update `page.tsx`**

Replace the full contents of `app/order/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { getOrderById } from '@/lib/orderService'
import { NotFoundError } from '@/lib/errors'
import { OrderTicket, type OrderTicketProps } from './OrderTicket'
import { TicketCard } from './TicketCard'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let order
  try {
    order = await getOrderById(id)
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="order-page">
          <p role="alert" className="order-page__error">
            We couldn&apos;t find that order. Please ask staff for help.
          </p>
        </main>
      )
    }
    throw error
  }

  const header = (
    <header className="order-header">
      <div className="order-header__row">
        <span className="order-header__eyebrow">Your order</span>
        <Link href={`/order?table=${order.table.id}`} className="order-header__back">
          ← Menu
        </Link>
      </div>
      <h1 className="order-header__title">Table {order.table.number}</h1>
    </header>
  )

  if (order.fulfillmentStatus === 'Cancelled') {
    return (
      <main className="order-page">
        {header}
        <section aria-label="Order cancelled" className="ticket">
          <div className="ticket__stub">
            <h2 className="ticket__number">Order #{order.orderNumber}</h2>
            <p className="ticket__note">This order was cancelled.</p>
          </div>
        </section>
      </main>
    )
  }

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

  if (order.fulfillmentStatus === 'Confirmed') {
    return (
      <main className="order-page">
        {header}
        <TicketCard
          heading={`Order #${ticket.orderNumber} confirmed`}
          customerName={ticket.customerName}
          items={ticket.items}
          statusNote="Confirmed by staff — ask staff to change anything."
        />
      </main>
    )
  }

  return (
    <main className="order-page">
      {header}
      <OrderTicket order={ticket} />
    </main>
  )
}
```

- [ ] **Step 4: Add the header row/back-link CSS**

Find (currently lines 84-92):

```css
.order-header__eyebrow {
  display: block;
  font-family: var(--font-mono), monospace;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--copper-bright);
  margin-bottom: 0.35rem;
}
```

Replace with:

```css
.order-header__eyebrow {
  display: block;
  font-family: var(--font-mono), monospace;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--copper-bright);
  margin-bottom: 0.35rem;
}

.order-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.order-header__row .order-header__eyebrow {
  margin-bottom: 0;
}

.order-header__back {
  font-family: var(--font-mono), monospace;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--copper-bright);
  text-decoration: none;
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0 0.25rem;
}

.order-header__back:hover {
  text-decoration: underline;
}

.order-header__back:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "app/order/[id]/page.test.tsx"`
Expected: PASS (8 tests).

Run: `npm test`
Expected: PASS (full suite — `OrderTicket.test.tsx` is untouched by this task and keeps passing against the old `OrderTicket.tsx` internals).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/order/\[id\]/page.tsx app/order/\[id\]/page.test.tsx app/globals.css
git commit -m "feat: add order-confirmation header with back-to-menu link, use TicketCard for Confirmed state"
```

---

### Task 4: `ConfirmDialog` — reusable destructive-action confirmation

**Files:**
- Create: `app/order/[id]/ConfirmDialog.tsx`
- Test: `app/order/[id]/ConfirmDialog.test.tsx`
- Modify: `app/globals.css` (new `.confirm-dialog*` block, added after the existing "Order review modal" section, i.e. after the closing of `.review-modal__confirm:focus-visible` and before `/* Ticket-stub order confirmation */`)

**Interfaces:**
- Produces: `ConfirmDialog` component from `app/order/[id]/ConfirmDialog.tsx`:
  ```ts
  export function ConfirmDialog(props: {
    title: string
    message: string
    confirmLabel: string
    busy: boolean
    exiting: boolean
    onConfirm: () => void
    onClose: () => void
  }): JSX.Element
  ```
- Consumes: nothing from other tasks. Modeled on `app/order/OrderReviewModal.tsx`'s chrome (backdrop, `role="dialog"`, `aria-modal`, Escape-to-close, backdrop-click-to-close, `exiting`-flag-driven CSS class) but is a new, independent file.

- [ ] **Step 1: Write the failing test**

Create `app/order/[id]/ConfirmDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders the title, message, and confirm label', () => {
    render(
      <ConfirmDialog
        title="Cancel this order?"
        message="Staff won't receive it."
        confirmLabel="Yes, cancel"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()
    expect(screen.getByText("Staff won't receive it.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes, cancel' })).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when "Never mind" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click but not on a click inside the dialog', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('confirm-dialog-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons when busy', () => {
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={true}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Never mind' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('adds an exiting class to the dialog when exiting is true', () => {
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveClass('confirm-dialog--exiting')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/order/[id]/ConfirmDialog.test.tsx"`
Expected: FAIL — `Cannot find module './ConfirmDialog'`.

- [ ] **Step 3: Create the component**

Create `app/order/[id]/ConfirmDialog.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

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
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className={`confirm-dialog__backdrop${exiting ? ' confirm-dialog__backdrop--exiting' : ''}`}
      data-testid="confirm-dialog-backdrop"
      onClick={onClose}
    >
      <div
        className={`confirm-dialog${exiting ? ' confirm-dialog--exiting' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
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
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/order/[id]/ConfirmDialog.test.tsx"`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the `.confirm-dialog*` CSS block**

Find the end of the "Order review modal" section (currently ending around line 712, right before `/* Ticket-stub order confirmation */`):

```css
.review-modal__back:focus-visible,
.review-modal__confirm:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

/* Ticket-stub order confirmation */
```

Replace with:

```css
.review-modal__back:focus-visible,
.review-modal__confirm:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

/* Confirm dialog (destructive actions: cancel order, remove item) */

.confirm-dialog__backdrop {
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

.confirm-dialog__backdrop--exiting {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.confirm-dialog {
  width: 100%;
  max-width: 360px;
  background: var(--paper);
  color: var(--espresso);
  border-radius: 16px;
  padding: 1.5rem 1.25rem;
  box-shadow: 0 8px 24px var(--clay-faint);
  animation: confirm-dialog-enter 0.2s ease-out;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.confirm-dialog--exiting {
  opacity: 0;
  transform: scale(0.96);
}

@keyframes confirm-dialog-backdrop-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes confirm-dialog-enter {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .confirm-dialog__backdrop,
  .confirm-dialog {
    animation: none;
    transition: none;
  }
}

.confirm-dialog__title {
  font-family: var(--font-display), Georgia, serif;
  font-style: italic;
  font-weight: 600;
  font-size: 1.3rem;
  margin-bottom: 0.6rem;
}

.confirm-dialog__message {
  font-size: 0.95rem;
  color: var(--clay);
  margin-bottom: 1.25rem;
}

.confirm-dialog__actions {
  display: flex;
  gap: 0.75rem;
}

.confirm-dialog__cancel,
.confirm-dialog__confirm {
  flex: 1;
  min-height: 48px;
  border-radius: 10px;
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.confirm-dialog__cancel {
  border: 1px solid var(--clay-faint);
  background: none;
  color: var(--espresso);
}

.confirm-dialog__confirm {
  border: none;
  background: var(--danger);
  color: var(--paper);
}

.confirm-dialog__cancel:disabled,
.confirm-dialog__confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirm-dialog__cancel:active:not(:disabled),
.confirm-dialog__confirm:active:not(:disabled) {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .confirm-dialog__cancel:active:not(:disabled),
  .confirm-dialog__confirm:active:not(:disabled) {
    transform: none;
  }
}

.confirm-dialog__cancel:focus-visible,
.confirm-dialog__confirm:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

/* Ticket-stub order confirmation */
```

- [ ] **Step 6: Run the full suite and build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/order/\[id\]/ConfirmDialog.tsx app/order/\[id\]/ConfirmDialog.test.tsx app/globals.css
git commit -m "feat: add reusable ConfirmDialog component for destructive actions"
```

---

### Task 5: Wire `ConfirmDialog` into `OrderTicket` — Remove/Cancel require confirmation

**Files:**
- Modify: `app/order/[id]/OrderTicket.tsx`
- Modify: `app/order/[id]/OrderTicket.test.tsx`
- Modify: `app/globals.css` (`.ticket__cancel` — repoint to `--danger`, add `:active` feedback)

**Interfaces:**
- Consumes: `TicketCard`/`TicketCardLine` (Task 2) and `ConfirmDialog` (Task 4).
- Produces: no new exports — `OrderTicketProps`/`OrderTicketLine` (already exported) are unchanged.

- [ ] **Step 1: Update the test file first**

Replace the full contents of `app/order/[id]/OrderTicket.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderTicket } from './OrderTicket'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}))

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient')
  return { ...actual, apiClient: { del: vi.fn() } }
})

function twoLineOrder() {
  return {
    id: 'o1',
    orderNumber: 47,
    customerName: null,
    items: [
      { id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 },
      { id: 'oi2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 2 },
    ],
  }
}

describe('OrderTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens a confirm dialog on Remove and does not call the API until confirmed', async () => {
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))

    expect(screen.getByRole('dialog', { name: 'Remove item?' })).toBeInTheDocument()
    expect(apiClient.del).not.toHaveBeenCalled()
  })

  it('removes a line via the item DELETE route and refreshes once the dialog is confirmed', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1/items/oi1')
    expect(refresh).toHaveBeenCalled()
  })

  it('closes the remove dialog without calling the API when "Never mind" is clicked', async () => {
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))
    await user.click(screen.getByRole('button', { name: 'Never mind' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiClient.del).not.toHaveBeenCalled()
  })

  it('opens a confirm dialog on Cancel order and does not call the API until confirmed', async () => {
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))

    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()
    expect(apiClient.del).not.toHaveBeenCalled()
  })

  it('cancels the order via the order DELETE route and refreshes once the dialog is confirmed', async () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/orders/o1')
    expect(refresh).toHaveBeenCalled()
  })

  it('hides the Remove button when only one line remains', () => {
    render(
      <OrderTicket
        order={{ id: 'o1', orderNumber: 47, customerName: null, items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }] }}
      />,
    )

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('shows an inline alert when a mutation is rejected (e.g. staff just confirmed)', async () => {
    vi.mocked(apiClient.del).mockRejectedValue(new ApiError('CONFLICT', 'Order is Confirmed, not Pending'))
    const user = userEvent.setup()
    render(<OrderTicket order={twoLineOrder()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This order was just confirmed by staff and can no longer be changed.',
    )
    expect(refresh).toHaveBeenCalled()
  })

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
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/order/[id]/OrderTicket.test.tsx"`
Expected: FAIL — the current `OrderTicket.tsx` calls `apiClient.del` immediately on click, so the "does not call the API until confirmed" and dialog-role assertions fail.

- [ ] **Step 3: Rewrite `OrderTicket.tsx`**

Replace the full contents of `app/order/[id]/OrderTicket.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { TicketCard } from './TicketCard'
import { ConfirmDialog } from './ConfirmDialog'

export type OrderTicketLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export type OrderTicketProps = {
  id: string
  orderNumber: number
  customerName: string | null
  items: OrderTicketLine[]
}

const CONFLICT_MESSAGE = 'This order was just confirmed by staff and can no longer be changed.'
const CONFIRM_EXIT_MS = 200

type ConfirmAction = { type: 'remove'; itemId: string; name: string } | { type: 'cancel' }

export function OrderTicket({ order }: { order: OrderTicketProps }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const singleLine = order.items.length === 1

  async function mutate(path: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.del(path)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? CONFLICT_MESSAGE : 'Something went wrong. Please try again.')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function openConfirm(action: ConfirmAction) {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmAction(action)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => {
      setConfirmClosing(false)
      setConfirmAction(null)
    }, CONFIRM_EXIT_MS)
  }

  function handleConfirm() {
    if (!confirmAction) return
    const path =
      confirmAction.type === 'cancel'
        ? `/api/orders/${order.id}`
        : `/api/orders/${order.id}/items/${confirmAction.itemId}`
    closeConfirm()
    mutate(path)
  }

  return (
    <>
      <TicketCard
        heading={`Order #${order.orderNumber} confirmed`}
        customerName={order.customerName}
        busy={busy}
        items={order.items.map((item) => ({
          ...item,
          onRemove: singleLine
            ? undefined
            : () => openConfirm({ type: 'remove', itemId: item.id, name: item.nameSnapshot }),
        }))}
        statusNote="Remove items or cancel while your order is still pending."
        footer={
          <>
            {error && (
              <p role="alert" className="ticket__error">
                {error}
              </p>
            )}
            <button
              type="button"
              className="ticket__cancel"
              disabled={busy}
              onClick={() => openConfirm({ type: 'cancel' })}
            >
              Cancel order
            </button>
          </>
        }
      />
      {confirmAction && (confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title={confirmAction.type === 'cancel' ? 'Cancel this order?' : 'Remove item?'}
          message={
            confirmAction.type === 'cancel'
              ? "Staff won't receive it, and this can't be undone."
              : `Remove ${confirmAction.name} from your order?`
          }
          confirmLabel={confirmAction.type === 'cancel' ? 'Yes, cancel' : 'Remove'}
          busy={busy}
          exiting={!confirmOpen}
          onConfirm={handleConfirm}
          onClose={closeConfirm}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Repoint `.ticket__cancel` to the `--danger` token and add press feedback**

Find (currently around lines 821-840):

```css
.ticket__cancel {
  display: block;
  width: 100%;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #b91c1c;
  border-radius: 8px;
  background: none;
  color: #b91c1c;
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  min-height: 44px;
}

.ticket__cancel:disabled {
  opacity: 0.5;
  cursor: default;
}
```

Replace with:

```css
.ticket__cancel {
  display: block;
  width: 100%;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--danger);
  border-radius: 8px;
  background: none;
  color: var(--danger);
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  min-height: 44px;
  transition: transform 0.1s ease;
}

.ticket__cancel:disabled {
  opacity: 0.5;
  cursor: default;
}

.ticket__cancel:active:not(:disabled) {
  transform: scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .ticket__cancel:active:not(:disabled) {
    transform: none;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "app/order/[id]/OrderTicket.test.tsx"`
Expected: PASS (10 tests).

Run: `npm test`
Expected: PASS (full suite).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual browser verification**

This codebase has no automated visual-regression coverage — motion/press-feedback/`prefers-reduced-motion` behavior is verified manually, consistent with how `2026-07-07-cart-ux-polish-design.md`'s motion work was verified. Run `npm run dev`, walk through:
- Submit a test order, land on `/order/[id]` — confirm the header band (with "← Menu" link and "Table N" title) matches `/order`'s header visually, and ticket lines are column-aligned (name / qty / price / remove all lined up across rows of differing name length).
- Tap the Remove icon on a line — confirm dialog opens with fade+scale; tap "Never mind" — dialog closes, nothing removed. Tap Remove again, confirm "Remove" — item is removed, page refreshes.
- Tap "Cancel order" — confirm dialog opens with "Cancel this order?"; confirm "Yes, cancel" — order becomes Cancelled, locked view shown with header/back-link still present.
- Toggle OS-level "reduce motion" and confirm the dialog/backdrop and remove-button press feedback no longer animate.
- Tap "← Menu" from a Pending, Confirmed, and Cancelled order — confirm it lands back on `/order?table=<id>` for the correct table.

- [ ] **Step 7: Commit**

```bash
git add app/order/\[id\]/OrderTicket.tsx app/order/\[id\]/OrderTicket.test.tsx app/globals.css
git commit -m "feat: require confirmation before removing an item or cancelling an order"
```

---

## Self-Review Notes

**Spec coverage:**
- §1 (header + back link) → Task 3.
- §2 (column-aligned lines) → Task 2.
- §3 (Remove becomes a real icon button) → Task 2.
- §4 (confirmation dialogs) → Tasks 4 + 5.
- §5 (`--danger` token) → Task 1 (token + `.review-modal__error`), Task 2 (`.ticket__remove`), Task 5 (`.ticket__cancel`), Task 4 (`.confirm-dialog__confirm`).
- §6 (de-duplicate the three ticket states) → Task 2 (`TicketCard`) + Task 3 (page.tsx Confirmed branch) + Task 5 (OrderTicket uses `TicketCard`). Cancelled intentionally stays a small inline block (no line items shown today) rather than being forced through `TicketCard` — it never rendered an itemized list, so there's nothing to de-duplicate there beyond the shared header, which Task 3 already gives it.
- Testing section → covered per-task; manual browser check called out explicitly in Task 5 Step 6 for motion/`prefers-reduced-motion`, matching this repo's established practice for CSS-only concerns.

**Type consistency:** `TicketCardLine` (Task 2) is consumed identically by `page.tsx` (items without `onRemove`, Task 3) and `OrderTicket.tsx` (items with `onRemove` computed per-line, Task 5) — same shape both places. `ConfirmDialog`'s props (Task 4) match exactly how `OrderTicket.tsx` calls it (Task 5): `title`, `message`, `confirmLabel`, `busy`, `exiting`, `onConfirm`, `onClose`.

**No placeholders:** every step above contains complete, runnable code — no TBD/TODO markers.
