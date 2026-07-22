# Receipt Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Staff/Admin print a plain, printable slip ("Receipt") for a single order from the dashboard's `OrderDetailModal`, available only once `paymentStatus = Paid`.

**Architecture:** A new presentational `Receipt` component renders the printable markup from data `OrderDetailModal` already holds (no schema change, no new API route). A "Print receipt" button — disabled with a hint until Paid — calls the browser's native `window.print()`; a new `@media print` CSS block isolates `.receipt` from the rest of the page when printing. No persistence of the print action.

**Tech Stack:** Next.js App Router (client components), Vitest + Testing Library, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-22-receipt-printing-design.md`

## Global Constraints

- No Prisma/schema changes anywhere in this plan.
- No new API route — everything is client-side rendering + `window.print()`.
- The Paid-gate (`order.paymentStatus !== 'Paid'` → disabled) is the *only* enforcement; do not add a server-side check, since nothing is persisted or requested from the server.
- `Receipt` is presentational only — no `useState`, no data fetching, no callbacks back to a parent.
- Documentation updates (`docs/design/02-domain-model.md`'s new "Receipt" glossary entry, `docs/design/07-epic-map.md`'s amended backlog note, `BUILD_STATUS.md`'s new story row) were already made during the design/grilling session on 2026-07-22 — do not redo them; verify they're still present before merging.
- Branch: work happens on a feature branch off `dev` (e.g. `feature/receipt-printing`), created via the `using-git-worktrees` skill at execution time — do not commit directly to `dev`.

---

### Task 1: `Receipt` component + print CSS

**Files:**
- Create: `app/dashboard/Receipt.tsx`
- Create: `app/dashboard/Receipt.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `Receipt({ branchName, orderingPointLabel, orderNumber, customerName, items, paymentChoice, paymentMethodNameSnapshot, paymentReference })` — consumed by Task 2's `OrderDetailModal`.
- Consumes: nothing new (pure presentational component).

- [ ] **Step 1: Write the failing tests**

Create `app/dashboard/Receipt.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Receipt } from './Receipt'

const baseItems = [
  { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 },
  { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 },
]

describe('Receipt', () => {
  it('renders branch, ordering point, order number, and every item line with its price', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText(/Table 4/)).toBeInTheDocument()
    expect(screen.getByText(/#101/)).toBeInTheDocument()
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
    expect(screen.getByText('1x Fries')).toBeInTheDocument()
    expect(screen.getByText('$4.00')).toBeInTheDocument()
  })

  it('renders the total as the sum of all line prices', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByText('$29.00')).toBeInTheDocument()
  })

  it('omits the customer-name line when customerName is null', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.queryByTestId('receipt-customer-name')).not.toBeInTheDocument()
  })

  it('renders the customer name when set', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName="Edward"
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByTestId('receipt-customer-name')).toHaveTextContent('Edward')
  })

  it('renders a Counter payment line', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByText(/PAID/)).toBeInTheDocument()
    expect(screen.getByText(/Paid at the counter/)).toBeInTheDocument()
  })

  it('renders an Online payment line with method and reference', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Online"
        paymentMethodNameSnapshot="GCash"
        paymentReference="REF123"
      />,
    )

    expect(screen.getByText(/Paid online via GCash/)).toBeInTheDocument()
    expect(screen.getByText(/REF123/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/Receipt.test.tsx`
Expected: FAIL — `Cannot find module './Receipt'`.

- [ ] **Step 3: Write the implementation**

Create `app/dashboard/Receipt.tsx`:

```tsx
export type ReceiptItem = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export type ReceiptPaymentChoice = 'None' | 'Counter' | 'Online'

function lineTotal(item: ReceiptItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

function formatPaidLine(
  paymentChoice: ReceiptPaymentChoice,
  paymentMethodNameSnapshot: string | null,
  paymentReference: string | null,
): string {
  if (paymentChoice === 'Online') {
    return `PAID — Paid online via ${paymentMethodNameSnapshot}. Reference: ${paymentReference}.`
  }
  return 'PAID — Paid at the counter.'
}

export function Receipt({
  branchName,
  orderingPointLabel,
  orderNumber,
  customerName,
  items,
  paymentChoice,
  paymentMethodNameSnapshot,
  paymentReference,
}: {
  branchName: string
  orderingPointLabel: string
  orderNumber: number
  customerName: string | null
  items: ReceiptItem[]
  paymentChoice: ReceiptPaymentChoice
  paymentMethodNameSnapshot: string | null
  paymentReference: string | null
}) {
  const total = items.reduce((sum, item) => sum + lineTotal(item), 0)

  return (
    <section className="receipt" aria-label="Receipt">
      <p className="receipt__branch">{branchName}</p>
      <p className="receipt__heading">
        {orderingPointLabel} · #{orderNumber}
      </p>
      {customerName && (
        <p className="receipt__customer" data-testid="receipt-customer-name">
          {customerName}
        </p>
      )}
      <ul className="receipt__lines">
        {items.map((item) => (
          <li key={item.id} className="receipt__line">
            <span className="receipt__line-name">
              {item.quantity}x {item.nameSnapshot}
            </span>
            <span className="receipt__line-price">${lineTotal(item).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <div className="receipt__total">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>
      <p className="receipt__payment">{formatPaidLine(paymentChoice, paymentMethodNameSnapshot, paymentReference)}</p>
    </section>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/Receipt.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Add print CSS**

In `app/globals.css`, append this block at the end of the file:

```css
/* Receipt (print) */
.receipt {
  display: none;
}

@media print {
  body * {
    visibility: hidden;
  }

  .receipt,
  .receipt * {
    visibility: visible;
  }

  .receipt {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    max-width: 320px;
    margin: 0 auto;
    padding: 1rem;
    font-family: var(--font-mono), monospace;
    color: #000;
  }

  .receipt__branch {
    font-weight: 700;
    text-align: center;
    margin-bottom: 0.25rem;
  }

  .receipt__heading {
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .receipt__customer {
    text-align: center;
    margin-bottom: 0.75rem;
  }

  .receipt__lines {
    list-style: none;
    padding: 0;
    margin: 0 0 0.5rem;
  }

  .receipt__line {
    display: flex;
    justify-content: space-between;
    padding: 0.15rem 0;
  }

  .receipt__total {
    display: flex;
    justify-content: space-between;
    font-weight: 700;
    border-top: 1px dashed #000;
    padding-top: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .receipt__payment {
    text-align: center;
    font-size: 0.85rem;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/Receipt.tsx app/dashboard/Receipt.test.tsx app/globals.css
git commit -m "Add Receipt component and print stylesheet"
```

---

### Task 2: Wire "Print receipt" into `OrderDetailModal`

**Files:**
- Modify: `app/dashboard/OrderDetailModal.tsx`
- Modify: `app/dashboard/OrderDetailModal.test.tsx`

**Interfaces:**
- Consumes: `Receipt` (Task 1).
- Produces: no new props on `OrderDetailModal` — `window.print()` is called directly from the button, since there's no server round-trip or parent-owned state to coordinate (unlike every other action in this modal, which goes through an `on*` callback prop).

- [ ] **Step 1: Write the failing tests**

Add these tests to `app/dashboard/OrderDetailModal.test.tsx`, inside the existing `describe('OrderDetailModal', ...)` block:

```tsx
  it('disables Print receipt with a hint when the order is Unpaid', () => {
    render(<OrderDetailModal {...baseProps()} />)

    const printButton = screen.getByRole('button', { name: 'Print receipt' })
    expect(printButton).toBeDisabled()
    expect(printButton).toHaveAttribute('title', 'Available once paid')
  })

  it('enables Print receipt and calls window.print when the order is Paid', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, paymentStatus: 'Paid' } })} />)

    const printButton = screen.getByRole('button', { name: 'Print receipt' })
    expect(printButton).not.toBeDisabled()

    await user.click(printButton)
    expect(printSpy).toHaveBeenCalledTimes(1)

    printSpy.mockRestore()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx`
Expected: FAIL — no "Print receipt" button exists yet.

- [ ] **Step 3: Write the implementation**

In `app/dashboard/OrderDetailModal.tsx`, add the import:

```ts
import { Receipt } from './Receipt'
```

Render `<Receipt />` once, right after the closing `</Modal>` tag (so it sits in the DOM outside the modal's own backdrop/dialog wrapper — the print stylesheet hides everything under `body` except `.receipt` regardless of where it's nested, so placement only matters for readability, not correctness):

```tsx
      </Modal>

      <Receipt
        branchName={order.branch.name}
        orderingPointLabel={order.orderingPoint.label}
        orderNumber={order.orderNumber}
        customerName={order.customerName}
        items={order.items}
        paymentChoice={order.paymentChoice}
        paymentMethodNameSnapshot={order.paymentMethodNameSnapshot}
        paymentReference={order.paymentReference}
      />

      {cancelConfirmOpen && (
```

Add the button inside `.order-detail-modal__actions`, after the Mark Paid/Unpaid button:

```tsx
          <button
            type="button"
            className="order-detail-modal__print"
            disabled={order.paymentStatus !== 'Paid'}
            title={order.paymentStatus !== 'Paid' ? 'Available once paid' : undefined}
            onClick={() => window.print()}
          >
            Print receipt
          </button>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/dashboard/OrderDetailModal.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Add button CSS**

In `app/globals.css`, immediately after the existing `.order-detail-modal__pay--revert:hover:not(:disabled)` rule, add:

```css
.order-detail-modal__print {
  flex: 1;
  min-height: 48px;
  border-radius: 10px;
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  border: 1px solid var(--clay-faint);
  background: transparent;
  color: var(--espresso);
}

.order-detail-modal__print:hover:not(:disabled) {
  background: var(--clay-faint);
}

.order-detail-modal__print:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.order-detail-modal__print:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Run the full type check and test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, full suite green.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/OrderDetailModal.tsx app/dashboard/OrderDetailModal.test.tsx app/globals.css
git commit -m "Add Print receipt action to OrderDetailModal, gated on Paid"
```

---

### Task 3: Manual verification

Not a code task — no automated test can confirm real print output (jsdom doesn't render `@media print`).

- [ ] **Step 1: Verify via `docker compose up --build`**, per this repo's established local-verification convention (`BUILD_STATUS.md` gotchas log).
- [ ] **Step 2: As staff/admin, open a Paid order's detail modal, confirm "Print receipt" is enabled; open Unpaid order, confirm it's disabled with the "Available once paid" tooltip.**
- [ ] **Step 3: Click "Print receipt", open the browser's print preview, and confirm only the receipt content shows (no dashboard chrome, no modal backdrop) with branch name, table/order number, items, total, and the payment line all present and correctly formatted.**
- [ ] **Step 4: Record the result in `BUILD_STATUS.md`'s story row (update from Backlog → Done, or Blocked with a note) once verified.**
