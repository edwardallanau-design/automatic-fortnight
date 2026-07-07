# Cart Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer's cart survive a page refresh within the same browser tab session, without leaking across tables or surviving past the browser session, and without resurrecting after a successful order.

**Architecture:** Client-only changes confined to `app/order/Cart.tsx`. Two new `useEffect` hooks (restore-on-mount, save-on-change) plus one `sessionStorage.removeItem` call in the existing success path of `handleSubmit`. No new components, no backend changes.

**Tech Stack:** React `useState`/`useEffect`, browser `sessionStorage` (available as a real implementation in this project's `jsdom` test environment — no mocking needed), Vitest + Testing Library.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-08-cart-session-persistence-design.md` — every decision below traces to a bullet in that file's "Decisions" section.
- Storage mechanism: `sessionStorage`, not `localStorage`.
- Storage key format: `cart:${tableId}` — exact string, used consistently for restore/save/clear.
- Restore happens in a `useEffect` that runs once after mount — never during the initial render/lazy-state-initializer (would cause a server/client hydration mismatch in this Next.js app).
- Save happens on every `lines` change via a `useEffect` keyed on `[lines, tableId]`.
- Clear happens in `handleSubmit`'s success branch, before the `router.push` redirect.
- Corrupted/missing storage must fail silently to an empty cart — no error shown to the customer, no thrown exception.
- Stale cart items (sold out or deleted since the cart was saved) are NOT filtered on restore — this matches the existing behavior for an item going sold-out mid-session, handled entirely by the existing server-side rejection at submit time. No new code for this case.
- No backend, API, or schema changes.

---

## File Structure

- **Modify:** `app/order/Cart.tsx` — add a `cartStorageKey(tableId)` helper, a restore-on-mount effect, a save-on-change effect, and one `sessionStorage.removeItem` call in `handleSubmit`.
- **Modify:** `app/order/Cart.test.tsx` — add `sessionStorage.clear()` to the existing `beforeEach` (test hygiene, since sessionStorage now persists across renders within a test file and multiple tests reuse `tableId="t1"`), plus new tests for restore, save, per-table scoping, corrupted-JSON fallback, and clear-on-submit.

---

### Task 1: Restore and save the cart via sessionStorage

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/order/Cart.test.tsx`

**Interfaces:**
- Produces: `cartStorageKey(tableId: string): string` — a module-level helper returning `` `cart:${tableId}` ``. Task 2 reuses this exact function; do not inline the template literal separately in Task 2.

- [ ] **Step 1: Write the failing tests**

In `app/order/Cart.test.tsx`, add `sessionStorage.clear()` to the existing `beforeEach` — replace:

```tsx
  beforeEach(() => {
    vi.clearAllMocks()
  })
```

with:

```tsx
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })
```

Add these four tests, anywhere inside the `describe('Cart', ...)` block (e.g. right after the `'disables submit while the cart is empty'` test):

```tsx

  it('restores a previously saved cart for this table on mount', () => {
    sessionStorage.setItem(
      'cart:t1',
      JSON.stringify([{ menuItemId: 'm1', name: 'Burger', price: '12.50', quantity: 2 }]),
    )
    render(<Cart tableId="t1" items={items} />)

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
    expect(within(order).getByText('2')).toBeInTheDocument()
  })

  it('saves the cart to sessionStorage under a table-specific key as it changes', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))

    const saved = JSON.parse(sessionStorage.getItem('cart:t1')!)
    expect(saved).toEqual([{ menuItemId: 'm1', name: 'Burger', price: '12.50', quantity: 1 }])
  })

  it('does not restore a cart saved under a different table id', () => {
    sessionStorage.setItem(
      'cart:t2',
      JSON.stringify([{ menuItemId: 'm1', name: 'Burger', price: '12.50', quantity: 1 }]),
    )
    render(<Cart tableId="t1" items={items} />)

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).queryByText('Burger')).not.toBeInTheDocument()
  })

  it('starts with an empty cart if the saved data is corrupted', () => {
    sessionStorage.setItem('cart:t1', 'not valid json{{{')
    render(<Cart tableId="t1" items={items} />)

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — the restore test fails because nothing reads `sessionStorage` yet (cart stays empty); the save test fails because `sessionStorage.getItem('cart:t1')` is `null`; the other-table and corrupted-JSON tests currently "pass" vacuously (cart is empty either way, since nothing reads storage at all) — note this in your run output, they'll become meaningful once Step 3 is implemented.

- [ ] **Step 3: Add the storage key helper and the two effects**

In `app/order/Cart.tsx`, add the helper function after `categorize`:

```tsx
function cartStorageKey(tableId: string) {
  return `cart:${tableId}`
}
```

Add the two new effects immediately after the existing timer-cleanup effect — replace:

```tsx
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current)
      if (reviewCloseTimerRef.current) clearTimeout(reviewCloseTimerRef.current)
      removingLineTimersRef.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  function openReview() {
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

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(cartStorageKey(tableId))
      if (saved) {
        setLines(JSON.parse(saved))
      }
    } catch {
      // Corrupted or inaccessible storage — start with an empty cart, no error shown.
    }
    // Runs once on mount only: tableId does not change for a mounted Cart instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    sessionStorage.setItem(cartStorageKey(tableId), JSON.stringify(lines))
  }, [lines, tableId])

  function openReview() {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (all tests, including the four new ones — the restore effect runs synchronously within `render()`'s `act()` wrapping, so no `waitFor` is needed for the restore assertions).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no other test file renders `Cart` in a way this would affect.

- [ ] **Step 6: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx
git commit -m "feat: restore and persist the cart in sessionStorage across refreshes"
```

---

### Task 2: Clear the saved cart on successful submit

**Files:**
- Modify: `app/order/Cart.tsx`
- Modify: `app/order/Cart.test.tsx`

**Interfaces:**
- Consumes: `cartStorageKey(tableId: string): string` from Task 1 — reuse it exactly, do not re-derive the `cart:${tableId}` format separately.

- [ ] **Step 1: Write the failing test**

Add to `app/order/Cart.test.tsx`, anywhere inside the `describe('Cart', ...)` block:

```tsx

  it('clears the saved cart from sessionStorage after a successful submit', async () => {
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
    expect(sessionStorage.getItem('cart:t1')).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: FAIL — `sessionStorage.getItem('cart:t1')` still returns the saved cart JSON (Task 1's save effect wrote it, and nothing clears it on submit yet).

- [ ] **Step 3: Clear storage on successful submit**

In `app/order/Cart.tsx`, replace:

```tsx
  async function handleSubmit() {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const order = await apiClient.post<{ id: string }>('/api/orders', {
        tableId,
        items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      })
      router.push(`/order/${order.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }
```

with:

```tsx
  async function handleSubmit() {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const order = await apiClient.post<{ id: string }>('/api/orders', {
        tableId,
        items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      })
      sessionStorage.removeItem(cartStorageKey(tableId))
      router.push(`/order/${order.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/order/Cart.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/order/Cart.tsx app/order/Cart.test.tsx
git commit -m "feat: clear the saved cart from sessionStorage after a successful submit"
```

---

### Task 3: Manual verification in the browser

No automated test can verify real `sessionStorage` behavior across an actual page reload (jsdom's `sessionStorage` is reset between test files, and a unit test can't simulate a browser refresh) — this task is the "use the feature in a browser before calling it done" check this project's CLAUDE.md requires for UI changes.

**Files:** none (verification only).

- [ ] **Step 1: Rebuild and restart the app container**

```bash
docker compose build app && docker compose up -d --no-deps app
```

Expected: build succeeds, container recreated and started.

- [ ] **Step 2: Verify persistence across a real refresh**

Navigate to the order page for a seeded table. Add a couple of items, adjust a quantity. Reload the page (F5 / browser refresh). Confirm:
- The cart reappears with the same items and quantities.
- The cart-rail stays collapsed by default (matching the existing collapse-by-default behavior) rather than auto-expanding just because it was restored.

- [ ] **Step 3: Verify per-table scoping**

With the same browser tab, navigate to a *different* table's order URL (a different `?table=<id>`). Confirm the cart is empty for that table — it does not show the previous table's items.

Navigate back to the original table's URL. Confirm that table's cart is still there.

- [ ] **Step 4: Verify it clears after a real submitted order**

With items in the cart, submit and confirm the order (through to the redirect). Then navigate back to that table's order URL (e.g. via browser back button, or re-visiting the same `?table=` link). Confirm the cart is now empty — the already-placed order does not reappear as if still pending.

- [ ] **Step 5: Verify it does not survive a new browser session**

Close the browser tab entirely (not just navigate away) and open a fresh tab to the same table's order URL. Confirm the cart is empty (assuming no order was submitted in Step 4 for this table, or use a fresh table for this check). This confirms `sessionStorage` semantics — not `localStorage` — are actually in effect.

- [ ] **Step 6: Report results**

Note in the conversation whether all of the above matched expectations, or describe what didn't, so it can be fixed before considering this done.

---

## Self-Review Notes

- **Spec coverage:** sessionStorage (not localStorage) — Task 1. Per-table key — Task 1 (`cartStorageKey`, tested via the "different table id" test). Restore in a post-mount effect, not during initial render — Task 1 (`useEffect` with `[]` deps, not a lazy `useState` initializer). Save on every change — Task 1. Clear on successful submit — Task 2. Stale items not filtered — no task needed, this is explicitly "add no new code for this," verified by absence rather than a task. Corrupted JSON fails silently — Task 1's `try/catch` + dedicated test.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `cartStorageKey(tableId: string): string` is defined once in Task 1 and reused verbatim (same name, same signature) in Task 2 — no re-derivation of the `cart:${tableId}` format elsewhere.
