# Cart Add-to-Cart Toast + Order Review Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toast-with-undo when a customer taps a menu item, and require a full-screen review-and-confirm step before an order is actually submitted to staff.

**Architecture:** Client-only changes inside `app/order/Cart.tsx` (add toast state + timer, and a `reviewOpen` flag) plus one new presentational component, `app/order/OrderReviewModal.tsx`, that renders the review overlay and is fully controlled by props (no internal fetch/business logic). No backend, API route, or `orderService` changes.

**Tech Stack:** Next.js (App Router) client components, React `useState`/`useEffect`/`useRef`, Vitest + Testing Library + `@testing-library/user-event`, existing `lib/apiClient.ts`.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-07-cart-add-and-order-confirm-ux-design.md` — every decision below traces back to a bullet in that file's "Decisions" section.
- Toast auto-dismiss timeout: exactly 4000ms.
- Toast copy: `Added {name} to cart` with an `Undo` action.
- Review modal confirm button label: exactly `Confirm Order` (not "Send to Kitchen" — no kitchen integration exists).
- Review modal content is read-only — no quantity steppers inside it.
- No backend/API changes. `POST /api/orders` request/response shape is unchanged.
- Follow existing styling tokens in `app/globals.css` (`--espresso`, `--crema`, `--paper`, `--copper`, `--copper-bright`, `--clay`, `--clay-faint`, `--sage`, `--font-display`, `--font-body`, `--font-mono`) — no new color values.
- Test stack/conventions: Vitest, Testing Library, `@testing-library/user-event`; mock `next/navigation`'s `useRouter` and `@/lib/apiClient` the same way `app/order/Cart.test.tsx` already does.

---

## File Structure

- **Modify:** `app/order/Cart.tsx` — add toast state/timer and `reviewOpen` state; Submit now opens the review modal instead of calling the API directly.
- **Modify:** `app/order/Cart.test.tsx` — add toast tests; update the three existing submit-flow tests (which currently click "Submit order" and expect an immediate API call) to go through the modal.
- **Create:** `app/order/OrderReviewModal.tsx` — controlled presentational component: itemized read-only list, total, error slot, "Back to menu" / "Confirm Order" buttons, Escape/backdrop dismiss. Kept separate from `Cart.tsx` (mirrors the existing `OrderTicket.tsx` / `page.tsx` split in `app/order/[id]/`) so `Cart.tsx` doesn't grow into a second responsibility.
- **Create:** `app/order/OrderReviewModal.test.tsx` — isolated unit tests for the modal's own rendering/interaction (open with props, button callbacks, Escape, backdrop-vs-content click, disabled-while-submitting). `Cart.test.tsx` then only needs to test the integration points (submit opens it, confirm calls the API, back/error behavior) since the modal's internal behavior is already covered here.
- **Modify:** `app/globals.css` — add `.cart-toast`/`.cart-toast__undo` rules and a `.review-modal*` rule set, following the existing token/section conventions in the file.
- **Modify:** `BUILD_STATUS.md` — append one gotchas-log line (per this project's CLAUDE.md) once Task 2 hits the `userEvent` + fake-timers interaction described there.

---

### Task 1: Toast on add-to-cart

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/globals.css`
- Test: `app/order/Cart.test.tsx`

**Interfaces:**
- Consumes: existing `addItem(item: MenuItemProps)` and `adjustQuantity(menuItemId: string, delta: number)` in `Cart.tsx` — unchanged signatures.
- Produces: a `toast: { menuItemId: string; name: string } | null` state value and a `showToast(menuItemId: string, name: string)` helper that later tasks (none — this is the last consumer) don't need, but Task 2 (Undo) reads `toast` and reuses `adjustQuantity`.

- [ ] **Step 1: Write the failing tests**

Add to `app/order/Cart.test.tsx`, inside the existing `describe('Cart', ...)` block, after the `'adds an item to the cart when its menu button is tapped'` test:

```tsx
  it('shows a toast confirming the item was added', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))

    expect(screen.getByRole('status')).toHaveTextContent('Added Burger to cart')
  })

  it('replaces the toast when a different item is added', async () => {
    const threeItems = [...items, { id: 'm3', name: 'Shake', price: '5.00', available: true }]
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={threeItems} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: /Shake/ }))

    const toasts = screen.getAllByRole('status')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toHaveTextContent('Added Shake to cart')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — no element with role `status` is rendered yet.

- [ ] **Step 3: Implement the toast**

In `app/order/Cart.tsx`, update the React import and add state/timer/helper. Replace:

```tsx
import { useState } from 'react'
```

with:

```tsx
import { useEffect, useRef, useState } from 'react'
```

Inside `export function Cart(...)`, after the existing `const [cartExpanded, setCartExpanded] = useState(false)` line, add:

```tsx
  const [toast, setToast] = useState<{ menuItemId: string; name: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  function showToast(menuItemId: string, name: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ menuItemId, name })
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }
```

Update `addItem` to call it — replace:

```tsx
  function addItem(item: MenuItemProps) {
    setLines((prev) => {
      const existing = prev.find((line) => line.menuItemId === item.id)
      if (existing) {
        return prev.map((line) =>
          line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }
```

with:

```tsx
  function addItem(item: MenuItemProps) {
    setLines((prev) => {
      const existing = prev.find((line) => line.menuItemId === item.id)
      if (existing) {
        return prev.map((line) =>
          line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
    showToast(item.id, item.name)
  }
```

Render the toast. Replace the start of the returned JSX:

```tsx
  return (
    <>
      <div className="menu-categories">
```

with:

```tsx
  return (
    <>
      {toast && (
        <div className="cart-toast" role="status">
          <span>Added {toast.name} to cart</span>
        </div>
      )}
      <div className="menu-categories">
```

(The `Undo` button is added in Task 2 — kept out of this step so this task's tests only exercise what this step actually builds.)

Add to `app/globals.css`, after the `/* Cart rail — persistent bottom bar that expands */` section's closing rule (`.cart-summary__error { ... }`), a new section:

```css
/* Add-to-cart toast */

.cart-toast {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  max-width: calc(100% - 2rem);
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: var(--espresso);
  color: var(--crema);
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.9rem;
  box-shadow: 0 8px 24px var(--clay-faint);
}

.cart-toast__undo {
  border: none;
  background: none;
  color: var(--copper-bright);
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  min-height: 44px;
  padding: 0 0.25rem;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx app/globals.css
git commit -m "feat: show a toast when an item is added to the cart"
```

---

### Task 2: Toast Undo + auto-dismiss

**Files:**
- Modify: `app/order/Cart.tsx`
- Test: `app/order/Cart.test.tsx`
- Modify: `BUILD_STATUS.md`

**Interfaces:**
- Consumes: `toast` state and `adjustQuantity` from Task 1 — no signature changes.
- Produces: nothing new consumed by later tasks (Task 3/4 don't touch the toast).

- [ ] **Step 1: Write the failing tests**

Add to `app/order/Cart.test.tsx`, directly after the two toast tests added in Task 1:

```tsx
  it('reverses exactly the last add when Undo is tapped, leaving other quantities alone', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    // toast now reflects the most recent +1, cart quantity is 3

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('2')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('removes the line entirely if Undo is tapped right after the first add', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).queryByText('Burger')).not.toBeInTheDocument()
  })

  it('auto-dismisses the toast after 4 seconds', async () => {
    vi.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
```

Add `act` to the Testing Library import at the top of the file — replace:

```tsx
import { render, screen, within } from '@testing-library/react'
```

with:

```tsx
import { render, screen, within, act } from '@testing-library/react'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — there is no button named `Undo` yet, so the first two new tests fail on the `getByRole('button', { name: 'Undo' })` lookup; the timer test fails because the toast never disappears (or times out) since there's no way to distinguish it from Task 1's implementation... actually Task 1 already auto-dismisses via `setTimeout` in `showToast`, so this third test may already pass — confirm by running it standalone if in doubt, but the two Undo tests will fail regardless.

- [ ] **Step 3: Implement Undo**

In `app/order/Cart.tsx`, add the undo handler next to `showToast`:

```tsx
  function undoToast() {
    if (!toast) return
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    adjustQuantity(toast.menuItemId, -1)
    setToast(null)
  }
```

Update the toast JSX to add the button — replace:

```tsx
      {toast && (
        <div className="cart-toast" role="status">
          <span>Added {toast.name} to cart</span>
        </div>
      )}
```

with:

```tsx
      {toast && (
        <div className="cart-toast" role="status">
          <span>Added {toast.name} to cart</span>
          <button type="button" className="cart-toast__undo" onClick={undoToast}>
            Undo
          </button>
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (all tests).

If the fake-timer test hangs or times out instead of failing cleanly, that's `userEvent`'s internal delay `setTimeout` calls conflicting with fake timers — `userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })` (already used above) is the fix; this codebase has not combined `userEvent` with fake timers before (`PendingOrdersDashboard.test.tsx` uses `fireEvent`/`act` instead, not `userEvent`), so this is the first occurrence.

- [ ] **Step 5: Log the gotcha and commit**

Add a new bullet to the "Gotchas log" section at the bottom of `BUILD_STATUS.md` (after the existing polling/fake-timers bullet):

```markdown
- **`userEvent` hangs (or silently no-ops) under fake timers unless configured.** `vi.useFakeTimers()` combined with plain `userEvent.setup()` breaks `user.click()`'s internal delay handling — the click event never resolves because `userEvent` schedules its own timers that fake timers now control but nothing advances. Fix: `userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })`. First hit in `app/order/Cart.test.tsx`'s toast auto-dismiss test — the codebase's only other fake-timer test (`PendingOrdersDashboard.test.tsx`) sidesteps this by using `fireEvent`/`act` instead of `userEvent`.
```

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx BUILD_STATUS.md
git commit -m "feat: let customers undo the last add-to-cart action from the toast"
```

---

### Task 3: OrderReviewModal component

**Files:**
- Create: `app/order/OrderReviewModal.tsx`
- Create: `app/order/OrderReviewModal.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `OrderReviewModal` React component with this exact prop shape (Task 4 imports and wires it):

```ts
type ReviewLine = { menuItemId: string; name: string; price: string; quantity: number }

function OrderReviewModal(props: {
  lines: ReviewLine[]
  total: number
  error: string | null
  submitting: boolean
  onConfirm: () => void
  onClose: () => void
}): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

Create `app/order/OrderReviewModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderReviewModal } from './OrderReviewModal'

const lines = [
  { menuItemId: 'm1', name: 'Burger', price: '12.50', quantity: 2 },
  { menuItemId: 'm2', name: 'Fries', price: '4.00', quantity: 1 },
]

describe('OrderReviewModal', () => {
  it('renders every line with its quantity and line price, and the total', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
    expect(screen.getByText('1x Fries')).toBeInTheDocument()
    expect(screen.getByText('$4.00')).toBeInTheDocument()
    expect(screen.getByText('$29.00')).toBeInTheDocument()
  })

  it('calls onClose when "Back to menu" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Back to menu' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when "Confirm Order" is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click but not on a click inside the dialog content', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('review-modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables both action buttons while submitting', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Back to menu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Confirm Order' })).toBeDisabled()
  })

  it('renders the error message when present', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error="Burger is no longer available"
        submitting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Burger is no longer available')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/OrderReviewModal.test.tsx`
Expected: FAIL with a module-not-found error for `./OrderReviewModal`.

- [ ] **Step 3: Implement the component**

Create `app/order/OrderReviewModal.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

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
  onConfirm,
  onClose,
}: {
  lines: ReviewLine[]
  total: number
  error: string | null
  submitting: boolean
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
    <div className="review-modal__backdrop" data-testid="review-modal-backdrop" onClick={onClose}>
      <div
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Review your order"
        onClick={(event) => event.stopPropagation()}
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
      </div>
    </div>
  )
}
```

Add to `app/globals.css`, after the `.cart-toast__undo` rule from Task 1:

```css
/* Order review modal */

.review-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  background: color-mix(in srgb, var(--espresso) 60%, transparent);
}

.review-modal {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--paper);
  color: var(--espresso);
  border-radius: 16px 16px 0 0;
  padding: 1.5rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -8px 24px var(--clay-faint);
}

.review-modal__title {
  font-family: var(--font-display), Georgia, serif;
  font-style: italic;
  font-weight: 600;
  font-size: 1.4rem;
  margin-bottom: 1rem;
}

.review-modal__lines {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.review-modal__line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.95rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed var(--clay-faint);
}

.review-modal__line-price {
  font-family: var(--font-mono), monospace;
  white-space: nowrap;
}

.review-modal__total {
  display: flex;
  justify-content: space-between;
  padding-top: 0.75rem;
  border-top: 1px solid var(--clay-faint);
  font-weight: 600;
  font-family: var(--font-mono), monospace;
  margin-bottom: 1rem;
}

.review-modal__error {
  color: #b91c1c;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.review-modal__actions {
  display: flex;
  gap: 0.75rem;
}

.review-modal__back,
.review-modal__confirm {
  flex: 1;
  min-height: 48px;
  border-radius: 10px;
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
}

.review-modal__back {
  border: 1px solid var(--clay-faint);
  background: none;
  color: var(--espresso);
}

.review-modal__confirm {
  border: none;
  background: var(--copper);
  color: var(--paper);
}

.review-modal__back:disabled,
.review-modal__confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.review-modal__back:focus-visible,
.review-modal__confirm:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/OrderReviewModal.test.tsx`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/order/OrderReviewModal.tsx app/order/OrderReviewModal.test.tsx app/globals.css
git commit -m "feat: add OrderReviewModal component for order-submission confirmation"
```

---

### Task 4: Wire the review modal into Cart

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/order/Cart.test.tsx`

**Interfaces:**
- Consumes: `OrderReviewModal` from Task 3, with the exact prop shape defined there. `lines` (the existing `CartLine[]` state) is passed directly — `CartLine`'s shape (`menuItemId`, `name`, `price`, `quantity`) already matches `ReviewLine` structurally.

- [ ] **Step 1: Write the failing tests**

In `app/order/Cart.test.tsx`, **replace** the three existing submission tests. Replace:

```tsx
  it('redirects to the order page after a successful submit', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      id: 'o1',
      orderNumber: 47,
      items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
    })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))
    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
    })
  })

  it('ignores a second submit click while the first is still in flight', async () => {
    let resolvePost!: (value: { id: string; orderNumber: number; items: never[] }) => void
    vi.mocked(apiClient.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }),
    )
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    const submit = screen.getByRole('button', { name: 'Submit order' })
    await user.click(submit)
    await user.click(submit)

    resolvePost({ id: 'o1', orderNumber: 47, items: [] })
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))

    expect(apiClient.post).toHaveBeenCalledTimes(1)
  })

  it('shows an inline error and keeps the cart intact on submit failure', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('MENU_ITEM_SOLD_OUT', 'Burger is no longer available'))
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Burger is no longer available')
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })
```

with:

```tsx
  it('opens the review modal instead of submitting when "Submit order" is tapped', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    expect(screen.getByRole('dialog', { name: 'Review your order' })).toBeInTheDocument()
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('"Back to menu" closes the review modal without submitting or changing the cart', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Back to menu' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiClient.post).not.toHaveBeenCalled()
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })

  it('redirects to the order page after confirming in the review modal', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      id: 'o1',
      orderNumber: 47,
      items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
    })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))
    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
    })
  })

  it('ignores a second Confirm Order click while the first is still in flight', async () => {
    let resolvePost!: (value: { id: string; orderNumber: number; items: never[] }) => void
    vi.mocked(apiClient.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }),
    )
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    const confirm = screen.getByRole('button', { name: 'Confirm Order' })
    await user.click(confirm)
    await user.click(confirm)

    resolvePost({ id: 'o1', orderNumber: 47, items: [] })
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))

    expect(apiClient.post).toHaveBeenCalledTimes(1)
  })

  it('shows an inline error in the modal and keeps the cart intact on submit failure', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('MENU_ITEM_SOLD_OUT', 'Burger is no longer available'))
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Burger is no longer available')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — "Submit order" still calls the API directly, so there's no `dialog` role rendered and no `Confirm Order`/`Back to menu` buttons exist.

- [ ] **Step 3: Implement the wiring**

In `app/order/Cart.tsx`, add the import and state. Replace:

```tsx
import { apiClient, ApiError } from '@/lib/apiClient'
```

with:

```tsx
import { apiClient, ApiError } from '@/lib/apiClient'
import { OrderReviewModal } from './OrderReviewModal'
```

Add `reviewOpen` state next to the other `useState` calls (after the `toastTimerRef` declaration from Task 1):

```tsx
  const [reviewOpen, setReviewOpen] = useState(false)
```

Change the Submit button's handler — replace:

```tsx
          <button
            type="button"
            className="cart-summary__submit"
            onClick={handleSubmit}
            disabled={lines.length === 0 || submitting}
          >
            Submit order
          </button>
```

with:

```tsx
          <button
            type="button"
            className="cart-summary__submit"
            onClick={() => setReviewOpen(true)}
            disabled={lines.length === 0 || submitting}
          >
            Submit order
          </button>
```

Render the modal — replace the closing of the component's return (the `</section>` that ends the `cart-rail`, followed by `</>`):

```tsx
      </section>
    </>
  )
}
```

with:

```tsx
      </section>

      {reviewOpen && (
        <OrderReviewModal
          lines={lines}
          total={cartTotal}
          error={error}
          submitting={submitting}
          onConfirm={handleSubmit}
          onClose={() => {
            if (!submitting) setReviewOpen(false)
          }}
        />
      )}
    </>
  )
}
```

`handleSubmit` itself is unchanged — it already sets `submitting`/`error` and calls `router.push` on success, which is exactly the behavior the modal needs as `onConfirm`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no other test file imports or renders `Cart` in a way that would be affected (confirm by checking the run output for unrelated failures).

- [ ] **Step 6: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx
git commit -m "feat: require review-modal confirmation before submitting an order"
```

---

### Task 5: Manual verification in the running app

This task has no automated test — it's the "use the feature in a browser before calling it done" check this project's CLAUDE.md requires for UI changes, and the existing Docker stack from the last deploy is already running for it.

**Files:** none (verification only).

- [ ] **Step 1: Rebuild and restart the app container**

```bash
docker compose build app && docker compose up -d --no-deps app
```

Expected: build succeeds, container recreated and started (same as the last redeploy).

- [ ] **Step 2: Open the customer order page**

Navigate to `http://localhost:3001/order/test` (or `http://localhost:3001/order?table=<a-seeded-table-id>`), pick a table, and confirm:
- Tapping a menu item shows a toast reading "Added `<item>` to cart" with an "Undo" button.
- Tapping "Undo" removes exactly that one unit and the toast disappears.
- Waiting ~4 seconds without touching it makes the toast disappear on its own.
- Adding a second, different item replaces the toast rather than stacking a second one.

- [ ] **Step 3: Verify the review modal**

With at least one item in the cart:
- Tap "Submit order" — a full-screen overlay opens showing every line (name, qty, price) and the total, matching the cart.
- Tap "Back to menu" — the overlay closes, the cart is unchanged, no order was created (check the staff dashboard at `http://localhost:3001/dashboard` shows nothing new).
- Tap "Submit order" again, then "Confirm Order" — the overlay closes and the page redirects to `/order/<id>`, and the new order now appears on the staff dashboard.

- [ ] **Step 4: Report results**

Note in the conversation whether all of the above matched expectations, or describe what didn't (e.g. wrong copy, layout issue on a real phone-sized viewport) so it can be fixed before considering this done.

---

## Self-Review Notes

- **Spec coverage:** every "Decisions" bullet in the design spec has a corresponding step — tap-to-add unchanged (Task 1, no behavior change to `addItem`'s cart-line logic), toast+Undo (Tasks 1–2), undo reverses exactly one `+1` (Task 2 test), 4s auto-dismiss (Task 2), full-screen modal over inline swap (Task 3), "Confirm Order" label (Task 3), read-only modal content (Task 3 — no steppers rendered), API failure keeps modal open (Task 4's error test).
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `ReviewLine` (Task 3) matches `CartLine`'s field names (`menuItemId`, `name`, `price`, `quantity`) exactly, so Task 4 passes `lines` straight through with no mapping. `showToast`/`undoToast`/`reviewOpen` names are used consistently between the task that defines them and the tasks that reference them.
