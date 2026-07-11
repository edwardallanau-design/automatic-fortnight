# Payment Choice UX Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a real gap (no QR upload at payment-method creation) and redesign the customer "pay online" picker and staff dashboard payment display, using this app's existing design tokens — no new colors/fonts, no data-model or API changes.

**Architecture:** Presentation-layer only. Reuses `--sage` (already the "Mark Paid" color, now also the payment-info accent), `--copper`/`--copper-bright` (existing CTA/selection accent), `--font-display` (existing heading serif), `--font-mono` (existing convention for prices/reference numbers). No changes to `orderService`, `paymentMethodService`, API routes, or the `Order`/`PaymentMethod` schema.

**Tech Stack:** Next.js 16 (App Router), Vitest 4 + Testing Library — same stack as the rest of this codebase.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-07-10-payment-choice-ux-revision-design.md` (approved).
- No changes to `INV-11`, `INV-12`, the payment-choice gate condition, `paymentStatus`/`INV-8`/`INV-9`, or any API route — this is CSS/JSX only, touching existing components.
- No co-author trailer in commit messages.
- The visually-hidden native `<input type="radio">` pattern must be preserved for the payment-method cards (not replaced with `<div role="radio">`) — this keeps native keyboard/screen-reader radio-group behavior for free; only its visual presentation changes.
- Reuse the existing `.slider-toggle__input`-style visually-hidden-input CSS technique (`position: absolute; opacity: 0; width: 1px; height: 1px;`) rather than `display: none` (which would break focus/keyboard access).
- `color-mix(in srgb, var(--X) N%, var(--paper))` is the established pattern for tinted backgrounds in this codebase (see `.menu-admin-row__badge`) — reuse it, don't hand-roll new rgba values.

---

### Task 1: Admin form — QR upload at creation + view-mode account-info fix

**Files:**
- Create: `app/admin/payment-methods/toBase64.ts`
- Modify: `app/admin/payment-methods/CreatePaymentMethodForm.tsx`
- Modify: `app/admin/payment-methods/CreatePaymentMethodForm.test.tsx`
- Modify: `app/admin/payment-methods/PaymentMethodRow.tsx`
- Modify: `app/admin/payment-methods/PaymentMethodRow.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `toBase64(file: File): Promise<string>` — extracted shared helper, imported by both components (removes the existing duplicate definition in `PaymentMethodRow.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `app/admin/payment-methods/toBase64.ts` is implementation, not test — skip to writing test changes first per TDD.

In `app/admin/payment-methods/CreatePaymentMethodForm.test.tsx`, update the `vi.mock('@/lib/apiClient', ...)` block to also mock `patch` (needed for the second call). Change:

```tsx
vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } }
})
```

to:

```tsx
vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn(), patch: vi.fn() } }
})
```

Add this new test to the `describe('CreatePaymentMethodForm', ...)` block:

```tsx
  it('uploads a QR image after creating, via a second PATCH call', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: null })
    vi.mocked(apiClient.patch).mockResolvedValue({})
    const user = userEvent.setup()
    render(<CreatePaymentMethodForm />)

    const file = new File(['fake-image-content'], 'qr.png', { type: 'image/png' })
    await user.type(screen.getByLabelText('Name'), 'GCash')
    await user.upload(screen.getByLabelText('QR image (optional)'), file)
    await user.click(screen.getByRole('button', { name: 'Add payment method' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/payment-methods', { name: 'GCash', accountInfo: '' })
    expect(apiClient.patch).toHaveBeenCalledWith('/api/payment-methods/p1', { qrImage: expect.stringMatching(/^data:image\/png;base64,/) })
    expect(refresh).toHaveBeenCalled()
  })

  it('does not call PATCH when no QR image was selected', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: null })
    const user = userEvent.setup()
    render(<CreatePaymentMethodForm />)

    await user.type(screen.getByLabelText('Name'), 'GCash')
    await user.click(screen.getByRole('button', { name: 'Add payment method' }))

    expect(apiClient.patch).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })
```

In `app/admin/payment-methods/PaymentMethodRow.test.tsx`, add this new test to the `describe('PaymentMethodRow', ...)` block:

```tsx
  it('shows the account info in view mode', () => {
    renderRow()
    expect(screen.getByText('0917x')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run app/admin/payment-methods
```

Expected: FAIL — `apiClient.patch` isn't called yet (CreatePaymentMethodForm doesn't do a second call), and the account-info-in-view-mode test can't find "0917x" text (not rendered in view mode yet).

- [ ] **Step 3: Write the implementation**

Create `app/admin/payment-methods/toBase64.ts`:

```ts
export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
```

Replace `app/admin/payment-methods/CreatePaymentMethodForm.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { toBase64 } from './toBase64'

export function CreatePaymentMethodForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [accountInfo, setAccountInfo] = useState('')
  const [pendingQrImage, setPendingQrImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleQrImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setPendingQrImage(await toBase64(file))
    } catch {
      setError('Could not read that image. Please try a different file.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const created = await apiClient.post<{ id: string }>('/api/payment-methods', { name, accountInfo })
      if (pendingQrImage) {
        await apiClient.patch(`/api/payment-methods/${created.id}`, { qrImage: pendingQrImage })
      }
      setName('')
      setAccountInfo('')
      setPendingQrImage(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-panel__form">
      <div>
        <label htmlFor="pm-name" className="admin-panel__label">
          Name
        </label>
        <input
          id="pm-name"
          type="text"
          className="admin-panel__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="pm-account-info" className="admin-panel__label">
          Account / wallet number (optional)
        </label>
        <input
          id="pm-account-info"
          type="text"
          className="admin-panel__input"
          value={accountInfo}
          onChange={(e) => setAccountInfo(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="pm-qr-image" className="admin-panel__label">
          QR image (optional)
        </label>
        <input
          id="pm-qr-image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleQrImageChange}
        />
      </div>
      <button type="submit" className="admin-panel__submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add payment method'}
      </button>
      {error && (
        <p role="alert" className="admin-panel__error">
          {error}
        </p>
      )}
    </form>
  )
}
```

In `app/admin/payment-methods/PaymentMethodRow.tsx`, remove the local `toBase64` function (lines 16-23 in the current file — the `function toBase64(file: File): Promise<string> { ... }` block) and its now-unused nothing else changes there; add the import instead. Change:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type PaymentMethodRowProps = {
  id: string
  name: string
  accountInfo: string | null
  qrImageUrl: string | null
  active: boolean
  editable: boolean
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
```

to:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { toBase64 } from './toBase64'

type PaymentMethodRowProps = {
  id: string
  name: string
  accountInfo: string | null
  qrImageUrl: string | null
  active: boolean
  editable: boolean
}
```

Then, in the same file's view-mode return block, change:

```tsx
  if (!editable || !isEditing) {
    return (
      <li className="payment-method-admin-row">
        <div className="payment-method-admin-row__view">
          {qrImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImageUrl} alt={`${name} QR code`} className="payment-method-admin-row__qr-preview" />
          )}
          <span className="payment-method-admin-row__name">{name}</span>
          {activeToggle}
          {editable && (
            <button type="button" className="payment-method-admin-row__edit" onClick={startEditing}>
              Edit
            </button>
          )}
        </div>
        {activeError && (
          <p role="alert" className="payment-method-admin-row__error">
            {activeError}
          </p>
        )}
      </li>
    )
  }
```

to:

```tsx
  if (!editable || !isEditing) {
    return (
      <li className="payment-method-admin-row">
        <div className="payment-method-admin-row__view">
          {qrImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImageUrl} alt={`${name} QR code`} className="payment-method-admin-row__qr-preview" />
          )}
          <div className="payment-method-admin-row__info">
            <span className="payment-method-admin-row__name">{name}</span>
            {accountInfo && <span className="payment-method-admin-row__account">{accountInfo}</span>}
          </div>
          {activeToggle}
          {editable && (
            <button type="button" className="payment-method-admin-row__edit" onClick={startEditing}>
              Edit
            </button>
          )}
        </div>
        {activeError && (
          <p role="alert" className="payment-method-admin-row__error">
            {activeError}
          </p>
        )}
      </li>
    )
  }
```

In `app/globals.css`, change the `.payment-method-admin-row__name` rule from:

```css
.payment-method-admin-row__name {
  flex: 1;
  font-weight: 500;
}
```

to:

```css
.payment-method-admin-row__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0.15rem;
}

.payment-method-admin-row__name {
  font-weight: 500;
}

.payment-method-admin-row__account {
  font-family: var(--font-mono), monospace;
  font-size: 0.8rem;
  color: var(--clay);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/admin/payment-methods
npx tsc --noEmit
npm run lint
```

Expected: all tests PASS (including every pre-existing test in this directory), no type errors, no new lint issues.

- [ ] **Step 5: Commit**

```bash
git add app/admin/payment-methods app/globals.css
git commit -m "fix: add QR image upload to payment-method creation, show accountInfo in view mode"
```

---

### Task 2: Customer picker — QR-first enlarged card redesign

**Files:**
- Modify: `app/order/[id]/PaymentChoicePicker.tsx`
- Modify: `app/order/[id]/PaymentChoicePicker.test.tsx`
- Modify: `app/globals.css`

**Interfaces:** None new — same `PaymentChoicePicker({orderId, paymentMethods})` props and behavior; only markup/CSS change.

- [ ] **Step 1: Write the failing test**

Add this new test to `app/order/[id]/PaymentChoicePicker.test.tsx`'s `describe('PaymentChoicePicker', ...)` block:

```tsx
  it('marks the selected method with a selected class', async () => {
    const user = userEvent.setup()
    render(<PaymentChoicePicker orderId="o1" paymentMethods={methods} />)

    await user.click(screen.getByRole('button', { name: 'Pay online' }))
    await user.click(screen.getByText('GCash'))

    const gcashLabel = screen.getByText('GCash').closest('label')
    expect(gcashLabel).toHaveClass('payment-choice__method--selected')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run app/order/\[id\]/PaymentChoicePicker.test.tsx
```

Expected: FAIL — no element currently has the `payment-choice__method--selected` class (radio-based selection has no such class today).

- [ ] **Step 3: Write the implementation**

In `app/order/[id]/PaymentChoicePicker.tsx`, change the online-mode `<div className="payment-choice__methods" ...>` block from:

```tsx
        <div className="payment-choice__methods" role="radiogroup" aria-label="Payment method">
          {paymentMethods.map((method) => (
            <label key={method.id} className="payment-choice__method">
              <input
                type="radio"
                name="paymentMethod"
                value={method.id}
                checked={selectedMethodId === method.id}
                onChange={() => setSelectedMethodId(method.id)}
              />
              <span className="payment-choice__method-name">{method.name}</span>
              {method.qrImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={method.qrImageUrl} alt={`${method.name} QR code`} className="payment-choice__qr" />
              )}
              {method.accountInfo && <span className="payment-choice__account">{method.accountInfo}</span>}
            </label>
          ))}
        </div>
```

to:

```tsx
        <div className="payment-choice__methods" role="radiogroup" aria-label="Payment method">
          {paymentMethods.map((method) => (
            <label
              key={method.id}
              className={`payment-choice__method${selectedMethodId === method.id ? ' payment-choice__method--selected' : ''}`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method.id}
                checked={selectedMethodId === method.id}
                onChange={() => setSelectedMethodId(method.id)}
                className="payment-choice__method-input"
              />
              {method.qrImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={method.qrImageUrl} alt={`${method.name} QR code`} className="payment-choice__qr" />
              )}
              <span className="payment-choice__method-name">{method.name}</span>
              {method.accountInfo && <span className="payment-choice__account">{method.accountInfo}</span>}
            </label>
          ))}
        </div>
```

(Note: `method.name` and `method.qrImageUrl` swapped order — QR now renders before the name, per the confirmed design.)

In `app/globals.css`, change the `.payment-choice` rule's `max-width` from:

```css
.payment-choice {
  width: 100%;
  max-width: 480px;
  margin: 2rem auto;
  padding: 0 1.25rem;
}
```

to:

```css
.payment-choice {
  width: 100%;
  max-width: 640px;
  margin: 2rem auto;
  padding: 0 1.25rem;
}
```

Change the `.payment-choice__methods` rule's `gap` from:

```css
.payment-choice__methods {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 1rem;
}
```

to:

```css
.payment-choice__methods {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
```

Replace the `.payment-choice__method` rule and everything through `.payment-choice__account` — change:

```css
.payment-choice__method {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  padding: 0.75rem;
  cursor: pointer;
}

.payment-choice__method-name {
  font-weight: 600;
}

.payment-choice__qr {
  width: 120px;
  height: 120px;
  object-fit: contain;
}

.payment-choice__account {
  font-family: var(--font-mono), monospace;
  font-size: 0.85rem;
  color: var(--clay);
}
```

to:

```css
.payment-choice__method {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  border: 2px solid var(--clay-faint);
  border-radius: 14px;
  padding: 1.5rem 1.25rem;
  cursor: pointer;
  background: var(--paper);
  text-align: center;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
}

.payment-choice__method:hover {
  border-color: var(--copper);
}

.payment-choice__method:focus-within {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.payment-choice__method:active {
  transform: scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .payment-choice__method:active {
    transform: none;
  }
}

.payment-choice__method--selected {
  border-color: var(--copper);
  background: color-mix(in srgb, var(--copper) 10%, var(--paper));
}

.payment-choice__method--selected::after {
  content: '✓';
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--copper);
  color: var(--paper);
  font-size: 0.85rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.payment-choice__method-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.payment-choice__method-name {
  font-family: var(--font-display), Georgia, serif;
  font-style: italic;
  font-weight: 600;
  font-size: 1.15rem;
  color: var(--espresso);
}

.payment-choice__qr {
  width: 100%;
  max-width: 200px;
  aspect-ratio: 1;
  object-fit: contain;
  background: var(--paper);
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  padding: 0.5rem;
}

.payment-choice__account {
  font-family: var(--font-mono), monospace;
  font-size: 0.85rem;
  color: var(--clay);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/order/\[id\]/PaymentChoicePicker.test.tsx
npx tsc --noEmit
npm run lint
```

Expected: all tests PASS (including every pre-existing test in this file — clicking on visible text still selects the underlying radio via native `<label>` behavior), no type errors, no new lint issues.

- [ ] **Step 5: Commit**

```bash
git add app/order/\[id\]/PaymentChoicePicker.tsx app/order/\[id\]/PaymentChoicePicker.test.tsx app/globals.css
git commit -m "feat: redesign payment-method picker as QR-first enlarged tap-to-select cards"
```

---

### Task 3: Staff dashboard — prominent payment-note callout

**Files:**
- Modify: `app/dashboard/OrderDetailModal.tsx`
- Modify: `app/dashboard/OrderDetailModal.test.tsx`
- Modify: `app/globals.css`

**Interfaces:** None new — same `OrderDetailModal` props; only markup/CSS change to the payment-note display.

- [ ] **Step 1: Write the failing tests**

In `app/dashboard/OrderDetailModal.test.tsx`, find the two existing tests asserting on the old combined-text format and change them. Change:

```tsx
  it('shows an Awaiting payment line for a Counter choice', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, paymentChoice: 'Counter' } })} />)

    expect(screen.getByText('Awaiting payment · Counter')).toBeInTheDocument()
  })

  it('shows a Paid line with method and reference once paymentStatus is Paid', () => {
    render(
      <OrderDetailModal
        {...baseProps({
          order: {
            ...pendingOrder,
            paymentStatus: 'Paid',
            paymentChoice: 'Online',
            paymentMethodNameSnapshot: 'GCash',
            paymentReference: 'TXN123',
          },
        })}
      />,
    )

    expect(screen.getByText('Paid · Online (GCash) · ref: TXN123')).toBeInTheDocument()
  })
```

to:

```tsx
  it('shows an Awaiting payment line for a Counter choice', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, paymentChoice: 'Counter' } })} />)

    expect(screen.getByText('Awaiting payment · Counter')).toBeInTheDocument()
  })

  it('shows a Paid label and a prominent reference line once paymentStatus is Paid', () => {
    render(
      <OrderDetailModal
        {...baseProps({
          order: {
            ...pendingOrder,
            paymentStatus: 'Paid',
            paymentChoice: 'Online',
            paymentMethodNameSnapshot: 'GCash',
            paymentReference: 'TXN123',
          },
        })}
      />,
    )

    expect(screen.getByText('Paid · Online (GCash)')).toBeInTheDocument()
    expect(screen.getByText('ref: TXN123')).toBeInTheDocument()
  })

  it('does not show a reference line for a Counter choice', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, paymentChoice: 'Counter' } })} />)

    expect(screen.queryByText(/^ref:/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run app/dashboard/OrderDetailModal.test.tsx
```

Expected: FAIL — the current single-line text `'Paid · Online (GCash) · ref: TXN123'` doesn't match the two-piece assertion yet.

- [ ] **Step 3: Write the implementation**

In `app/dashboard/OrderDetailModal.tsx`, change:

```tsx
        {order.paymentChoice !== 'None' && (
          <p className="order-detail-modal__payment-note">
            {order.paymentStatus === 'Paid' ? 'Paid' : 'Awaiting payment'} ·{' '}
            {order.paymentChoice === 'Counter'
              ? 'Counter'
              : `Online (${order.paymentMethodNameSnapshot}) · ref: ${order.paymentReference}`}
          </p>
        )}
```

to:

```tsx
        {order.paymentChoice !== 'None' && (
          <div className="order-detail-modal__payment-note">
            <span className="order-detail-modal__payment-note-label">
              {order.paymentStatus === 'Paid' ? 'Paid' : 'Awaiting payment'} ·{' '}
              {order.paymentChoice === 'Counter' ? 'Counter' : `Online (${order.paymentMethodNameSnapshot})`}
            </span>
            {order.paymentChoice === 'Online' && (
              <span className="order-detail-modal__payment-note-reference">ref: {order.paymentReference}</span>
            )}
          </div>
        )}
```

In `app/globals.css`, change the `.order-detail-modal__payment-note` rule from:

```css
.order-detail-modal__payment-note {
  font-family: var(--font-mono), monospace;
  font-size: 0.8rem;
  color: var(--sage);
  margin-bottom: 0.75rem;
}
```

to:

```css
.order-detail-modal__payment-note {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  border-left: 4px solid var(--sage);
  background: color-mix(in srgb, var(--sage) 8%, var(--paper));
  padding: 0.6rem 0.85rem;
  border-radius: 0 8px 8px 0;
  margin-bottom: 0.75rem;
}

.order-detail-modal__payment-note-label {
  font-family: var(--font-mono), monospace;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sage);
}

.order-detail-modal__payment-note-reference {
  font-family: var(--font-mono), monospace;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--espresso);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/dashboard/OrderDetailModal.test.tsx
npx tsc --noEmit
npm run lint
```

Expected: all tests PASS (including every pre-existing test in this file), no type errors, no new lint issues.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/OrderDetailModal.tsx app/dashboard/OrderDetailModal.test.tsx app/globals.css
git commit -m "feat: make the staff dashboard payment-note callout visually prominent"
```

---

### Task 4: Final verification and BUILD_STATUS note

**Files:**
- Modify: `BUILD_STATUS.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update BUILD_STATUS.md**

Find Story 19's row (added by the original Story 19 plan) and append a short note about this revision to its existing Notes cell — do not create a new row; this is a same-story follow-up, not a new story. Append to the end of that row's notes (after the existing text, before the closing `|`):

```markdown
 UX revision 2026-07-10: fixed a real gap (no QR upload at payment-method creation, only via Edit) and redesigned the customer "pay online" cards (QR-first, enlarged, tap-to-select) and the staff dashboard's payment-note display (prominent accent callout) — presentation-layer only, no data/API changes. Spec: docs/superpowers/specs/2026-07-10-payment-choice-ux-revision-design.md · Plan: docs/superpowers/plans/2026-07-10-payment-choice-ux-revision.md
```

- [ ] **Step 2: Full verification**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

Expected: entire test suite passes, no type errors, no new lint issues (pre-existing lint debt in `Cart.tsx`/`OrderHeaderTitle.tsx`/`PendingOrdersDashboard.tsx` is untouched by this plan and not a regression).

- [ ] **Step 3: Commit**

```bash
git add BUILD_STATUS.md
git commit -m "docs: record payment-choice UX revision in BUILD_STATUS"
```

## Post-plan manual verification (not automatable)

The visual redesign (card layout, colors, spacing) should be eyeballed in a real browser via `docker compose up --build` before considering this fully done — Vitest/jsdom tests verify behavior and class names, not actual visual appearance. Check: the QR-first card reads clearly on a mobile-width viewport, the selected-card checkmark badge doesn't overlap the QR image, and the dashboard callout's accent color reads correctly in both light and dark mode (this app supports `prefers-color-scheme: dark` — `--sage`/`--paper`/`--espresso` all have dark-mode overrides in `globals.css`, so no new dark-mode CSS should be needed, but worth confirming visually).
