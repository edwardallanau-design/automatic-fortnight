# Cart & Order UX Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix pre-existing cart-rail layout bugs, reposition/restyle the add-to-cart toast with a manual dismiss, center the order-review modal, and add a restrained, `prefers-reduced-motion`-respecting set of entrance/exit animations across the order page.

**Architecture:** All changes are client-side, confined to `app/order/Cart.tsx`, `app/order/OrderReviewModal.tsx`, and `app/globals.css`. Animated *exits* (toast dismiss, modal close, cart-line removal) use a small JS-driven delay pattern: mark the element "exiting" via state, let a CSS transition play for a fixed duration, then actually remove it from state. No animation library is introduced — everything is plain CSS `transition`/`@keyframes` plus `setTimeout`, matching this codebase's existing pattern (see `.order-card-arrive` in `globals.css`).

**Tech Stack:** Next.js App Router client components, React `useState`/`useEffect`/`useRef`, Vitest + Testing Library + `@testing-library/user-event`, plain CSS.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-07-cart-ux-polish-design.md` — every decision below traces to a bullet in that file.
- Toast: top-right corner (not top-center); dedicated `×` button pinned to the toast's own top-right corner, distinct from "Undo"; fade+slide in/out.
- Review modal: centered dialog (both axes), width capped at 420px regardless of viewport; fade+scale in/out.
- Cart rail: always collapsed by default regardless of whether the cart is empty (fixes the empty-panel/jump-on-first-add/menu-blocking bugs); no scrollbar-over-price overlap; fixed-width numeric columns so steppers don't shift; `:active` press feedback on steppers.
- Motion: cart lines animate in (add) and out (remove); menu items stagger-fade-in on first page load. Every new transition/animation gets a `@media (prefers-reduced-motion: reduce)` override, matching the existing pattern for `.order-rail__pulse`/`.order-card` in `globals.css`.
- No backend, API, schema, or submission-logic changes. This pass is presentation + pre-existing layout bug fixes only.
- Exit-delay durations: 200ms for toast, review modal, and cart-line removal (one constant per concern, not shared, since each has independent re-trigger semantics).

---

## File Structure

- **Modify:** `app/order/Cart.tsx` — cart-rail collapse-condition fix, toast reposition/dismiss/exit-animation state, review-modal open/close exit-animation state, menu-item stagger-delay computation, cart-line add/remove animation state.
- **Modify:** `app/order/OrderReviewModal.tsx` — new `exiting` prop, applied as a conditional class on the backdrop and dialog.
- **Modify:** `app/order/Cart.test.tsx` — regression tests for the collapse fix, updated timing-sensitive tests (`waitFor`/timer-advance) for the new exit delays, new tests for the `×` dismiss and cart-line removal animation.
- **Modify:** `app/order/OrderReviewModal.test.tsx` — every existing render call gets the new required `exiting` prop; one new test for the `--exiting` class.
- **Modify:** `app/globals.css` — cart-rail bug-fix rules, toast/modal restyle + animation rules, menu-item stagger keyframes, cart-line animation rules.

---

### Task 1: Cart-rail bug fixes

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/globals.css`
- Test: `app/order/Cart.test.tsx`

**Interfaces:** None — this task only changes a JSX class-name condition and CSS. No new functions or state.

- [ ] **Step 1: Write the failing tests**

Add to `app/order/Cart.test.tsx`, inside `describe('Cart', ...)`, after the `'disables submit while the cart is empty'` test:

```tsx
  it('keeps the order panel collapsed by default even when the cart is empty', () => {
    const { container } = render(<Cart tableId="t1" items={items} />)
    expect(container.querySelector('.cart-summary')).toHaveClass('cart-summary--collapsed')
  })

  it('does not change collapsed state when the first item is added', async () => {
    const user = userEvent.setup()
    const { container } = render(<Cart tableId="t1" items={items} />)
    expect(container.querySelector('.cart-summary')).toHaveClass('cart-summary--collapsed')

    await user.click(screen.getByRole('button', { name: /Burger/ }))

    expect(container.querySelector('.cart-summary')).toHaveClass('cart-summary--collapsed')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — both new tests fail because `.cart-summary` currently only gets the `--collapsed` class when `lines.length > 0 && !cartExpanded`, so an empty cart's panel has no `--collapsed` class at all.

- [ ] **Step 3: Fix the collapse condition**

In `app/order/Cart.tsx`, replace:

```tsx
        <div className={`cart-summary${lines.length > 0 && !cartExpanded ? ' cart-summary--collapsed' : ''}`}>
```

with:

```tsx
        <div className={`cart-summary${!cartExpanded ? ' cart-summary--collapsed' : ''}`}>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Fix the remaining cart-rail CSS bugs**

In `app/globals.css`, replace the `.cart-summary__lines` rule:

```css
.cart-summary__lines {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.5rem 0 0.75rem;
  max-height: 40vh;
  overflow-y: auto;
}
```

with (adds right padding so the scrollbar doesn't sit on top of the price column):

```css
.cart-summary__lines {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.5rem 0 0.75rem;
  padding-right: 0.5rem;
  max-height: 40vh;
  overflow-y: auto;
}
```

Replace the `.cart-summary__stepper` rule:

```css
.cart-summary__stepper {
  min-width: 40px;
  min-height: 40px;
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  background: transparent;
  color: var(--crema);
  font-size: 1.1rem;
  cursor: pointer;
}
```

with (adds a transition so the new `:active` state below animates smoothly):

```css
.cart-summary__stepper {
  min-width: 40px;
  min-height: 40px;
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  background: transparent;
  color: var(--crema);
  font-size: 1.1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background-color 0.1s ease;
}

.cart-summary__stepper:active:not(:disabled) {
  transform: scale(0.92);
  background: var(--clay-faint);
}

@media (prefers-reduced-motion: reduce) {
  .cart-summary__stepper:active:not(:disabled) {
    transform: none;
  }
}
```

Replace the `.cart-summary__line-qty` and `.cart-summary__line-price` rules:

```css
.cart-summary__line-qty {
  font-family: var(--font-mono), monospace;
  min-width: 1.5ch;
  text-align: center;
}

.cart-summary__line-price {
  font-family: var(--font-mono), monospace;
  color: var(--copper-bright);
  min-width: 4.5ch;
  text-align: right;
}
```

with (wider fixed minimums so a multi-digit quantity or price doesn't reflow the stepper buttons next to it):

```css
.cart-summary__line-qty {
  font-family: var(--font-mono), monospace;
  min-width: 3ch;
  text-align: center;
}

.cart-summary__line-price {
  font-family: var(--font-mono), monospace;
  color: var(--copper-bright);
  min-width: 6ch;
  text-align: right;
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — CSS-only changes beyond the JSX fix in Step 3, no other test should be affected.

- [ ] **Step 7: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx app/globals.css
git commit -m "fix: keep the cart rail collapsed by default and fix stepper layout shift"
```

---

### Task 2: Toast reposition, manual dismiss, and exit animation

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/globals.css`
- Test: `app/order/Cart.test.tsx`

**Interfaces:**
- Produces: `dismissToast(): void` — used directly by the new `×` button and by `undoToast`; Task 5 does not touch this function, but Task 5's `undoToast` changes call it exactly as it exists after this task.
- Produces: module-level constants `TOAST_AUTO_DISMISS_MS = 4000` and `TOAST_EXIT_MS = 200`, placed near the top of `app/order/Cart.tsx` (below the existing `OTHER_CATEGORY` constant).

- [ ] **Step 1: Write the failing tests**

In `app/order/Cart.test.tsx`, update the Testing Library import at the top of the file — replace:

```tsx
import { render, screen, within, act, fireEvent } from '@testing-library/react'
```

with:

```tsx
import { render, screen, within, act, fireEvent, waitFor } from '@testing-library/react'
```

Replace the existing `'reverses exactly the last add when Undo is tapped, leaving other quantities alone'` test's final assertion — replace:

```tsx
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('2')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
```

with:

```tsx
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('2')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })
```

Replace the existing `'auto-dismisses the toast after 4 seconds'` test's timer advance — replace:

```tsx
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
```

with:

```tsx
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4200)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
```

Add a new test after `'auto-dismisses the toast after 4 seconds'`:

```tsx

  it('the × button dismisses the toast without undoing the add', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — the two updated tests fail because the toast currently disappears synchronously (no exit delay yet, so advancing only 4000ms leaves it gone already but the `waitFor` wrapper itself won't fail; the real failure is the new `×`-button test: there's no button named `Dismiss` yet).

- [ ] **Step 3: Add the module-level constants**

In `app/order/Cart.tsx`, after the line `const OTHER_CATEGORY = 'More'`, add:

```tsx

const TOAST_AUTO_DISMISS_MS = 4000
const TOAST_EXIT_MS = 200
```

- [ ] **Step 4: Refactor toast state to support an exit animation**

Replace:

```tsx
  const [toast, setToast] = useState<{ menuItemId: string; name: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

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

  function undoToast() {
    if (!toast) return
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    adjustQuantity(toast.menuItemId, -1)
    setToast(null)
  }
```

with:

```tsx
  const [toast, setToast] = useState<{ menuItemId: string; name: string } | null>(null)
  const [toastExiting, setToastExiting] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current)
    }
  }, [])

  function showToast(menuItemId: string, name: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current)
    setToastExiting(false)
    setToast({ menuItemId, name })
    toastTimerRef.current = setTimeout(() => dismissToast(), TOAST_AUTO_DISMISS_MS)
  }

  function dismissToast() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastExiting(true)
    toastExitTimerRef.current = setTimeout(() => {
      setToast(null)
      setToastExiting(false)
    }, TOAST_EXIT_MS)
  }

  function undoToast() {
    if (!toast) return
    adjustQuantity(toast.menuItemId, -1)
    dismissToast()
  }
```

- [ ] **Step 5: Update the toast JSX**

Replace:

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

with:

```tsx
      {toast && (
        <div className={`cart-toast${toastExiting ? ' cart-toast--exiting' : ''}`} role="status">
          <span>Added {toast.name} to cart</span>
          <button type="button" className="cart-toast__undo" onClick={undoToast}>
            Undo
          </button>
          <button type="button" className="cart-toast__close" aria-label="Dismiss" onClick={dismissToast}>
            ×
          </button>
        </div>
      )}
```

- [ ] **Step 6: Update the toast CSS**

In `app/globals.css`, replace the `.cart-toast` and `.cart-toast__undo` rules:

```css
.cart-toast {
  position: fixed;
  top: 7.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  max-width: calc(100% - 2rem);
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: var(--paper);
  color: var(--espresso);
  border: 1px solid var(--clay-faint);
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.9rem;
  box-shadow: 0 8px 24px var(--clay-faint);
}

.cart-toast__undo {
  border: none;
  background: none;
  color: var(--copper);
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  min-height: 44px;
  padding: 0 0.25rem;
}
```

with:

```css
.cart-toast {
  position: fixed;
  top: 7.5rem;
  right: 1rem;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  max-width: min(240px, calc(100% - 2rem));
  padding: 0.75rem 2.25rem 0.75rem 1rem;
  border-radius: 10px;
  background: var(--paper);
  color: var(--espresso);
  border: 1px solid var(--clay-faint);
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.9rem;
  box-shadow: 0 8px 24px var(--clay-faint);
  animation: cart-toast-enter 0.2s ease-out;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.cart-toast--exiting {
  opacity: 0;
  transform: translateX(12px);
}

.cart-toast__undo {
  border: none;
  background: none;
  color: var(--copper);
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  min-height: 44px;
  padding: 0 0.25rem;
}

.cart-toast__close {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 44px;
  min-height: 44px;
  padding: 0.4rem 0.6rem;
  border: none;
  background: none;
  color: var(--clay);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}

@keyframes cart-toast-enter {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cart-toast {
    animation: none;
    transition: none;
  }
}
```

`.cart-toast` needs `position: relative` for `.cart-toast__close`'s `position: absolute` to anchor to it correctly — it already has `position: fixed`, which also establishes a positioning context, so no additional rule is needed.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (all tests, including the new `×` test and the two updated ones).

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx app/globals.css
git commit -m "feat: reposition the add-to-cart toast top-right, add a close button and exit animation"
```

---

### Task 3: Center the review modal and add its exit animation

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/order/OrderReviewModal.tsx`
- Modify: `app/globals.css`
- Test: `app/order/Cart.test.tsx`
- Test: `app/order/OrderReviewModal.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 2 directly, but touches the same `Cart.tsx` file — apply this task's diffs against the file as it exists after Task 2.
- Produces: `OrderReviewModal` gains a new **required** prop `exiting: boolean`. Every caller (including every test that renders it directly) must pass it.
- Produces: `closeReview(): void` and `openReview(): void` in `Cart.tsx`, replacing the inline `setReviewOpen(true)`/`setReviewOpen(false)` calls used previously.

- [ ] **Step 1: Write the failing tests**

In `app/order/Cart.test.tsx`, update the `'"Back to menu" closes the review modal without submitting or changing the cart'` test — replace:

```tsx
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
```

with:

```tsx
  it('"Back to menu" closes the review modal without submitting or changing the cart', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Back to menu' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(apiClient.post).not.toHaveBeenCalled()
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })
```

Now replace the entire contents of `app/order/OrderReviewModal.test.tsx` with (this adds `exiting={false}` to every existing render call and adds one new test for `exiting={true}`):

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
        exiting={false}
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
        exiting={false}
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
        exiting={false}
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
        exiting={false}
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
        exiting={false}
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
        exiting={false}
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
        exiting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Burger is no longer available')
  })

  it('adds an exiting class to the dialog when exiting is true', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveClass('review-modal--exiting')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/OrderReviewModal.test.tsx app/order/Cart.test.tsx`
Expected: FAIL — TypeScript will also complain that `exiting` is missing wherever `OrderReviewModal` is still rendered without it (in `Cart.tsx`, which hasn't been updated yet); the new `--exiting` class test fails because the prop doesn't exist yet.

- [ ] **Step 3: Add the `exiting` prop to OrderReviewModal**

In `app/order/OrderReviewModal.tsx`, replace:

```tsx
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
```

with:

```tsx
export function OrderReviewModal({
  lines,
  total,
  error,
  submitting,
  exiting,
  onConfirm,
  onClose,
}: {
  lines: ReviewLine[]
  total: number
  error: string | null
  submitting: boolean
  exiting: boolean
  onConfirm: () => void
  onClose: () => void
}) {
```

Replace:

```tsx
    <div className="review-modal__backdrop" data-testid="review-modal-backdrop" onClick={onClose}>
      <div
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Review your order"
        onClick={(event) => event.stopPropagation()}
      >
```

with:

```tsx
    <div
      className={`review-modal__backdrop${exiting ? ' review-modal__backdrop--exiting' : ''}`}
      data-testid="review-modal-backdrop"
      onClick={onClose}
    >
      <div
        className={`review-modal${exiting ? ' review-modal--exiting' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Review your order"
        onClick={(event) => event.stopPropagation()}
      >
```

- [ ] **Step 4: Add review-open/close exit-animation state to Cart.tsx**

In `app/order/Cart.tsx`, after the constants added in Task 2, add:

```tsx
const REVIEW_EXIT_MS = 200
```

so the top of the file now has both:

```tsx
const TOAST_AUTO_DISMISS_MS = 4000
const TOAST_EXIT_MS = 200
const REVIEW_EXIT_MS = 200
```

Replace:

```tsx
  const [reviewOpen, setReviewOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current)
    }
  }, [])
```

with:

```tsx
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewClosing, setReviewClosing] = useState(false)
  const reviewCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current)
      if (reviewCloseTimerRef.current) clearTimeout(reviewCloseTimerRef.current)
    }
  }, [])

  function openReview() {
    if (reviewCloseTimerRef.current) clearTimeout(reviewCloseTimerRef.current)
    setReviewClosing(false)
    setReviewOpen(true)
  }

  function closeReview() {
    setReviewOpen(false)
    setReviewClosing(true)
    if (reviewCloseTimerRef.current) clearTimeout(reviewCloseTimerRef.current)
    reviewCloseTimerRef.current = setTimeout(() => setReviewClosing(false), REVIEW_EXIT_MS)
  }
```

- [ ] **Step 5: Wire up the new functions and the `exiting` prop**

Replace the Submit button's handler:

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

with:

```tsx
          <button
            type="button"
            className="cart-summary__submit"
            onClick={openReview}
            disabled={lines.length === 0 || submitting}
          >
            Submit order
          </button>
```

Replace the modal render block:

```tsx
      {reviewOpen && (
        <OrderReviewModal
          lines={lines}
          total={cartTotal}
          error={error}
          submitting={submitting}
          onConfirm={handleSubmit}
          onClose={() => {
            if (!submitting) {
              setReviewOpen(false)
              setError(null)
            }
          }}
        />
      )}
```

with:

```tsx
      {(reviewOpen || reviewClosing) && (
        <OrderReviewModal
          lines={lines}
          total={cartTotal}
          error={error}
          submitting={submitting}
          exiting={!reviewOpen}
          onConfirm={handleSubmit}
          onClose={() => {
            if (!submitting) {
              closeReview()
              setError(null)
            }
          }}
        />
      )}
```

- [ ] **Step 6: Update the modal CSS**

In `app/globals.css`, replace the `.review-modal__backdrop` and `.review-modal` rules:

```css
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
```

with:

```css
.review-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: color-mix(in srgb, var(--espresso) 60%, transparent);
  animation: review-modal-backdrop-enter 0.2s ease-out;
}

.review-modal__backdrop--exiting {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.review-modal {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--paper);
  color: var(--espresso);
  border-radius: 16px;
  padding: 1.5rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 8px 24px var(--clay-faint);
  animation: review-modal-enter 0.2s ease-out;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.review-modal--exiting {
  opacity: 0;
  transform: scale(0.96);
}

@keyframes review-modal-backdrop-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes review-modal-enter {
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
  .review-modal__backdrop,
  .review-modal {
    animation: none;
    transition: none;
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- app/order/OrderReviewModal.test.tsx app/order/Cart.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 8: Run the full test suite and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (confirms every `OrderReviewModal` usage — in `Cart.tsx` and both test files — has the new required `exiting` prop).

- [ ] **Step 9: Commit**

```bash
git add app/order/Cart.tsx app/order/OrderReviewModal.tsx app/order/Cart.test.tsx app/order/OrderReviewModal.test.tsx app/globals.css
git commit -m "feat: center the review modal and add its open/close animation"
```

---

### Task 4: Menu item stagger-fade-in on page load

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/globals.css`
- Test: `app/order/Cart.test.tsx`

**Interfaces:** None consumed from or produced for other tasks — this only touches the menu-item rendering loop and its CSS, a region no other task in this plan modifies.

- [ ] **Step 1: Write the failing test**

Add to `app/order/Cart.test.tsx`, after the `'disables submit while the cart is empty'` test (or anywhere in the `describe` block):

```tsx

  it('applies an increasing stagger delay to menu items in order', () => {
    const { container } = render(<Cart tableId="t1" items={items} />)
    const buttons = container.querySelectorAll('.menu-item-button')
    expect(buttons[0]).toHaveStyle({ '--stagger-delay': '0ms' })
    expect(buttons[1]).toHaveStyle({ '--stagger-delay': '30ms' })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — no `--stagger-delay` inline style exists yet.

- [ ] **Step 3: Compute and apply the stagger delay**

In `app/order/Cart.tsx`, replace:

```tsx
      <div className="menu-categories">
        {categories.map((category) => (
          <div key={category.label} className="menu-category">
            <h2 className="menu-category__title">{category.label}</h2>
            <ul className="menu-list">
              {category.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="menu-item-button"
                    disabled={!item.available}
                    onClick={() => addItem(item)}
                  >
                    <span>
                      <span className="menu-item-button__name">{item.name}</span>
                      {!item.available && <span className="menu-item-button__sold-out">Sold out</span>}
                    </span>
                    <span className="menu-item-button__price">${item.price}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
```

with:

```tsx
      <div className="menu-categories">
        {(() => {
          let staggerIndex = 0
          return categories.map((category) => (
            <div key={category.label} className="menu-category">
              <h2 className="menu-category__title">{category.label}</h2>
              <ul className="menu-list">
                {category.items.map((item) => {
                  const staggerDelay = `${Math.min(staggerIndex * 30, 300)}ms`
                  staggerIndex += 1
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="menu-item-button"
                        style={{ '--stagger-delay': staggerDelay } as React.CSSProperties}
                        disabled={!item.available}
                        onClick={() => addItem(item)}
                      >
                        <span>
                          <span className="menu-item-button__name">{item.name}</span>
                          {!item.available && <span className="menu-item-button__sold-out">Sold out</span>}
                        </span>
                        <span className="menu-item-button__price">${item.price}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        })()}
      </div>
```

- [ ] **Step 4: Add the stagger-in CSS**

In `app/globals.css`, replace the `.menu-item-button` rule:

```css
.menu-item-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0.85rem 1rem;
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  background: var(--paper);
  color: var(--espresso);
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 1rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.1s ease;
}
```

with:

```css
.menu-item-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0.85rem 1rem;
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  background: var(--paper);
  color: var(--espresso);
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 1rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.1s ease;
  animation: menu-item-arrive 0.25s ease-out backwards;
  animation-delay: var(--stagger-delay, 0ms);
}

@keyframes menu-item-arrive {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu-item-button {
    animation: none;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/order/Cart.tsx app/globals.css app/order/Cart.test.tsx
git commit -m "feat: stagger-fade-in menu items on first page load"
```

---

### Task 5: Cart-line add/remove animation

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/globals.css`
- Test: `app/order/Cart.test.tsx`

**Interfaces:**
- Consumes: `dismissToast()` and `adjustQuantity()` from Task 2/the original implementation — unchanged signatures.
- Produces: `removeLineWithAnimation(menuItemId: string): void` and `handleDecrease(line: CartLine): void`, used only within `Cart.tsx`.

- [ ] **Step 1: Write the failing tests**

In `app/order/Cart.test.tsx`, update the existing `'increments and decrements quantity, removing the line at zero'` test — replace:

```tsx
    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    expect(within(order).queryByText('Burger')).not.toBeInTheDocument()
  })
```

with:

```tsx
    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    await waitFor(() => expect(within(order).queryByText('Burger')).not.toBeInTheDocument())
  })
```

Update the existing `'removes the line entirely if Undo is tapped right after the first add'` test — replace:

```tsx
  it('removes the line entirely if Undo is tapped right after the first add', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).queryByText('Burger')).not.toBeInTheDocument()
  })
```

with:

```tsx
  it('removes the line entirely if Undo is tapped right after the first add', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    await waitFor(() => expect(within(order).queryByText('Burger')).not.toBeInTheDocument())
  })
```

Add a new test after it:

```tsx

  it('marks a line as removing during its exit animation before actually removing it', async () => {
    const user = userEvent.setup()
    const { container } = render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))

    expect(container.querySelector('.cart-summary__line--removing')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.cart-summary__line--removing')).not.toBeInTheDocument())
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — the two updated tests currently pass synchronously (no delay exists yet) so wrapping them in `waitFor` doesn't break them, but the new `--removing` test fails because no such class exists yet.

- [ ] **Step 3: Add the constant and state**

In `app/order/Cart.tsx`, add a fourth constant alongside the other three:

```tsx
const TOAST_AUTO_DISMISS_MS = 4000
const TOAST_EXIT_MS = 200
const REVIEW_EXIT_MS = 200
const LINE_EXIT_MS = 200
```

Add state after the `reviewCloseTimerRef` declaration:

```tsx
  const [removingLineIds, setRemovingLineIds] = useState<Set<string>>(new Set())
  const removingLineTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
```

Extend the cleanup effect — replace:

```tsx
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current)
      if (reviewCloseTimerRef.current) clearTimeout(reviewCloseTimerRef.current)
    }
  }, [])
```

with:

```tsx
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current)
      if (reviewCloseTimerRef.current) clearTimeout(reviewCloseTimerRef.current)
      removingLineTimersRef.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])
```

- [ ] **Step 4: Add the removal-animation functions**

Add after the `adjustQuantity` function:

```tsx
  function removeLineWithAnimation(menuItemId: string) {
    setRemovingLineIds((prev) => new Set(prev).add(menuItemId))
    const timer = setTimeout(() => {
      adjustQuantity(menuItemId, -1)
      setRemovingLineIds((prev) => {
        const next = new Set(prev)
        next.delete(menuItemId)
        return next
      })
      removingLineTimersRef.current.delete(menuItemId)
    }, LINE_EXIT_MS)
    removingLineTimersRef.current.set(menuItemId, timer)
  }

  function handleDecrease(line: CartLine) {
    if (line.quantity === 1) {
      removeLineWithAnimation(line.menuItemId)
    } else {
      adjustQuantity(line.menuItemId, -1)
    }
  }
```

- [ ] **Step 5: Update `undoToast` to use the same removal path**

Replace:

```tsx
  function undoToast() {
    if (!toast) return
    adjustQuantity(toast.menuItemId, -1)
    dismissToast()
  }
```

with:

```tsx
  function undoToast() {
    if (!toast) return
    const line = lines.find((l) => l.menuItemId === toast.menuItemId)
    if (line?.quantity === 1) {
      removeLineWithAnimation(toast.menuItemId)
    } else {
      adjustQuantity(toast.menuItemId, -1)
    }
    dismissToast()
  }
```

- [ ] **Step 6: Update the cart-line JSX**

Replace:

```tsx
              <li key={line.menuItemId} className="cart-summary__line">
                <span className="cart-summary__line-name">{line.name}</span>
                <button
                  type="button"
                  className="cart-summary__stepper"
                  aria-label={`Decrease ${line.name} quantity`}
                  onClick={() => adjustQuantity(line.menuItemId, -1)}
                >
                  -
                </button>
                <span className="cart-summary__line-qty">{line.quantity}</span>
                <button
                  type="button"
                  className="cart-summary__stepper"
                  aria-label={`Increase ${line.name} quantity`}
                  onClick={() => adjustQuantity(line.menuItemId, 1)}
                >
                  +
                </button>
                <span className="cart-summary__line-price">${(Number(line.price) * line.quantity).toFixed(2)}</span>
              </li>
```

with:

```tsx
              <li
                key={line.menuItemId}
                className={`cart-summary__line${removingLineIds.has(line.menuItemId) ? ' cart-summary__line--removing' : ''}`}
              >
                <span className="cart-summary__line-name">{line.name}</span>
                <button
                  type="button"
                  className="cart-summary__stepper"
                  aria-label={`Decrease ${line.name} quantity`}
                  onClick={() => handleDecrease(line)}
                  disabled={removingLineIds.has(line.menuItemId)}
                >
                  -
                </button>
                <span className="cart-summary__line-qty">{line.quantity}</span>
                <button
                  type="button"
                  className="cart-summary__stepper"
                  aria-label={`Increase ${line.name} quantity`}
                  onClick={() => adjustQuantity(line.menuItemId, 1)}
                  disabled={removingLineIds.has(line.menuItemId)}
                >
                  +
                </button>
                <span className="cart-summary__line-price">${(Number(line.price) * line.quantity).toFixed(2)}</span>
              </li>
```

- [ ] **Step 7: Add the cart-line animation CSS**

In `app/globals.css`, replace the `.cart-summary__line` rule:

```css
.cart-summary__line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--clay-faint);
}
```

with:

```css
.cart-summary__line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--clay-faint);
  max-height: 60px;
  overflow: hidden;
  animation: cart-line-arrive 0.2s ease-out;
  transition: opacity 0.2s ease, transform 0.2s ease, max-height 0.2s ease, padding 0.2s ease;
}

.cart-summary__line--removing {
  opacity: 0;
  transform: translateX(8px);
  max-height: 0;
  padding: 0;
  border-bottom: none;
}

@keyframes cart-line-arrive {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cart-summary__line {
    animation: none;
    transition: none;
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (all tests, including the new removing-class test).

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add app/order/Cart.tsx app/globals.css app/order/Cart.test.tsx
git commit -m "feat: animate cart lines in on add and out on remove"
```

---

### Task 6: Manual verification in the browser

No automated test can verify real animation timing/easing or `prefers-reduced-motion` behavior — this task is the "use the feature in a browser" check this project's CLAUDE.md requires for UI changes.

**Files:** none (verification only).

- [ ] **Step 1: Rebuild and restart the app container**

```bash
docker compose build app && docker compose up -d --no-deps app
```

Expected: build succeeds, container recreated and started.

- [ ] **Step 2: Verify the toast**

Navigate to the order page for any seeded table. Confirm:
- Tapping a menu item shows a toast in the **top-right** corner (not top-center), with a small `×` in its own top-right corner and "Undo" below the message.
- The toast fades/slides in on appear.
- Tapping `×` dismisses it (fades/slides out) without changing the cart.
- Tapping "Undo" dismisses it (same animation) and reverses the last add.
- Waiting ~4 seconds triggers the same fade/slide-out automatically.
- Adding a second, different item while one toast is showing replaces it immediately (no stacking, no exit animation on the replaced one — it should feel instant, matching the existing "replaces" test).

- [ ] **Step 3: Verify the review modal**

With at least one item in the cart, tap "Submit order." Confirm:
- The modal appears centered on screen (both horizontally and vertically), not anchored to the bottom edge — check this at both a phone-narrow window and a wider (desktop) browser window.
- It fades/scales in on open.
- "Back to menu," Escape, and clicking the backdrop all close it with the same fade/scale-out animation.

- [ ] **Step 4: Verify the cart-rail fixes**

- Load the order page fresh (empty cart) — confirm the cart rail shows only the collapsed toggle bar ("Your cart is empty"), with no disabled "Submit order" panel visible underneath.
- Add the first item — confirm the rail does **not** visibly jump/collapse; it was already collapsed and stays that way (only the toggle bar's text/count updates).
- Expand the cart rail with several items — confirm the scrollbar (if the list is tall enough to scroll) doesn't overlap the price column.
- Add enough quantity to reach a 2-3 digit number on one line — confirm the `-`/`+` buttons don't visibly shift position as the digit count changes.
- Tap a stepper button and confirm it visibly reacts (a brief press/scale effect), not just the number changing.

- [ ] **Step 5: Verify cart-line and menu-item motion**

- Reload the order page and watch the menu items — confirm they fade in with a slight stagger (top items appear first, following ones shortly after), not all at once and not one-by-one slowly.
- Add an item and confirm its line fades/slides into the cart panel rather than popping in instantly.
- Decrease a line to zero and confirm it fades/slides out before disappearing, rather than vanishing instantly.

- [ ] **Step 6: Verify `prefers-reduced-motion`**

In your browser's dev tools, emulate `prefers-reduced-motion: reduce` (Chrome DevTools: Rendering tab → "Emulate CSS media feature prefers-reduced-motion"). Reload and repeat the toast, modal, cart-line, and menu-item checks above — confirm everything still functions correctly but without the animated transitions (elements should appear/disappear immediately, with no fade/slide/scale).

- [ ] **Step 7: Report results**

Note in the conversation whether all of the above matched expectations, or describe what didn't, so it can be fixed before considering this done.

---

## Self-Review Notes

- **Spec coverage:** toast reposition/dismiss/animation (Task 2), modal centering/animation (Task 3), all four cart-rail bugs (Task 1), menu-item stagger (Task 4), cart-line add/remove animation (Task 5), `prefers-reduced-motion` on every new animation (present in every CSS step), manual verification (Task 6) — every design-doc bullet has a task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `OrderReviewModal`'s new `exiting: boolean` prop is threaded consistently from Task 3's Cart.tsx wiring through to every test render call; `removeLineWithAnimation`/`handleDecrease` (Task 5) reuse the exact `CartLine`/`adjustQuantity` names already established, no renaming drift. All four timing constants (`TOAST_AUTO_DISMISS_MS`, `TOAST_EXIT_MS`, `REVIEW_EXIT_MS`, `LINE_EXIT_MS`) are declared once, added to incrementally task-by-task at the same top-of-file location, never duplicated.
- **Task ordering:** Task 5 modifies `undoToast`, which Task 2 creates — Task 5 is correctly sequenced after Task 2. Task 3 and Task 4 touch disjoint regions of `Cart.tsx` from Task 2 and each other, so their relative order doesn't matter, but they're listed after Task 2 since Task 2 establishes the constants pattern the later tasks extend.
