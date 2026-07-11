# Admin Pages UI/UX (Story 15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `app/login/page.tsx`, `app/admin/tables/page.tsx`, and `app/admin/menu-items/page.tsx` from unstyled placeholder markup to the app's established café-ticket visual language, and give Menu Management rows an edit-toggle + confirm-on-Archive.

**Architecture:** Pure presentational restyle (plain BEM classes appended to `app/globals.css`, reusing only existing design tokens) plus one new interaction pattern in `MenuItemRow` (local `isEditing` state gating read-only vs. editable rendering, and a `ConfirmDialog`-gated Archive action mirroring the pattern already used in `OrderTicket.tsx`).

**Tech Stack:** Next.js App Router, React 19, plain CSS in `app/globals.css` (no CSS Modules/Tailwind), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-09-admin-pages-uiux-design.md`

## Global Constraints

- Only these existing CSS custom properties may be used: `--espresso`, `--crema`, `--paper`, `--copper`, `--copper-bright`, `--sage`, `--clay`, `--clay-faint`, `--danger`. No new colors.
- Only these existing font vars: `--font-display` (Fraunces italic, fallback `Georgia, serif`), `--font-body` (Inter, fallback `Arial, Helvetica, sans-serif`), `--font-mono` (JetBrains Mono, fallback `monospace`). No new fonts.
- No new npm dependencies.
- All interactive elements: `min-height: 44px` (or `min-width` for icon-only controls).
- All focus-visible states: `outline: 2px solid var(--copper-bright); outline-offset: 2px;`.
- All validation/error text: `role="alert"`, color `var(--danger)`.
- Any new CSS animation must be wrapped in `@media (prefers-reduced-motion: reduce)` with the animation disabled.
- Plain page-scoped BEM classes appended to `app/globals.css`, following the file's existing section-comment structure. No CSS Modules, no Tailwind, no new shared utility layer.
- Except where a task explicitly states new behavior (Menu Management empty states, edit-toggle, confirm-on-Archive), no `useState`/handler/API-call logic changes — this is a restyle.

---

### Task 1: Login page restyle

**Files:**
- Modify: `app/globals.css` (append after the last existing rule, i.e. after the Staff bar section ending around line 1901)
- Modify: `app/login/page.tsx`
- Test: `app/login/page.test.tsx` (no changes expected — run to verify no regression)

**Interfaces:**
- Consumes: nothing new.
- Produces: `.login-page`, `.login-card`, `.login-card__eyebrow`, `.login-card__title`, `.login-card__label`, `.login-card__input`, `.login-card__submit`, `.login-card__error` — not consumed by any other task.

- [ ] **Step 1: Append Login page CSS to `app/globals.css`**

Add this block at the end of the file:

```css

/* Login page */

.login-page {
  min-height: 100%;
  width: 100%;
  background: var(--crema);
  color: var(--espresso);
  font-family: var(--font-body), Arial, Helvetica, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.login-card {
  width: 100%;
  max-width: 360px;
  background: var(--paper);
  border: 1px solid var(--clay-faint);
  border-top: 3px solid var(--copper);
  border-radius: 12px;
  padding: 1.75rem 1.5rem;
  box-shadow: 0 8px 24px var(--clay-faint);
}

.login-card__eyebrow {
  display: block;
  font-family: var(--font-mono), monospace;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--copper);
  margin-bottom: 0.35rem;
}

.login-card__title {
  font-family: var(--font-display), Georgia, serif;
  font-style: italic;
  font-weight: 600;
  font-size: 1.6rem;
  margin-bottom: 1.25rem;
}

.login-card__label {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.35rem;
}

.login-card__input {
  width: 100%;
  min-height: 44px;
  padding: 0 0.75rem;
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.95rem;
  color: var(--espresso);
  background: none;
  margin-bottom: 1.25rem;
}

.login-card__input:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.login-card__submit {
  width: 100%;
  min-height: 48px;
  border: none;
  border-radius: 10px;
  background: var(--copper);
  color: var(--paper);
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.login-card__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-card__submit:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.login-card__error {
  margin-top: 1rem;
  color: var(--danger);
  font-size: 0.9rem;
}
```

- [ ] **Step 2: Restyle `app/login/page.tsx`**

Replace the full file with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/auth/login', { password })
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setError('Incorrect password')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <span className="login-card__eyebrow">Staff Access</span>
        <h1 className="login-card__title">Welcome back</h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="password" className="login-card__label">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="login-card__input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="login-card__submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
          {error && (
            <p role="alert" className="login-card__error">
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  )
}
```

Note: only `className` attributes and JSX structure changed. `password`/`error`/`submitting` state and `handleSubmit` logic are byte-identical to the original.

- [ ] **Step 3: Run the existing test file to confirm no regression**

Run: `npx vitest run app/login/page.test.tsx`
Expected: PASS (2 tests) — the tests query by `getByLabelText('Password')`, `getByRole('button', { name: 'Log in' })`, and `getByRole('alert')`, none of which depend on class names.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/login/page.tsx
git commit -m "style: restyle login page to match app's visual language"
```

---

### Task 2: Table Setup restyle (shared admin chrome + empty state)

**Files:**
- Modify: `app/globals.css`
- Modify: `app/admin/tables/page.tsx`
- Modify: `app/admin/tables/CreateTableForm.tsx`
- Modify: `app/admin/tables/page.test.tsx` (add one new test)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `.admin-page`, `.admin-header`, `.admin-header__eyebrow`, `.admin-header__title`, `.admin-panel`, `.admin-panel__form`, `.admin-panel__label`, `.admin-panel__input`, `.admin-panel__submit`, `.admin-panel__error`, `.admin-empty` — all reused by Task 3 (Menu Management). Also produces `.table-grid`, `.table-qr-card*` (Table-Setup-specific, not reused elsewhere).

- [ ] **Step 1: Append shared admin-chrome CSS + Table Setup CSS to `app/globals.css`**

Add this block at the end of the file (after Task 1's Login block):

```css

/* Shared admin chrome (Table Setup + Menu Management) */

.admin-page {
  min-height: 100%;
  width: 100%;
  background: var(--crema);
  color: var(--espresso);
  font-family: var(--font-body), Arial, Helvetica, sans-serif;
  padding-bottom: 3rem;
}

.admin-header {
  background: var(--espresso);
  color: var(--crema);
  padding: 1.5rem 1.5rem 1.75rem;
  border-bottom: 3px solid var(--copper);
}

.admin-header__eyebrow {
  display: block;
  font-family: var(--font-mono), monospace;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--copper-bright);
  margin-bottom: 0.35rem;
}

.admin-header__title {
  font-family: var(--font-display), Georgia, serif;
  font-style: italic;
  font-weight: 600;
  font-size: 1.9rem;
  line-height: 1.1;
}

.admin-panel {
  width: 100%;
  max-width: 640px;
  margin: 1.5rem auto 0;
  padding: 0 1.5rem;
}

.admin-panel__form {
  background: var(--paper);
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.admin-panel__label {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.35rem;
}

.admin-panel__input {
  width: 100%;
  min-height: 44px;
  padding: 0 0.75rem;
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.95rem;
  color: var(--espresso);
  background: none;
}

.admin-panel__input:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.admin-panel__submit {
  align-self: flex-start;
  min-height: 44px;
  padding: 0 1.25rem;
  border: none;
  border-radius: 8px;
  background: var(--copper);
  color: var(--paper);
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
}

.admin-panel__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-panel__submit:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.admin-panel__error {
  color: var(--danger);
  font-size: 0.9rem;
}

.admin-empty {
  max-width: 640px;
  margin: 1.5rem auto 0;
  padding: 0 1.5rem;
  color: var(--clay);
  font-size: 0.95rem;
}

/* Table Setup */

.table-grid {
  list-style: none;
  width: 100%;
  max-width: 900px;
  margin: 1.5rem auto 0;
  padding: 0 1.5rem 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.table-qr-card {
  background: var(--paper);
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  text-align: center;
}

.table-qr-card__title {
  font-family: var(--font-display), Georgia, serif;
  font-weight: 600;
  font-size: 1.15rem;
}

.table-qr-card__image {
  border-radius: 6px;
  border: 1px solid var(--clay-faint);
}

.table-qr-card__url {
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  color: var(--clay);
  word-break: break-all;
  user-select: all;
}
```

- [ ] **Step 2: Restyle `app/admin/tables/page.tsx` and add the empty state**

Replace the full file with:

```tsx
import { headers } from 'next/headers'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'
import { generateQrDataUrl } from '@/lib/qrCode'
import { CreateTableForm } from './CreateTableForm'

export default async function AdminTablesPage() {
  await requireRole('admin')

  const tables = await listTables()
  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const origin = `${protocol}://${host}`

  const tablesWithQr = await Promise.all(
    tables.map(async (table) => {
      const orderUrl = `${origin}/order?table=${table.id}`
      const qrDataUrl = await generateQrDataUrl(orderUrl)
      return { ...table, orderUrl, qrDataUrl }
    }),
  )

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Table Setup</h1>
      </header>
      <div className="admin-panel">
        <CreateTableForm />
      </div>
      {tablesWithQr.length === 0 ? (
        <p className="admin-empty">No tables yet — add one above.</p>
      ) : (
        <ul className="table-grid">
          {tablesWithQr.map((table) => (
            <li key={table.id} className="table-qr-card">
              <p className="table-qr-card__title">Table {table.number}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
              <img
                src={table.qrDataUrl}
                alt={`QR code for table ${table.number}`}
                width={160}
                height={160}
                className="table-qr-card__image"
              />
              <p className="table-qr-card__url">{table.orderUrl}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Restyle `app/admin/tables/CreateTableForm.tsx`**

Replace the full file with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function CreateTableForm() {
  const router = useRouter()
  const [number, setNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/tables', { number: Number(number) })
      setNumber('')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setError('A table with that number already exists')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-panel__form">
      <div>
        <label htmlFor="number" className="admin-panel__label">
          Table number
        </label>
        <input
          id="number"
          type="number"
          className="admin-panel__input"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="admin-panel__submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add table'}
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

- [ ] **Step 4: Write the failing test for the empty state**

In `app/admin/tables/page.test.tsx`, add this test inside the existing `describe('AdminTablesPage', ...)` block, after the `'is gated behind an admin session'` test:

```tsx
  it('shows an empty state when there are no tables', async () => {
    const ui = await AdminTablesPage()
    render(ui)

    expect(screen.getByText('No tables yet — add one above.')).toBeInTheDocument()
  })
```

- [ ] **Step 5: Run the test file to verify the new test fails, then passes**

Run: `npx vitest run app/admin/tables/page.test.tsx`
Expected before Step 2/3's code lands: this test is written against already-updated `page.tsx` from Step 2, so it should PASS immediately. Run it now to confirm all 4 tests (3 existing + 1 new) pass:

Run: `npx vitest run app/admin/tables/page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/admin/tables/page.tsx app/admin/tables/CreateTableForm.tsx app/admin/tables/page.test.tsx
git commit -m "style: restyle Table Setup page and add empty state"
```

---

### Task 3: Menu Management page shell restyle (empty state)

**Files:**
- Modify: `app/globals.css`
- Modify: `app/admin/menu-items/page.tsx`
- Modify: `app/admin/menu-items/CreateMenuItemForm.tsx`
- Modify: `app/admin/menu-items/page.test.tsx` (add one new test)

**Interfaces:**
- Consumes: `.admin-page`, `.admin-header*`, `.admin-panel*`, `.admin-empty` (from Task 2).
- Produces: `.menu-admin-list` (container only — row-level classes come in Task 4).

- [ ] **Step 1: Append Menu Management list-container CSS to `app/globals.css`**

Add this block at the end of the file (after Task 2's block):

```css

/* Menu Management */

.menu-admin-list {
  list-style: none;
  width: 100%;
  max-width: 640px;
  margin: 1.5rem auto 0;
  padding: 0 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
```

- [ ] **Step 2: Restyle `app/admin/menu-items/page.tsx` and add the empty state**

Replace the full file with:

```tsx
import { requireRole } from '@/lib/authGuard'
import { listMenuItems } from '@/lib/menuService'
import { CreateMenuItemForm } from './CreateMenuItemForm'
import { MenuItemRow } from './MenuItemRow'

export default async function AdminMenuItemsPage() {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'

  const items = await listMenuItems()

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Menu Management</h1>
      </header>
      {isAdmin && (
        <div className="admin-panel">
          <CreateMenuItemForm />
        </div>
      )}
      {items.length === 0 ? (
        <p className="admin-empty">No menu items yet — add one above.</p>
      ) : (
        <ul className="menu-admin-list">
          {items.map((item) => (
            <MenuItemRow
              key={item.id}
              id={item.id}
              name={item.name}
              price={item.price.toString()}
              available={item.available}
              editable={isAdmin}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Restyle `app/admin/menu-items/CreateMenuItemForm.tsx`**

Replace the full file with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function CreateMenuItemForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/menu-items', { name, price: Number(price) })
      setName('')
      setPrice('')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-panel__form">
      <div>
        <label htmlFor="name" className="admin-panel__label">
          Name
        </label>
        <input
          id="name"
          type="text"
          className="admin-panel__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="price" className="admin-panel__label">
          Price
        </label>
        <input
          id="price"
          type="number"
          step="0.01"
          min="0.01"
          className="admin-panel__input"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="admin-panel__submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add menu item'}
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

- [ ] **Step 4: Write the test for the empty state**

In `app/admin/menu-items/page.test.tsx`, add this test inside the existing `describe('AdminMenuItemsPage', ...)` block, after the `'is gated behind at least a staff session'` test:

```tsx
  it('shows an empty state when there are no menu items', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })

    const ui = await AdminMenuItemsPage()
    render(ui)

    expect(screen.getByText('No menu items yet — add one above.')).toBeInTheDocument()
  })
```

- [ ] **Step 5: Run the test file to verify all tests pass**

Run: `npx vitest run app/admin/menu-items/page.test.tsx`
Expected: PASS (5 tests: 4 existing + 1 new)

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/admin/menu-items/page.tsx app/admin/menu-items/CreateMenuItemForm.tsx app/admin/menu-items/page.test.tsx
git commit -m "style: restyle Menu Management page shell and add empty state"
```

---

### Task 4: MenuItemRow edit-toggle behavior

**Files:**
- Modify: `app/globals.css`
- Modify: `app/admin/menu-items/MenuItemRow.tsx`
- Create: `app/admin/menu-items/MenuItemRow.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (styled independently; rendered inside Task 3's `.menu-admin-list`).
- Produces: the restyled `MenuItemRow` component with the same exported signature as before (`{ id, name, price, available, editable }`) — Task 3's `page.tsx` already calls it with this signature, unchanged.

- [ ] **Step 1: Append Menu Management row CSS to `app/globals.css`**

Add this block at the end of the file (after Task 3's block):

```css

.menu-admin-row {
  background: var(--paper);
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  padding: 0.85rem 1rem;
}

.menu-admin-row__view {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.menu-admin-row__name {
  flex: 1;
  font-weight: 500;
}

.menu-admin-row__price {
  font-family: var(--font-mono), monospace;
  color: var(--copper);
}

.menu-admin-row__badge {
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--copper);
  background: color-mix(in srgb, var(--copper) 12%, transparent);
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
}

.menu-admin-row__badge--sold-out {
  color: var(--clay);
  background: var(--clay-faint);
}

.menu-admin-row__edit {
  min-height: 44px;
  padding: 0 0.85rem;
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  background: none;
  color: var(--espresso);
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.menu-admin-row__edit:hover {
  border-color: var(--copper);
}

.menu-admin-row__edit:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.menu-admin-row__form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.menu-admin-row__input {
  min-height: 44px;
  padding: 0 0.6rem;
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.9rem;
  color: var(--espresso);
  background: none;
}

.menu-admin-row__input--name {
  flex: 1;
  min-width: 120px;
}

.menu-admin-row__input--price {
  width: 90px;
}

.menu-admin-row__checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
}

.menu-admin-row__actions {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  margin-top: 0.6rem;
}

.menu-admin-row__save,
.menu-admin-row__cancel,
.menu-admin-row__archive {
  min-height: 44px;
  padding: 0 1rem;
  border-radius: 8px;
  font-family: var(--font-body), Arial, sans-serif;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.menu-admin-row__save {
  border: none;
  background: var(--copper);
  color: var(--paper);
}

.menu-admin-row__cancel {
  border: 1px solid var(--clay-faint);
  background: none;
  color: var(--espresso);
}

.menu-admin-row__archive {
  border: 1px solid var(--danger);
  background: none;
  color: var(--danger);
}

.menu-admin-row__save:disabled,
.menu-admin-row__cancel:disabled,
.menu-admin-row__archive:disabled,
.menu-admin-row__edit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-admin-row__save:focus-visible,
.menu-admin-row__cancel:focus-visible,
.menu-admin-row__archive:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.menu-admin-row__error {
  color: var(--danger);
  font-size: 0.85rem;
  margin-top: 0.5rem;
}
```

- [ ] **Step 2: Write the failing tests**

Create `app/admin/menu-items/MenuItemRow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MenuItemRow } from './MenuItemRow'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { patch: vi.fn(), del: vi.fn() },
  }
})

describe('MenuItemRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('read-only (non-editable) session', () => {
    it('shows name, price, and availability badge with no Edit button', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={false} />)

      expect(screen.getByText('Burger')).toBeInTheDocument()
      expect(screen.getByText('$12.50')).toBeInTheDocument()
      expect(screen.getByText('Available')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    })

    it('shows "Sold out" when unavailable', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={false} editable={false} />)

      expect(screen.getByText('Sold out')).toBeInTheDocument()
    })
  })

  describe('editable session, read-only by default', () => {
    it('shows an Edit button and no input fields until Edit is clicked', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })

    it('reveals inputs and Save/Cancel/Archive after clicking Edit', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

      expect(screen.getByLabelText('Name for Burger')).toBeInTheDocument()
      expect(screen.getByLabelText('Price for Burger')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    })
  })

  describe('Cancel', () => {
    it('discards unsaved edits and returns to read-only without calling the API', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.change(screen.getByLabelText('Name for Burger'), { target: { value: 'Cheeseburger' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByText('Burger')).toBeInTheDocument()
      expect(screen.queryByText('Cheeseburger')).not.toBeInTheDocument()
      expect(apiClient.patch).not.toHaveBeenCalled()
      expect(apiClient.del).not.toHaveBeenCalled()
    })
  })

  describe('Save', () => {
    it('calls PATCH with the edited fields and returns to read-only on success', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({})
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.change(screen.getByLabelText('Name for Burger'), { target: { value: 'Cheeseburger' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/m1', {
        name: 'Cheeseburger',
        price: 12.5,
        available: true,
      })

      expect(await screen.findByText('Burger')).toBeInTheDocument()
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
      expect(refresh).toHaveBeenCalled()
    })

    it('shows an error and stays in editing state when the save fails', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('VALIDATION', 'Price must be positive'))
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Price must be positive')
      expect(screen.getByLabelText('Name for Burger')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Run the test file to verify it fails**

Run: `npx vitest run app/admin/menu-items/MenuItemRow.test.tsx`
Expected: FAIL — `MenuItemRow` still renders the old always-inline markup (no "Edit" button exists, inputs are always visible), so multiple assertions fail.

- [ ] **Step 4: Implement the edit-toggle behavior**

Replace the full file `app/admin/menu-items/MenuItemRow.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type MenuItemRowProps = {
  id: string
  name: string
  price: string
  available: boolean
  editable: boolean
}

export function MenuItemRow({ id, name, price, available, editable }: MenuItemRowProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [editPrice, setEditPrice] = useState(price)
  const [editAvailable, setEditAvailable] = useState(available)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function startEditing() {
    setEditName(name)
    setEditPrice(price)
    setEditAvailable(available)
    setError(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setEditName(name)
    setEditPrice(price)
    setEditAvailable(available)
    setError(null)
    setIsEditing(false)
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.patch(`/api/menu-items/${id}`, {
        name: editName,
        price: Number(editPrice),
        available: editAvailable,
      })
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const badge = (
    <span className={`menu-admin-row__badge${available ? '' : ' menu-admin-row__badge--sold-out'}`}>
      {available ? 'Available' : 'Sold out'}
    </span>
  )

  if (!editable || !isEditing) {
    return (
      <li className="menu-admin-row">
        <div className="menu-admin-row__view">
          <span className="menu-admin-row__name">{name}</span>
          <span className="menu-admin-row__price">${price}</span>
          {badge}
          {editable && (
            <button type="button" className="menu-admin-row__edit" onClick={startEditing}>
              Edit
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <li className="menu-admin-row">
      <div className="menu-admin-row__form">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          aria-label={`Name for ${name}`}
          className="menu-admin-row__input menu-admin-row__input--name"
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={editPrice}
          onChange={(e) => setEditPrice(e.target.value)}
          aria-label={`Price for ${name}`}
          className="menu-admin-row__input menu-admin-row__input--price"
        />
        <label className="menu-admin-row__checkbox-label">
          <input
            type="checkbox"
            checked={editAvailable}
            onChange={(e) => setEditAvailable(e.target.checked)}
          />
          Available
        </label>
        <div className="menu-admin-row__actions">
          <button type="button" className="menu-admin-row__save" onClick={handleSave} disabled={submitting}>
            Save
          </button>
          <button type="button" className="menu-admin-row__cancel" onClick={cancelEditing} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="menu-admin-row__archive" disabled={submitting}>
            Archive
          </button>
        </div>
        {error && (
          <p role="alert" className="menu-admin-row__error">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}
```

Note: the Archive button is inert (no `onClick`) at the end of this step — Task 5 wires it to the confirm dialog. This keeps this task's diff focused on the edit-toggle behavior only.

- [ ] **Step 5: Run the test file to verify it passes**

Run: `npx vitest run app/admin/menu-items/MenuItemRow.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 6: Run the full Menu Management page test file to confirm no regression**

Run: `npx vitest run app/admin/menu-items/page.test.tsx`
Expected: PASS (5 tests) — `page.test.tsx` renders real `MenuItemRow` instances (not mocked), so this confirms the new row markup still satisfies `getByText('Burger')` from the `'renders each menu item'` test.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css app/admin/menu-items/MenuItemRow.tsx app/admin/menu-items/MenuItemRow.test.tsx
git commit -m "feat: add edit-toggle to Menu Management rows"
```

---

### Task 5: MenuItemRow confirm-on-Archive

**Files:**
- Modify: `app/admin/menu-items/MenuItemRow.tsx`
- Modify: `app/admin/menu-items/MenuItemRow.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` from `app/components/ConfirmDialog.tsx` — props `{ title, message, confirmLabel, busy, exiting, onConfirm, onClose }` (all required, per `app/components/ConfirmDialog.tsx`).
- Produces: nothing new for later tasks — this is the final task in this plan.

- [ ] **Step 1: Write the failing tests**

In `app/admin/menu-items/MenuItemRow.test.tsx`, add `within` to the import from `@testing-library/react`:

```tsx
import { render, screen, fireEvent, within } from '@testing-library/react'
```

Then add this new `describe` block at the end of the file, before the final closing `})`:

```tsx
  describe('Archive', () => {
    it('opens a confirm dialog instead of calling DELETE immediately', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

      expect(screen.getByRole('dialog', { name: 'Archive Burger?' })).toBeInTheDocument()
      expect(apiClient.del).not.toHaveBeenCalled()
    })

    it('calls DELETE only after the dialog is confirmed', () => {
      vi.mocked(apiClient.del).mockResolvedValue({})
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

      const dialog = screen.getByRole('dialog', { name: 'Archive Burger?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))

      expect(apiClient.del).toHaveBeenCalledWith('/api/menu-items/m1')
    })

    it('does not call DELETE when "Never mind" is clicked', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
      fireEvent.click(screen.getByRole('button', { name: 'Never mind' }))

      expect(apiClient.del).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `npx vitest run app/admin/menu-items/MenuItemRow.test.tsx`
Expected: FAIL — the Archive button has no `onClick`, so no dialog ever opens and `getByRole('dialog', ...)` throws.

- [ ] **Step 3: Implement confirm-on-Archive**

In `app/admin/menu-items/MenuItemRow.tsx`:

Update the imports at the top of the file:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
```

Add a module-level constant right after the imports:

```tsx
const CONFIRM_EXIT_MS = 200
```

Inside `MenuItemRow`, add new state and the archive-dialog open/close/confirm logic right after the existing `submitting` state declaration:

```tsx
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    }
  }, [])

  function openConfirmArchive() {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirmArchive() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => {
      setConfirmClosing(false)
    }, CONFIRM_EXIT_MS)
  }

  async function handleArchive() {
    closeConfirmArchive()
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.del(`/api/menu-items/${id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
```

Wire the Archive button's `onClick`. Find this line (added inert in Task 4, Step 4):

```tsx
          <button type="button" className="menu-admin-row__archive" disabled={submitting}>
            Archive
          </button>
```

Replace it with:

```tsx
          <button type="button" className="menu-admin-row__archive" onClick={openConfirmArchive} disabled={submitting}>
            Archive
          </button>
```

Add the `ConfirmDialog` render, right after the closing `</div>` of `menu-admin-row__form` but still inside the `<li>`:

```tsx
      </div>
      {(confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title={`Archive ${name}?`}
          message="It'll be hidden from the menu."
          confirmLabel="Archive"
          busy={submitting}
          exiting={!confirmOpen}
          onConfirm={handleArchive}
          onClose={closeConfirmArchive}
        />
      )}
    </li>
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run app/admin/menu-items/MenuItemRow.test.tsx`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add app/admin/menu-items/MenuItemRow.tsx app/admin/menu-items/MenuItemRow.test.tsx
git commit -m "feat: confirm before archiving a menu item"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file in the repo, including all files touched in Tasks 1-5 and any file that imports `MenuItemRow`/`CreateTableForm`/`CreateMenuItemForm` indirectly (`app/admin/menu-items/page.test.tsx`, `app/admin/tables/page.test.tsx`).

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: PASS, no new warnings/errors from the five modified `.tsx` files.

- [ ] **Step 3: Manual visual check (Docker dev loop, per this repo's established convention)**

Run: `docker compose up --build`

Visit (replace host/port with whatever `docker-compose.yml` maps — check `docker/entrypoint.sh` seed output for staff/admin credentials):
- `http://localhost:3001/login` — confirm the centered ticket-stub card renders correctly in both light and dark OS theme.
- `http://localhost:3001/admin/tables` (as admin) — confirm the dark header banner, form card, and QR grid (or empty state, if no tables exist yet).
- `http://localhost:3001/admin/menu-items` (as admin) — confirm the empty state, then add an item and confirm Edit reveals inputs, Cancel discards, Save persists, and Archive opens the confirm dialog before deleting.

This step has no pass/fail command output — confirm visually and note any issue before proceeding.

- [ ] **Step 4: Update `BUILD_STATUS.md`**

In `BUILD_STATUS.md`, change Story 15's status cell from `Building` to `Done`.

- [ ] **Step 5: Commit**

```bash
git add BUILD_STATUS.md
git commit -m "docs: mark Story 15 (admin pages UI/UX) done"
```
