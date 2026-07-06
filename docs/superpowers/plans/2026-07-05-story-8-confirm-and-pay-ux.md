# Story 8 Confirm/Pay UX Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native confirm-dialog gate and per-row submitting/error UI state to the staff dashboard's Confirm and Mark Paid/Unpaid actions, so failed requests surface feedback instead of failing silently and rapid double-clicks can't fire duplicate requests.

**Architecture:** Client-only change to a single component, `app/dashboard/PendingOrdersDashboard.tsx`. A new `rowState: Record<string, { submitting: boolean; error: string | null }>` piece of state tracks in-flight/error status per order id, alongside the existing `orders` state. No backend, route, or service changes — `lib/orderService.ts` and the `/confirm`/`/pay` routes are untouched.

**Tech Stack:** Next.js client component (`'use client'`), React `useState`/`useEffect`, Vitest + `@testing-library/react` (fake timers, `fireEvent`), existing `apiClient`/`ApiError` from `lib/apiClient.ts`.

## Global Constraints

- No changes to `lib/orderService.ts`, `app/api/orders/[id]/confirm/route.ts`, or `app/api/orders/[id]/pay/route.ts` — per the spec's scope boundary, these already satisfy every Story 8 acceptance criterion.
- Confirm requires a native `window.confirm('Confirm order #<orderNumber>?')` gate; Mark Paid/Unpaid do not.
- Errors render as `<p role="alert">{message}</p>`, scoped per order row — not a global banner. Fallback text for non-`ApiError` failures: `'Something went wrong. Please try again.'` (matches `app/order/Cart.tsx`'s existing convention).
- Buttons in a row (`Confirm`, `Mark Paid`/`Mark Unpaid`) are `disabled` while that row's action is in flight.
- The existing "Mark Unpaid" hidden-for-staff behavior and optimistic removal-on-confirm-success behavior are unchanged.

---

### Task 1: Confirm flow — dialog gate, submitting/error state, inline error

**Files:**

- Modify: `app/dashboard/PendingOrdersDashboard.tsx`
- Test: `app/dashboard/PendingOrdersDashboard.test.tsx`

**Interfaces:**

- Consumes: `apiClient.patch<T>(path: string, body: unknown): Promise<T>` and `ApiError` (has `.message: string`) from `lib/apiClient.ts` (both already exist and are already imported/used in this codebase, e.g. `app/order/Cart.tsx`).
- Produces: a `RowState = { submitting: boolean; error: string | null }` type and `rowState: Record<string, RowState>` state var in `PendingOrdersDashboard`, which Task 2 also reads/writes for the pay flow. Also produces a module-level `errorMessage(err: unknown): string` helper that Task 2 reuses.

- [ ] **Step 1: Update the existing Confirm-success test to mock `window.confirm`**

Replace the existing test in `app/dashboard/PendingOrdersDashboard.test.tsx` (currently starting at `it('confirms an order and removes it from the list on success'...`) with:

```ts
  it('confirms an order and removes it from the list on success', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.mocked(apiClient.patch).mockResolvedValue({ ...orderA, fulfillmentStatus: 'Confirmed' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })

    expect(window.confirm).toHaveBeenCalledWith('Confirm order #101?')
    expect(apiClient.patch).toHaveBeenCalledWith('/api/orders/o1/confirm', {})
    expect(screen.queryByText('#101')).not.toBeInTheDocument()
    expect(screen.getByText('No pending orders')).toBeInTheDocument()
  })
```

This is the only edit to an existing test in this task — it now asserts `window.confirm` is called with the expected message, and mocks it to return `true` so the click still proceeds to call the API (this will fail until Step 5's implementation adds the `window.confirm` gate, since right now `window.confirm` is never called so the `toHaveBeenCalledWith` assertion fails).

- [ ] **Step 2: Add new failing tests for the cancel, error, and disabled-while-submitting cases**

Insert these three tests immediately after the test from Step 1 (still inside the `describe('PendingOrdersDashboard', ...)` block):

```ts
  it('does not call the confirm API when the confirm dialog is cancelled', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })

    expect(apiClient.patch).not.toHaveBeenCalled()
    expect(screen.getByText('#101')).toBeInTheDocument()
  })

  it('shows an inline error and re-enables the Confirm button when confirming fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('CONFLICT', 'Order is Confirmed, not Pending'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Order is Confirmed, not Pending')
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled()
  })

  it('disables the Confirm button while the request is in flight', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let resolvePatch: (value: unknown) => void = () => {}
    vi.mocked(apiClient.patch).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve
      }),
    )
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    await act(async () => {
      resolvePatch({ ...orderA, fulfillmentStatus: 'Confirmed' })
      await Promise.resolve()
    })
  })
```

Also add `ApiError` to the top-of-file import so the new error test can construct one:

```ts
import { apiClient, ApiError } from "@/lib/apiClient";
```

(This replaces the current `import { apiClient } from '@/lib/apiClient'` line.)

- [ ] **Step 2b: Run tests to verify they fail**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`

Expected: FAIL — the Step-1 test fails on the `toHaveBeenCalledWith` assertion for `window.confirm` (never called), the cancel test fails because `apiClient.patch` IS called (no gate exists yet), the error test fails because `screen.getByRole('alert')` finds nothing, and the disabled test fails because the button has no `disabled` attribute.

- [ ] **Step 3: Implement the `RowState` type, `errorMessage` helper, and updated `handleConfirm`**

Replace the full contents of `app/dashboard/PendingOrdersDashboard.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/apiClient";
import type { Role } from "@/lib/types";

const POLL_INTERVAL_MS = 3500;

type PendingOrderItem = {
  id: string;
  nameSnapshot: string;
  priceSnapshot: string;
  quantity: number;
};

type PendingOrder = {
  id: string;
  orderNumber: number;
  createdAt: string;
  paymentStatus: "Unpaid" | "Paid";
  table: { number: number };
  items: PendingOrderItem[];
};

type RowState = { submitting: boolean; error: string | null };

const EMPTY_ROW_STATE: RowState = { submitting: false, error: null };

function formatTimeAgo(createdAt: string): string {
  const elapsedMinutes = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / 60000,
  );
  return elapsedMinutes < 1 ? "just now" : `${elapsedMinutes} min ago`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : "Something went wrong. Please try again.";
}

export function PendingOrdersDashboard({ role }: { role: Role }) {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const result = await apiClient.get<PendingOrder[]>(
          "/api/orders?status=pending",
        );
        if (!cancelled) setOrders(result);
      } catch {
        // Transient poll failure: keep the last-known list, retry next tick.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleConfirm(order: PendingOrder) {
    if (!window.confirm(`Confirm order #${order.orderNumber}?`)) return;

    setRowState((current) => ({
      ...current,
      [order.id]: { submitting: true, error: null },
    }));
    try {
      await apiClient.patch(`/api/orders/${order.id}/confirm`, {});
      setOrders((current) => current.filter((o) => o.id !== order.id));
      setRowState((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
    } catch (err) {
      setRowState((current) => ({
        ...current,
        [order.id]: { submitting: false, error: errorMessage(err) },
      }));
    }
  }

  async function handleSetPaymentStatus(
    orderId: string,
    paymentStatus: "Paid" | "Unpaid",
  ) {
    const updated = await apiClient.patch<PendingOrder>(
      `/api/orders/${orderId}/pay`,
      { paymentStatus },
    );
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, paymentStatus: updated.paymentStatus }
          : order,
      ),
    );
  }

  if (orders.length === 0) {
    return <p>No pending orders</p>;
  }

  return (
    <ul aria-label="Pending orders">
      {orders.map((order) => {
        const { submitting, error } = rowState[order.id] ?? EMPTY_ROW_STATE;
        return (
          <li key={order.id} aria-label={`Order ${order.orderNumber}`}>
            <span>Table {order.table.number}</span>
            <span>#{order.orderNumber}</span>
            <span>{formatTimeAgo(order.createdAt)}</span>
            <ul>
              {order.items.map((item) => (
                <li key={item.id}>
                  {item.quantity}x {item.nameSnapshot}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleConfirm(order)}
            >
              Confirm
            </button>
            {order.paymentStatus === "Unpaid" ? (
              <button
                type="button"
                onClick={() => handleSetPaymentStatus(order.id, "Paid")}
              >
                Mark Paid
              </button>
            ) : role === "admin" ? (
              <button
                type="button"
                onClick={() => handleSetPaymentStatus(order.id, "Unpaid")}
              >
                Mark Unpaid
              </button>
            ) : (
              <span>Paid</span>
            )}
            {error && <p role="alert">{error}</p>}
          </li>
        );
      })}
    </ul>
  );
}
```

Note `handleSetPaymentStatus` is intentionally left unchanged from its pre-Task-1 form here — Task 2 gives it the same `rowState` treatment. `ApiError` must be exported from `lib/apiClient.ts` already (it is, per its existing `export class ApiError`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`

Expected: PASS — all tests including the 3 new ones and the updated Confirm-success test.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx`

Expected: no errors from either command.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx
git commit -m "$(cat <<'EOF'
Add confirm dialog gate and per-row error/submitting state to Confirm action

A failed confirm PATCH (e.g. a 409 from a race with another staff member)
previously rejected silently with no UI feedback. Confirming also now
requires an explicit window.confirm() since it locks the order from
further edits.
EOF
)"
```

---

### Task 2: Pay flow — submitting/error state on Mark Paid/Unpaid

**Files:**

- Modify: `app/dashboard/PendingOrdersDashboard.tsx`
- Test: `app/dashboard/PendingOrdersDashboard.test.tsx`

**Interfaces:**

- Consumes: `RowState`, `rowState`/`setRowState`, and `errorMessage()` produced by Task 1 in the same file.
- Produces: no new exports — this is the final state of `handleSetPaymentStatus` and its buttons; no later task depends on anything new here.

- [ ] **Step 1: Add new failing tests for the pay flow's error and disabled states**

Insert these two tests after the `it('allows an admin to revert a Paid order back to Unpaid'...)` test (the last test in the file, still inside the `describe` block):

```ts
  it('shows an inline error and re-enables the button when marking Paid fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('NOT_FOUND', 'Order not found'))
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Order not found')
    expect(screen.getByRole('button', { name: 'Mark Paid' })).not.toBeDisabled()
  })

  it('disables the Mark Paid button while the request is in flight and clears a prior error on success', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([orderA])
    let rejectFirst: (err: unknown) => void = () => {}
    vi.mocked(apiClient.patch).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirst = reject
      }),
    )
    render(<PendingOrdersDashboard role="staff" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()

    await act(async () => {
      rejectFirst(new ApiError('NOT_FOUND', 'Order not found'))
      await Promise.resolve()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Order not found')

    vi.mocked(apiClient.patch).mockResolvedValueOnce({ ...orderA, paymentStatus: 'Paid' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }))
      await Promise.resolve()
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`

Expected: FAIL — both new tests fail because `handleSetPaymentStatus` doesn't touch `rowState` yet, so no `alert` role ever appears and the button is never disabled.

- [ ] **Step 3: Update `handleSetPaymentStatus` to use `rowState`**

In `app/dashboard/PendingOrdersDashboard.tsx`, replace the `handleSetPaymentStatus` function with:

```tsx
async function handleSetPaymentStatus(
  orderId: string,
  paymentStatus: "Paid" | "Unpaid",
) {
  setRowState((current) => ({
    ...current,
    [orderId]: { submitting: true, error: null },
  }));
  try {
    const updated = await apiClient.patch<PendingOrder>(
      `/api/orders/${orderId}/pay`,
      { paymentStatus },
    );
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, paymentStatus: updated.paymentStatus }
          : order,
      ),
    );
    setRowState((current) => ({
      ...current,
      [orderId]: { submitting: false, error: null },
    }));
  } catch (err) {
    setRowState((current) => ({
      ...current,
      [orderId]: { submitting: false, error: errorMessage(err) },
    }));
  }
}
```

And update both payment-toggle buttons in the JSX to disable while submitting:

```tsx
{
  order.paymentStatus === "Unpaid" ? (
    <button
      type="button"
      disabled={submitting}
      onClick={() => handleSetPaymentStatus(order.id, "Paid")}
    >
      Mark Paid
    </button>
  ) : role === "admin" ? (
    <button
      type="button"
      disabled={submitting}
      onClick={() => handleSetPaymentStatus(order.id, "Unpaid")}
    >
      Mark Unpaid
    </button>
  ) : (
    <span>Paid</span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/dashboard/PendingOrdersDashboard.test.tsx`

Expected: PASS — full file, all tests (original + Task 1's 3 new + Task 2's 2 new).

- [ ] **Step 5: Run the full project test suite, typecheck, and lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx`

Expected: all 3 commands exit clean (0 failing tests project-wide, no type errors, no lint errors).

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx
git commit -m "$(cat <<'EOF'
Add per-row error/submitting state to Mark Paid/Unpaid actions

Reuses the rowState infrastructure added for Confirm so a failed pay
PATCH surfaces an inline error and disables the button mid-flight,
instead of failing silently.
EOF
)"
```

---

### Task 3: Update BUILD_STATUS.md gotchas log (if anything surprising surfaced)

**Files:**

- Modify: `BUILD_STATUS.md`

**Interfaces:**

- Consumes: nothing code-level — this is a documentation-only step.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Review whether Tasks 1–2 hit anything non-obvious worth logging**

If, while implementing Tasks 1–2, something in this codebase behaved unexpectedly and cost real debugging time (per `CLAUDE.md`'s "Maintaining BUILD_STATUS.md" instruction — the gotchas log is for exactly this), add one bullet to the `## Gotchas log` section of `BUILD_STATUS.md` describing it and the fix. If nothing surprising came up (the pattern of controllable-promise tests and row-scoped state should be a mechanical follow of this plan), skip this step — do not invent a gotcha to fill it.

- [ ] **Step 2: Commit (only if Step 1 made a change)**

```bash
git add BUILD_STATUS.md
git commit -m "Log a gotcha from the Story 8 confirm/pay UX follow-up"
```
