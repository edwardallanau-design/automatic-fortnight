# Admin UI branch-context redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify branch selection into a single header (`StaffBar`) control shared across Dashboard/Menu Management/Table Setup, fix the Branches page's inconsistent row alignment, and remove the redundant venue-wide "accepting orders" toggle in favor of the existing per-branch one.

**Architecture:** `StaffBar` (already a global client component mounted in the root layout) grows a branch-selection popover whose choice is synced into the current page's `?branch=` query param and persisted to `localStorage`; the three consuming pages keep using the `resolveBranchId(session, requestedBranchId)` helper that already exists from Story 20 — no new backend endpoints. Dropping the venue-wide toggle requires amending domain invariant `INV-10` (a one-way-door change, pre-approved by the user — see the design doc) and deleting the now-dead `VenueSettings` read/write code path (the schema table itself stays, unused, to avoid a migration).

**Tech Stack:** Next.js 16 App Router (React 19 Server + Client Components), Prisma 7, Vitest + Testing Library, hand-written CSS (no Tailwind) using the app's `--espresso`/`--crema`/`--paper`/`--copper` custom-property palette in `app/globals.css`.

**Source spec:** `docs/superpowers/specs/2026-07-11-admin-ui-branch-context-redesign-design.md`

## Global Constraints

- No database migration — the `VenueSettings` Prisma model/table stays in `prisma/schema.prisma` untouched, even though nothing reads or writes it after this plan.
- Mobile breakpoint: reuse the app's one existing breakpoint, `480px` (matches `app/globals.css:1558`) — do not invent a new one.
- Test runner is Vitest (`npm test` = `vitest run`); every new/changed behavior needs a test in the same PR, following this repo's existing per-file `vi.mock(...)` conventions (mock at the module boundary, not deeper).
- All work happens on the `feature/admin-ui-branch-context-redesign` branch (already created off `dev`), commit there — do not push or open a PR without being asked.
- Follow this repo's Conventional Commits style for each task's commit message (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`).

---

### Task 1: Amend `INV-10` and drop the global gate from `orderService.createOrder`

**Files:**
- Modify: `docs/design/02-domain-model.md:11,30,48,75-78`
- Modify: `lib/orderService.ts:1-32`
- Modify: `lib/orderService.test.ts:1-72`

**Interfaces:**
- Consumes: nothing new.
- Produces: `orderService.createOrder(orderingPointId, items, customerName?)` no longer calls `getVenueSettings()` — later tasks (Task 2) rely on this same removal pattern in `app/order/page.tsx`.

- [ ] **Step 1: Update the domain model doc**

In `docs/design/02-domain-model.md`, make these three edits:

Replace line 11:
```markdown
- **Venue Settings** — venue-wide operational state, currently a single `acceptingOrders` flag controlling whether new orders may be created at all, regardless of who submits them.
```
with:
```markdown
- **Venue Settings** — a vestigial venue-wide singleton; its `acceptingOrders` flag is no longer read by any code path (see `INV-10`) and no UI exposes it. Kept in the schema only to avoid a destructive migration.
```

Replace line 30:
```markdown
- **VenueSettings** — a singleton, `acceptingOrders` (boolean) — venue-wide operational state, no lifecycle beyond this one flag today. Owner/Admin is the only actor who may change it.
```
with:
```markdown
- **VenueSettings** — a singleton, `acceptingOrders` (boolean) — vestigial: no code reads or writes it after 2026-07-11's branch-context redesign (see `INV-10`); retained in the schema only to avoid a destructive migration.
```

Replace line 48:
```markdown
- `INV-10` A new Order may be created only while **both** `VenueSettings.acceptingOrders` (global) **and** the order's branch's `acceptingOrders` are true.
```
with:
```markdown
- `INV-10` A new Order may be created only while the order's branch's `acceptingOrders` is true. (Until 2026-07-11 this also required `VenueSettings.acceptingOrders` (global); that gate was removed as part of the admin UI branch-context redesign — see `docs/superpowers/specs/2026-07-11-admin-ui-branch-context-redesign-design.md`.)
```

Replace lines 75-78:
```markdown
*VenueSettings — `acceptingOrders`*
- States: `Open` (true), `Closed` (false)
- `Open → Closed` and `Closed → Open` (trigger: Owner/Admin only) — freely reversible, no restriction.
- No other actor may transition this flag; Staff may view it but not change it.
```
with:
```markdown
*VenueSettings — `acceptingOrders`* (vestigial as of 2026-07-11 — see `INV-10`)
- States: `Open` (true), `Closed` (false)
- No longer reachable via any UI or API; the flag stays permanently `true` (its schema default) since nothing can transition it anymore.
```

- [ ] **Step 2: Update the failing test first — remove the global-gate test and its mock plumbing from `lib/orderService.test.ts`**

Remove the `getVenueSettings` import (line 9):
```ts
import { getVenueSettings } from './venueSettingsService'
```

Remove the mock block (lines 41-43):
```ts
vi.mock('./venueSettingsService', () => ({
  getVenueSettings: vi.fn(),
}))
```

Remove this line from the `describe('orderService.createOrder')` `beforeEach` (was line 54):
```ts
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: true, updatedAt: new Date() } as never)
```

Remove this entire test (lines 64-72):
```ts
  it('throws ConflictError when the venue is not accepting orders', async () => {
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: false, updatedAt: new Date() } as never)

    await expect(
      createOrder('op1', [{ menuItemId: 'm1', quantity: 1 }]),
    ).rejects.toThrow(ConflictError)
    expect(getOrderingPointOrThrow).not.toHaveBeenCalled()
    expect(prisma.order.create).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run the test file to confirm it still compiles/passes with the global-gate test gone**

Run: `npm test -- lib/orderService.test.ts`
Expected: PASS (the remaining "throws ConflictError when the branch is not accepting orders" test still passes since `lib/orderService.ts` hasn't changed yet — this step is just confirming the test-file edit itself is valid).

- [ ] **Step 4: Remove the global gate from `lib/orderService.ts`**

Remove the import (line 6):
```ts
import { getVenueSettings } from './venueSettingsService'
```

Replace:
```ts
  const settings = await getVenueSettings()
  if (!settings.acceptingOrders) {
    throw new ConflictError('Not accepting orders right now')
  }

  if (items.length === 0) {
```
with:
```ts
  if (items.length === 0) {
```

- [ ] **Step 5: Run the full test file to confirm everything still passes**

Run: `npm test -- lib/orderService.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add docs/design/02-domain-model.md lib/orderService.ts lib/orderService.test.ts
git commit -m "refactor: drop global VenueSettings gate from INV-10 (branch-level only)"
```

---

### Task 2: Drop the same global gate from `app/order/page.tsx`

**Files:**
- Modify: `app/order/page.tsx:1-55`
- Modify: `app/order/page.test.tsx:1-84`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OrderPage` renders the "not accepting orders" message based solely on `branch.acceptingOrders`.

- [ ] **Step 1: Update the test first — remove the venue-settings mock and its dedicated test in `app/order/page.test.tsx`**

Remove the import (line 7):
```ts
import { getVenueSettings } from '@/lib/venueSettingsService'
```

Remove the mock block (lines 26-28):
```ts
vi.mock('@/lib/venueSettingsService', () => ({
  getVenueSettings: vi.fn(),
}))
```

Remove this line from the top-level `beforeEach` (was line 37):
```ts
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: true, updatedAt: new Date() } as never)
```

Remove this entire test (lines 61-72):
```ts
  it('shows a closed message when the venue is not accepting orders', async () => {
    vi.mocked(getOrderingPointOrThrow).mockResolvedValue({ id: 'op1', branchId: 'b1', label: 'Table 5', isCounter: false, createdAt: new Date() } as never)
    vi.mocked(getVenueSettings).mockResolvedValue({ id: 'singleton', acceptingOrders: false, updatedAt: new Date() } as never)

    const ui = await OrderPage({ searchParams: Promise.resolve({ table: 'op1' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We're not accepting orders right now. Please check back later.",
    )
    expect(listMenuItemsWithAvailability).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the test file to confirm the edit is valid (still failing/erroring is fine here since `page.tsx` hasn't changed — check for no leftover references)**

Run: `npm test -- app/order/page.test.tsx`
Expected: PASS (the "shows a closed message when the branch is not accepting orders" test still exercises the same message via `branch.acceptingOrders`, unaffected by this edit).

- [ ] **Step 3: Remove the global gate from `app/order/page.tsx`**

Remove the import (line 4):
```ts
import { getVenueSettings } from '@/lib/venueSettingsService'
```

Replace:
```tsx
  const [settings, branch] = await Promise.all([
    getVenueSettings(),
    getBranchOrThrow(orderingPoint.branchId),
  ])

  if (!settings.acceptingOrders || !branch.acceptingOrders) {
```
with:
```tsx
  const branch = await getBranchOrThrow(orderingPoint.branchId)

  if (!branch.acceptingOrders) {
```

- [ ] **Step 4: Run the test file to confirm everything passes**

Run: `npm test -- app/order/page.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add app/order/page.tsx app/order/page.test.tsx
git commit -m "refactor: drop global VenueSettings gate from the customer order page"
```

---

### Task 3: Delete the venue-settings feature and its `StaffBar` nav link

**Files:**
- Delete: `app/admin/settings/page.tsx`
- Delete: `app/admin/settings/page.test.tsx`
- Delete: `app/admin/settings/AcceptingOrdersToggle.tsx`
- Delete: `app/admin/settings/AcceptingOrdersToggle.test.tsx`
- Delete: `app/api/venue-settings/route.ts`
- Delete: `app/api/venue-settings/route.test.ts`
- Delete: `lib/venueSettingsService.ts`
- Delete: `lib/venueSettingsService.test.ts`
- Modify: `app/components/StaffBar.tsx:69,120-129`
- Modify: `app/components/StaffBar.test.tsx:92-103`

**Interfaces:**
- Consumes: confirms nothing outside this list still imports `getVenueSettings`/`setAcceptingOrders` (true after Tasks 1-2).
- Produces: `StaffBar` renders 5 nav links (Dashboard, Menu Management, Table Setup, Payment Methods, Branches) instead of 6 — Task 6 builds on this 5-link baseline.

- [ ] **Step 1: Confirm nothing else references the venue-settings module (should be empty after Tasks 1-2)**

Run: `grep -rn "venueSettingsService\|/api/venue-settings\|AcceptingOrdersToggle" --include=*.ts --include=*.tsx app lib | grep -v "app/admin/settings\|app/api/venue-settings\|lib/venueSettingsService"`
Expected: no output (empty) — if anything prints, stop and investigate before deleting.

- [ ] **Step 2: Delete the dead files**

```bash
git rm app/admin/settings/page.tsx app/admin/settings/page.test.tsx app/admin/settings/AcceptingOrdersToggle.tsx app/admin/settings/AcceptingOrdersToggle.test.tsx app/api/venue-settings/route.ts app/api/venue-settings/route.test.ts lib/venueSettingsService.ts lib/venueSettingsService.test.ts
```

- [ ] **Step 3: Update `StaffBar.test.tsx` — remove the two Settings-link tests**

Remove (lines 92-103):
```tsx
  it('shows a Settings link for an admin session', () => {
    render(<StaffBar role="admin" />)

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/admin/settings')
  })

  it('hides the Settings link when already on that page', () => {
    mockPathname = '/admin/settings'
    render(<StaffBar role="admin" />)

    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })
```

Also update the "does not show admin-only nav links for a staff session" test (lines 46-53) to drop the now-nonexistent Settings assertion:
```tsx
  it('does not show admin-only nav links for a staff session', () => {
    render(<StaffBar role="staff" />)

    expect(screen.queryByRole('link', { name: 'Table Setup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Payment Methods' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument()
  })
```
becomes:
```tsx
  it('does not show admin-only nav links for a staff session', () => {
    render(<StaffBar role="staff" />)

    expect(screen.queryByRole('link', { name: 'Table Setup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Payment Methods' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 4: Run the test file to confirm it's still valid (still red/green as before edits, Settings assertions gone)**

Run: `npm test -- app/components/StaffBar.test.tsx`
Expected: PASS (existing hide-logic is untouched by this task; Task 6 changes that logic).

- [ ] **Step 5: Remove the Settings link from `StaffBar.tsx`**

Remove (line 69):
```ts
  const showSettingsLink = role === 'admin' && pathname !== '/admin/settings'
```

Remove (lines 120-129):
```tsx
          {showSettingsLink && (
            <>
              <Link href="/admin/settings" className="staff-bar__action">
                Settings
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </>
          )}
```

- [ ] **Step 6: Run the full test suite to catch any other lingering references**

Run: `npm test`
Expected: PASS. If any other test file fails referencing `/admin/settings` or venue-settings, fix it before moving on (there should be none per Step 1's grep).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove the venue-wide accepting-orders toggle and its Settings page"
```

---

### Task 4: Fix `resolveBranchId`'s hardcoded "Main" fallback

**Files:**
- Modify: `lib/branchService.ts:22-32`
- Modify: `lib/branchService.test.ts:101-106`

**Interfaces:**
- Consumes: `listBranches()` (already defined in the same file, `lib/branchService.ts:34-36`).
- Produces: `resolveBranchId(session, requestedBranchId?)` — same signature, same behavior for staff/valid-requested-id/invalid-id; only the "nothing given" fallback path changes from "the branch named Main" to "the first branch by name."

- [ ] **Step 1: Replace the failing-fallback test in `lib/branchService.test.ts`**

Replace (lines 101-106):
```ts
  it('falls back to the Main branch when the session has no branchId and no requestedBranchId is given', async () => {
    vi.mocked(prisma.branch.findFirst).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() } as never)

    const result = await resolveBranchId({})
    expect(result).toBe('b1')
  })
```
with:
```ts
  it('falls back to the first branch (by name) when the session has no branchId and no requestedBranchId is given', async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    const result = await resolveBranchId({})
    expect(result).toBe('b2')
    expect(prisma.branch.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } })
  })

  it('throws NotFoundError when no branches exist at all and no requestedBranchId is given', async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([])

    await expect(resolveBranchId({})).rejects.toThrow(NotFoundError)
  })
```

- [ ] **Step 2: Run the test file to confirm it fails (the implementation hasn't changed yet)**

Run: `npm test -- lib/branchService.test.ts`
Expected: FAIL — the new tests expect `prisma.branch.findMany` to be called, but `resolveBranchId` still calls `getMainBranch()`/`prisma.branch.findFirst`.

- [ ] **Step 3: Update `resolveBranchId` in `lib/branchService.ts`**

Replace:
```ts
export async function resolveBranchId(session: { branchId?: string }, requestedBranchId?: string): Promise<string> {
  if (session.branchId) {
    return session.branchId
  }
  if (requestedBranchId) {
    const branch = await getBranchOrThrow(requestedBranchId)
    return branch.id
  }
  const branch = await getMainBranch()
  return branch.id
}
```
with:
```ts
export async function resolveBranchId(session: { branchId?: string }, requestedBranchId?: string): Promise<string> {
  if (session.branchId) {
    return session.branchId
  }
  if (requestedBranchId) {
    const branch = await getBranchOrThrow(requestedBranchId)
    return branch.id
  }
  const [firstBranch] = await listBranches()
  if (!firstBranch) {
    throw new NotFoundError('No branches exist')
  }
  return firstBranch.id
}
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `npm test -- lib/branchService.test.ts`
Expected: PASS, all tests green (including the untouched `getMainBranch` describe block, which still exists and still passes since the function itself is unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/branchService.ts lib/branchService.test.ts
git commit -m "fix: resolveBranchId falls back to the first branch by name, not a hardcoded \"Main\""
```

---

### Task 5: Redesign the Branches page row (`BranchRow`) — chevron + actions row

**Files:**
- Modify: `app/admin/branches/BranchRow.tsx` (full rewrite)
- Modify: `app/admin/branches/BranchRow.test.tsx` (full rewrite)
- Modify: `app/globals.css:2665-2705`

**Interfaces:**
- Consumes: `apiClient.patch('/api/branches/:id', body)` (unchanged, existing endpoint from `app/api/branches/[id]/route.ts`).
- Produces: `BranchRow({ id, name, acceptingOrders })` — same props as today; no other component consumes `BranchRow` beyond `app/admin/branches/page.tsx`, which is unaffected.

- [ ] **Step 1: Write the new failing test file**

Use the Write tool to replace `app/admin/branches/BranchRow.test.tsx` entirely with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BranchRow } from './BranchRow'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { patch: vi.fn() },
  }
})

describe('BranchRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the branch name and an accepting-orders toggle', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByText('Accepting orders')).toBeInTheDocument()
  })

  it('shows the toggle unchecked and labeled when closed', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={false} />)

    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByText('Not accepting orders')).toBeInTheDocument()
  })

  it('toggling calls PATCH with acceptingOrders and refreshes', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/branches/b1', { acceptingOrders: false }))
    expect(refresh).toHaveBeenCalled()
  })

  it('hides Change name / Change password behind a collapsed actions row by default', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    expect(screen.queryByRole('button', { name: 'Change name' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show actions for Main' })).toBeInTheDocument()
  })

  it('reveals the actions row when the expand chevron is clicked, and hides it again on a second click', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    expect(screen.getByRole('button', { name: 'Change name' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide actions for Main' }))
    expect(screen.queryByRole('button', { name: 'Change name' })).not.toBeInTheDocument()
  })

  it('reveals a rename form when "Change name" is clicked, and saves it', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change name' }))
    fireEvent.change(screen.getByLabelText('New name for Main'), { target: { value: 'Main Street' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/branches/b1', { name: 'Main Street' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('reveals a password field when "Change password" is clicked, and submits it', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    fireEvent.change(screen.getByLabelText('New password for Main'), { target: { value: 'new-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/branches/b1', { password: 'new-pw' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('only shows one edit form at a time, switching from name to password', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change name' }))
    expect(screen.getByLabelText('New name for Main')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.queryByLabelText('New name for Main')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New password for Main')).toBeInTheDocument()
  })

  it('shows a conflict-specific error when the new password collides', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('CONFLICT', 'This password is already in use by another branch or the admin login'))
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    fireEvent.change(screen.getByLabelText('New password for Main'), { target: { value: 'taken-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This password is already in use by another branch or the admin login')
  })
})
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `npm test -- app/admin/branches/BranchRow.test.tsx`
Expected: FAIL — `BranchRow` doesn't have a "Show actions for Main" button yet.

- [ ] **Step 3: Rewrite `BranchRow.tsx`**

Use the Write tool to replace `app/admin/branches/BranchRow.tsx` entirely with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type BranchRowProps = {
  id: string
  name: string
  acceptingOrders: boolean
}

export function BranchRow({ id, name, acceptingOrders }: BranchRowProps) {
  const router = useRouter()

  const [checked, setChecked] = useState(acceptingOrders)
  const [toggleSubmitting, setToggleSubmitting] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState(false)
  const [editingField, setEditingField] = useState<'name' | 'password' | null>(null)

  const [newName, setNewName] = useState(name)
  const [renameSubmitting, setRenameSubmitting] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setChecked(next)
    setToggleError(null)
    setToggleSubmitting(true)
    try {
      await apiClient.patch(`/api/branches/${id}`, { acceptingOrders: next })
      router.refresh()
    } catch (err) {
      setChecked(!next)
      setToggleError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setToggleSubmitting(false)
    }
  }

  function handleToggleExpanded() {
    setExpanded((current) => {
      const next = !current
      if (!next) setEditingField(null)
      return next
    })
  }

  function handleChangeNameClick() {
    setNewName(name)
    setRenameError(null)
    setEditingField('name')
  }

  function handleChangePasswordClick() {
    setNewPassword('')
    setPasswordError(null)
    setEditingField('password')
  }

  async function handleSaveName() {
    setRenameError(null)
    setRenameSubmitting(true)
    try {
      await apiClient.patch(`/api/branches/${id}`, { name: newName })
      setEditingField(null)
      router.refresh()
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setRenameSubmitting(false)
    }
  }

  async function handleSavePassword() {
    setPasswordError(null)
    setPasswordSubmitting(true)
    try {
      await apiClient.patch(`/api/branches/${id}`, { password: newPassword })
      setEditingField(null)
      setNewPassword('')
      router.refresh()
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  return (
    <li className="branch-row">
      <div className="branch-row__header">
        <span className="branch-row__name">{name}</span>
        <div className="branch-row__header-controls">
          <label className="slider-toggle">
            <input
              type="checkbox"
              role="switch"
              className="slider-toggle__input"
              checked={checked}
              disabled={toggleSubmitting}
              onChange={handleToggle}
              aria-label={`Accepting orders: ${name}`}
            />
            <span className="slider-toggle__track" aria-hidden="true" />
            <span className="slider-toggle__label">{checked ? 'Accepting orders' : 'Not accepting orders'}</span>
          </label>
          <button
            type="button"
            className="branch-row__expand"
            onClick={handleToggleExpanded}
            aria-label={expanded ? `Hide actions for ${name}` : `Show actions for ${name}`}
          >
            {expanded ? '▴' : '▾'}
          </button>
        </div>
      </div>
      {toggleError && (
        <p role="alert" className="admin-panel__error">
          {toggleError}
        </p>
      )}
      {expanded && (
        <div className="branch-row__actions">
          <button
            type="button"
            className={`branch-row__action${editingField === 'name' ? ' branch-row__action--active' : ''}`}
            onClick={handleChangeNameClick}
          >
            Change name
          </button>
          <button
            type="button"
            className={`branch-row__action${editingField === 'password' ? ' branch-row__action--active' : ''}`}
            onClick={handleChangePasswordClick}
          >
            Change password
          </button>
        </div>
      )}
      {editingField === 'name' && (
        <div className="branch-row__edit-form">
          <label htmlFor={`rename-${id}`} className="admin-panel__label">
            New name for {name}
          </label>
          <input
            id={`rename-${id}`}
            className="admin-panel__input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="button" className="menu-admin-row__edit" onClick={handleSaveName} disabled={renameSubmitting}>
            Save name
          </button>
        </div>
      )}
      {renameError && (
        <p role="alert" className="admin-panel__error">
          {renameError}
        </p>
      )}
      {editingField === 'password' && (
        <div className="branch-row__edit-form">
          <label htmlFor={`password-${id}`} className="admin-panel__label">
            New password for {name}
          </label>
          <input
            id={`password-${id}`}
            type="password"
            className="admin-panel__input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button type="button" className="menu-admin-row__edit" onClick={handleSavePassword} disabled={passwordSubmitting}>
            Save password
          </button>
        </div>
      )}
      {passwordError && (
        <p role="alert" className="admin-panel__error">
          {passwordError}
        </p>
      )}
    </li>
  )
}
```

- [ ] **Step 4: Update the CSS**

In `app/globals.css`, replace (lines 2665-2705):
```css
.branch-row__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.branch-row__name {
  font-family: var(--font-display), Georgia, serif;
  font-weight: 600;
  font-size: 1.1rem;
}

.branch-row__password-toggle {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--copper);
  cursor: pointer;
}

.branch-row__password-toggle:hover {
  text-decoration: underline;
}

.branch-row__password-toggle:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

.branch-row__password-form {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
```
with:
```css
.branch-row__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.branch-row__name {
  font-family: var(--font-display), Georgia, serif;
  font-weight: 600;
  font-size: 1.1rem;
}

.branch-row__header-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.branch-row__expand {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--clay-faint);
  background: none;
  color: var(--clay);
  font-size: 0.7rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.branch-row__expand:hover,
.branch-row__expand:focus-visible {
  border-color: var(--copper);
  color: var(--copper);
  outline: none;
}

.branch-row__actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--clay-faint);
}

.branch-row__action {
  border: 1px solid var(--clay-faint);
  background: none;
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--clay);
  cursor: pointer;
}

.branch-row__action:hover,
.branch-row__action:focus-visible {
  border-color: var(--copper);
  color: var(--copper);
  outline: none;
}

.branch-row__action--active {
  border-color: var(--copper);
  color: var(--copper);
}

.branch-row__edit-form {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--clay-faint);
}
```

- [ ] **Step 5: Run the test file to confirm it passes**

Run: `npm test -- app/admin/branches/BranchRow.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 6: Run the full suite to catch any other consumer of the removed classes/props**

Run: `npm test`
Expected: PASS (`app/admin/branches/page.tsx` passes the same `id`/`name`/`acceptingOrders` props, unaffected).

- [ ] **Step 7: Commit**

```bash
git add app/admin/branches/BranchRow.tsx app/admin/branches/BranchRow.test.tsx app/globals.css
git commit -m "feat: redesign Branches page row with a collapsed chevron actions row"
```

---

### Task 6: `StaffBar` — always-visible nav links with active-page highlighting

**Files:**
- Modify: `app/components/StaffBar.tsx` (full rewrite)
- Modify: `app/components/StaffBar.test.tsx` (full rewrite)
- Modify: `app/globals.css:2042-2065`

**Interfaces:**
- Consumes: `role: Role` prop (unchanged from today).
- Produces: `StaffBar({ role })` renders every nav link the role is entitled to, always, with `.staff-bar__action--active` on the one matching `pathname`. Task 7 adds a `branches` prop on top of this.

- [ ] **Step 1: Write the new failing test file**

Use the Write tool to replace `app/components/StaffBar.test.tsx` entirely with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffBar } from './StaffBar'
import { apiClient } from '@/lib/apiClient'

const push = vi.fn()
const refresh = vi.fn()
let mockPathname = '/order/new'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => mockPathname,
}))

vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: vi.fn() },
}))

describe('StaffBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockPathname = '/order/new'
  })

  it('shows the role', () => {
    render(<StaffBar role="staff" />)

    expect(screen.getByText('staff')).toBeInTheDocument()
  })

  it('shows a Dashboard link at all times', () => {
    render(<StaffBar role="staff" />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('marks the Dashboard link active when already on the dashboard, without hiding it', () => {
    mockPathname = '/dashboard'
    render(<StaffBar role="staff" />)

    const link = screen.getByRole('link', { name: 'Dashboard' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveClass('staff-bar__action--active')
  })

  it('does not mark Menu Management active when on the dashboard', () => {
    mockPathname = '/dashboard'
    render(<StaffBar role="staff" />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).not.toHaveClass('staff-bar__action--active')
  })

  it('does not show admin-only nav links for a staff session', () => {
    render(<StaffBar role="staff" />)

    expect(screen.queryByRole('link', { name: 'Table Setup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Payment Methods' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument()
  })

  it('shows a Menu Management link for a staff session', () => {
    render(<StaffBar role="staff" />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute('href', '/admin/menu-items')
  })

  it('shows Menu Management, Table Setup, and Payment Methods links for an admin session', () => {
    render(<StaffBar role="admin" />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute('href', '/admin/menu-items')
    expect(screen.getByRole('link', { name: 'Table Setup' })).toHaveAttribute('href', '/admin/tables')
    expect(screen.getByRole('link', { name: 'Payment Methods' })).toHaveAttribute('href', '/admin/payment-methods')
  })

  it('marks Table Setup active while still showing Menu Management, unmarked, when on Table Setup', () => {
    mockPathname = '/admin/tables'
    render(<StaffBar role="admin" />)

    expect(screen.getByRole('link', { name: 'Table Setup' })).toHaveClass('staff-bar__action--active')
    expect(screen.getByRole('link', { name: 'Menu Management' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Menu Management' })).not.toHaveClass('staff-bar__action--active')
  })

  it('shows a Branches link for an admin session', () => {
    render(<StaffBar role="admin" />)
    expect(screen.getByRole('link', { name: 'Branches' })).toHaveAttribute('href', '/admin/branches')
  })

  it('marks the Branches link active when already on that page', () => {
    mockPathname = '/admin/branches'
    render(<StaffBar role="admin" />)

    expect(screen.getByRole('link', { name: 'Branches' })).toHaveClass('staff-bar__action--active')
  })

  it('logs out on click: calls the logout endpoint and redirects to /login', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/auth/logout', {})
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('disables the Log out button while the request is in flight', async () => {
    let resolveLogout: () => void = () => {}
    vi.mocked(apiClient.post).mockReturnValue(
      new Promise((resolve) => {
        resolveLogout = () => resolve({})
      }),
    )
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(screen.getByRole('button', { name: 'Log out' })).toBeDisabled()

    resolveLogout()
  })

  it('still navigates to /login and re-enables the button if the logout request fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<StaffBar role="admin" />)

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(push).toHaveBeenCalledWith('/login')
    expect(screen.getByRole('button', { name: 'Log out' })).not.toBeDisabled()
  })

  it('collapses to a reopen control when the hide button is clicked, and expands again on click', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="staff" />)

    await user.click(screen.getByRole('button', { name: 'Hide staff bar' }))
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show staff bar' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show staff bar' }))
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('persists the collapsed state across remounts via localStorage', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<StaffBar role="staff" />)

    await user.click(screen.getByRole('button', { name: 'Hide staff bar' }))
    unmount()

    render(<StaffBar role="staff" />)
    expect(screen.getByRole('button', { name: 'Show staff bar' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `npm test -- app/components/StaffBar.test.tsx`
Expected: FAIL — links currently disappear on their own page instead of gaining an active class.

- [ ] **Step 3: Rewrite `StaffBar.tsx`**

Use the Write tool to replace `app/components/StaffBar.tsx` entirely with:

```tsx
'use client'

import { useEffect, useState, Fragment } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { apiClient } from '@/lib/apiClient'
import type { Role } from '@/lib/types'

const COLLAPSED_STORAGE_KEY = 'staffBarCollapsed'

type NavLink = { href: string; label: string; adminOnly: boolean }

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', adminOnly: false },
  { href: '/admin/menu-items', label: 'Menu Management', adminOnly: false },
  { href: '/admin/tables', label: 'Table Setup', adminOnly: true },
  { href: '/admin/payment-methods', label: 'Payment Methods', adminOnly: true },
  { href: '/admin/branches', label: 'Branches', adminOnly: true },
]

export function StaffBar({ role }: { role: Role }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // localStorage doesn't exist during SSR, so the collapsed preference can only be read
    // client-side post-mount — rendering expanded first avoids a hydration mismatch.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true')
    } catch {
      // Storage unavailable — default to expanded.
    }
  }, [])

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next))
      } catch {
        // Non-critical: the preference just won't survive a reload.
      }
      return next
    })
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await apiClient.post('/api/auth/logout', {})
    } catch {
      // Best-effort: even if clearing the session server-side failed, still send the user to /login.
    } finally {
      router.push('/login')
      router.refresh()
      setLoggingOut(false)
    }
  }

  if (collapsed) {
    return (
      <div className="staff-strip staff-strip--collapsed">
        <div className="staff-strip__hairline" aria-hidden="true" />
        <button type="button" className="staff-bar__toggle" onClick={toggleCollapsed} aria-label="Show staff bar">
          ▾
        </button>
      </div>
    )
  }

  const visibleLinks = NAV_LINKS.filter((link) => !link.adminOnly || role === 'admin')

  return (
    <div className="staff-strip">
      <div className="staff-bar">
        <span className="staff-bar__role">
          <span className="staff-bar__dot" aria-hidden="true" />
          {role}
        </span>
        <span className="staff-bar__actions">
          {visibleLinks.map((link) => (
            <Fragment key={link.href}>
              <Link
                href={link.href}
                className={`staff-bar__action${pathname === link.href ? ' staff-bar__action--active' : ''}`}
              >
                {link.label}
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </Fragment>
          ))}
          <button
            type="button"
            className="staff-bar__action staff-bar__logout"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            Log out
          </button>
          <button
            type="button"
            className="staff-bar__collapse"
            onClick={toggleCollapsed}
            aria-label="Hide staff bar"
          >
            ▴
          </button>
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the active-link CSS**

In `app/globals.css`, after the existing `.staff-bar__action:hover, .staff-bar__action:focus-visible` block (lines 2059-2064), add:
```css
.staff-bar__action--active {
  color: var(--copper-bright);
  opacity: 1;
  text-decoration: underline;
  text-underline-offset: 3px;
}
```

- [ ] **Step 5: Run the test file to confirm it passes**

Run: `npm test -- app/components/StaffBar.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/StaffBar.tsx app/components/StaffBar.test.tsx app/globals.css
git commit -m "feat: keep StaffBar nav links always visible, highlighting the active page"
```

---

### Task 7: `StaffBarGate` + `StaffBar` — branch button, popover, and shared branch context

**Files:**
- Modify: `app/components/StaffBarGate.tsx` (full rewrite)
- Modify: `app/components/StaffBarGate.test.tsx` (full rewrite)
- Modify: `app/components/StaffBar.tsx` (full rewrite, builds on Task 6's version)
- Modify: `app/components/StaffBar.test.tsx` (append a new describe block)
- Modify: `app/globals.css` (append new rules after `.staff-bar__logout:disabled`, line 2083)

**Interfaces:**
- Consumes: `listBranches(): Promise<Branch[]>` from `lib/branchService.ts` (already exists).
- Produces: `StaffBar({ role, branches })` — `branches` is a new optional prop, `{ id: string; name: string }[]`, default `[]`. Nav link `href`s for `/dashboard`, `/admin/menu-items`, `/admin/tables` carry `?branch=<id>` once a branch is known. Task 9 (Dashboard) and Task 10 (Menu Management/Table Setup) rely on this `?branch=` param arriving pre-populated from here.

- [ ] **Step 1: Update `StaffBarGate.test.tsx` first (failing)**

Use the Write tool to replace `app/components/StaffBarGate.test.tsx` entirely with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StaffBarGate } from './StaffBarGate'
import { listBranches } from '@/lib/branchService'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/branchService', () => ({
  listBranches: vi.fn(),
}))

describe('StaffBarGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listBranches).mockResolvedValue([])
  })

  it('renders nothing when there is no session', async () => {
    const ui = await StaffBarGate({ session: null })
    expect(ui).toBeNull()
  })

  it('renders the StaffBar with the session role when a session exists', async () => {
    const ui = await StaffBarGate({ session: { role: 'admin' } })
    render(ui)

    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('fetches branches for an admin session', async () => {
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    await StaffBarGate({ session: { role: 'admin' } })

    expect(listBranches).toHaveBeenCalled()
  })

  it('does not fetch branches for a staff session', async () => {
    await StaffBarGate({ session: { role: 'staff' } })

    expect(listBranches).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test -- app/components/StaffBarGate.test.tsx`
Expected: FAIL — `StaffBarGate` doesn't call `listBranches` yet.

- [ ] **Step 3: Rewrite `StaffBarGate.tsx`**

Use the Write tool to replace `app/components/StaffBarGate.tsx` entirely with:

```tsx
import { StaffBar } from './StaffBar'
import { listBranches } from '@/lib/branchService'
import type { Role } from '@/lib/types'

export async function StaffBarGate({ session }: { session: { role: Role } | null }) {
  if (!session) return null

  const branches = session.role === 'admin' ? await listBranches() : []

  return <StaffBar role={session.role} branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
}
```

- [ ] **Step 4: Run to confirm `StaffBarGate.test.tsx` passes**

Run: `npm test -- app/components/StaffBarGate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Append the branch-picker test block to `StaffBar.test.tsx`**

First, update the `next/navigation` mock at the top of `app/components/StaffBar.test.tsx` (added in Task 6) — replace:
```tsx
const push = vi.fn()
const refresh = vi.fn()
let mockPathname = '/order/new'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => mockPathname,
}))
```
with:
```tsx
const push = vi.fn()
const refresh = vi.fn()
const replace = vi.fn()
let mockPathname = '/order/new'
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}))
```

Also update the top-level `beforeEach` to reset `mockSearchParams`:
```tsx
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockPathname = '/order/new'
    mockSearchParams = new URLSearchParams()
  })
```

Then append this new describe block at the end of the file, before the final closing `})`:

```tsx
describe('StaffBar branch picker', () => {
  const branches = [
    { id: 'b1', name: 'Downtown' },
    { id: 'b2', name: 'Uptown' },
  ]

  beforeEach(() => {
    mockPathname = '/dashboard'
  })

  it('does not render the branch button for a staff session', () => {
    render(<StaffBar role="staff" branches={branches} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /▾/ })).not.toBeInTheDocument()
  })

  it('does not render the branch button when there is only one branch', () => {
    render(<StaffBar role="admin" branches={[branches[0]]} />)
    expect(screen.queryByRole('button', { name: /▾/ })).not.toBeInTheDocument()
  })

  it('defaults to "All branches" on the dashboard with nothing selected yet', () => {
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'All branches ▾' })).toBeInTheDocument()
  })

  it('defaults to the first branch (not "All") on Menu Management', () => {
    mockPathname = '/admin/menu-items'
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'Downtown ▾' })).toBeInTheDocument()
  })

  it('honors ?branch= from the URL over the page-appropriate default', () => {
    mockSearchParams = new URLSearchParams('branch=b2')
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'Uptown ▾' })).toBeInTheDocument()
  })

  it('falls back to a previously saved localStorage selection when the URL has no ?branch=', () => {
    localStorage.setItem('selectedBranchId', 'b2')
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'Uptown ▾' })).toBeInTheDocument()
  })

  it('ignores a saved "all" selection outside the dashboard, falling back to the first branch', () => {
    localStorage.setItem('selectedBranchId', 'all')
    mockPathname = '/admin/tables'
    render(<StaffBar role="admin" branches={branches} />)
    expect(screen.getByRole('button', { name: 'Downtown ▾' })).toBeInTheDocument()
  })

  it('syncs the URL on first load when no ?branch= is present yet', () => {
    render(<StaffBar role="admin" branches={branches} />)
    expect(replace).toHaveBeenCalledWith('/dashboard?branch=all')
  })

  it('opens a popover listing every branch, plus "All branches" only on the dashboard', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'All branches ▾' }))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All branches' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Downtown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uptown' })).toBeInTheDocument()
  })

  it('does not offer "All branches" in the popover outside the dashboard', async () => {
    mockPathname = '/admin/menu-items'
    const user = userEvent.setup()
    render(<StaffBar role="admin" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'Downtown ▾' }))

    expect(screen.queryByRole('button', { name: 'All branches' })).not.toBeInTheDocument()
  })

  it('selecting a branch closes the popover, persists it, and replaces the URL on a branch-aware page', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="admin" branches={branches} />)

    await user.click(screen.getByRole('button', { name: 'All branches ▾' }))
    await user.click(screen.getByRole('button', { name: 'Uptown' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uptown ▾' })).toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith('/dashboard?branch=b2')
    expect(localStorage.getItem('selectedBranchId')).toBe('b2')
  })

  it('appends the selected branch to the Menu Management and Table Setup nav links', () => {
    mockSearchParams = new URLSearchParams('branch=b2')
    render(<StaffBar role="admin" branches={branches} />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute(
      'href',
      '/admin/menu-items?branch=b2',
    )
    expect(screen.getByRole('link', { name: 'Table Setup' })).toHaveAttribute('href', '/admin/tables?branch=b2')
  })

  it('substitutes the first branch on nav links when "All branches" is selected', () => {
    render(<StaffBar role="admin" branches={branches} />)

    expect(screen.getByRole('link', { name: 'Menu Management' })).toHaveAttribute(
      'href',
      '/admin/menu-items?branch=b1',
    )
  })
})
```

- [ ] **Step 6: Run to confirm the new describe block fails**

Run: `npm test -- app/components/StaffBar.test.tsx`
Expected: FAIL — `StaffBar` doesn't accept a `branches` prop yet.

- [ ] **Step 7: Rewrite `StaffBar.tsx`**

Use the Write tool to replace `app/components/StaffBar.tsx` entirely with:

```tsx
'use client'

import { useEffect, useState, Fragment } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/apiClient'
import type { Role } from '@/lib/types'

const COLLAPSED_STORAGE_KEY = 'staffBarCollapsed'
const SELECTED_BRANCH_STORAGE_KEY = 'selectedBranchId'
const BRANCH_AWARE_PATHS = ['/dashboard', '/admin/menu-items', '/admin/tables']

type NavLink = { href: string; label: string; adminOnly: boolean }

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', adminOnly: false },
  { href: '/admin/menu-items', label: 'Menu Management', adminOnly: false },
  { href: '/admin/tables', label: 'Table Setup', adminOnly: true },
  { href: '/admin/payment-methods', label: 'Payment Methods', adminOnly: true },
  { href: '/admin/branches', label: 'Branches', adminOnly: true },
]

type StaffBarProps = { role: Role; branches?: { id: string; name: string }[] }

export function StaffBar({ role, branches = [] }: StaffBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loggingOut, setLoggingOut] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

  const showBranchPicker = role === 'admin' && branches.length > 1

  useEffect(() => {
    // localStorage doesn't exist during SSR, so the collapsed preference can only be read
    // client-side post-mount — rendering expanded first avoids a hydration mismatch.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true')
    } catch {
      // Storage unavailable — default to expanded.
    }
  }, [])

  useEffect(() => {
    if (!showBranchPicker) return

    const isDashboard = pathname === '/dashboard'
    const urlBranch = searchParams.get('branch')
    const urlIsValid =
      urlBranch !== null && (urlBranch === 'all' ? isDashboard : branches.some((b) => b.id === urlBranch))

    let stored: string | null = null
    try {
      stored = localStorage.getItem(SELECTED_BRANCH_STORAGE_KEY)
    } catch {
      // Storage unavailable — fall through to the page-appropriate default.
    }
    const storedIsValid = stored !== null && (stored === 'all' ? isDashboard : branches.some((b) => b.id === stored))

    const resolved = urlIsValid
      ? (urlBranch as string)
      : storedIsValid
        ? (stored as string)
        : isDashboard
          ? 'all'
          : branches[0].id

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedBranchId(resolved)
    try {
      localStorage.setItem(SELECTED_BRANCH_STORAGE_KEY, resolved)
    } catch {
      // Non-critical: the preference just won't survive a reload.
    }

    if (BRANCH_AWARE_PATHS.includes(pathname) && urlBranch !== resolved) {
      router.replace(`${pathname}?branch=${resolved}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams, showBranchPicker])

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next))
      } catch {
        // Non-critical: the preference just won't survive a reload.
      }
      return next
    })
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await apiClient.post('/api/auth/logout', {})
    } catch {
      // Best-effort: even if clearing the session server-side failed, still send the user to /login.
    } finally {
      router.push('/login')
      router.refresh()
      setLoggingOut(false)
    }
  }

  function effectiveBranchIdFor(path: string): string | null {
    if (!selectedBranchId) return null
    if (selectedBranchId !== 'all') return selectedBranchId
    return path === '/dashboard' ? 'all' : (branches[0]?.id ?? null)
  }

  function hrefFor(link: NavLink): string {
    if (!showBranchPicker || !BRANCH_AWARE_PATHS.includes(link.href)) return link.href
    const branchId = effectiveBranchIdFor(link.href)
    return branchId ? `${link.href}?branch=${branchId}` : link.href
  }

  function handleSelectBranch(id: string) {
    setSelectedBranchId(id)
    try {
      localStorage.setItem(SELECTED_BRANCH_STORAGE_KEY, id)
    } catch {
      // Non-critical: the preference just won't survive a reload.
    }
    setBranchPopoverOpen(false)
    if (BRANCH_AWARE_PATHS.includes(pathname)) {
      router.replace(`${pathname}?branch=${id}`)
    }
  }

  if (collapsed) {
    return (
      <div className="staff-strip staff-strip--collapsed">
        <div className="staff-strip__hairline" aria-hidden="true" />
        <button type="button" className="staff-bar__toggle" onClick={toggleCollapsed} aria-label="Show staff bar">
          ▾
        </button>
      </div>
    )
  }

  const visibleLinks = NAV_LINKS.filter((link) => !link.adminOnly || role === 'admin')
  const selectedBranchLabel =
    selectedBranchId === 'all' ? 'All branches' : (branches.find((b) => b.id === selectedBranchId)?.name ?? '')

  return (
    <div className="staff-strip">
      <div className="staff-bar">
        <span className="staff-bar__role">
          <span className="staff-bar__dot" aria-hidden="true" />
          {role}
        </span>
        <span className="staff-bar__actions">
          {visibleLinks.map((link) => (
            <Fragment key={link.href}>
              <Link
                href={hrefFor(link)}
                className={`staff-bar__action${pathname === link.href ? ' staff-bar__action--active' : ''}`}
              >
                {link.label}
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </Fragment>
          ))}
          {showBranchPicker && (
            <span className="staff-bar__branch">
              <button
                type="button"
                className="staff-bar__branch-button"
                onClick={() => setBranchPopoverOpen((v) => !v)}
                aria-expanded={branchPopoverOpen}
              >
                {selectedBranchLabel} ▾
              </button>
              {branchPopoverOpen && (
                <ul className="staff-bar__branch-popover" role="listbox">
                  {pathname === '/dashboard' && (
                    <li>
                      <button type="button" onClick={() => handleSelectBranch('all')}>
                        All branches
                      </button>
                    </li>
                  )}
                  {branches.map((branch) => (
                    <li key={branch.id}>
                      <button type="button" onClick={() => handleSelectBranch(branch.id)}>
                        {branch.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </span>
          )}
          <button
            type="button"
            className="staff-bar__action staff-bar__logout"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            Log out
          </button>
          <button
            type="button"
            className="staff-bar__collapse"
            onClick={toggleCollapsed}
            aria-label="Hide staff bar"
          >
            ▴
          </button>
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Add the branch button/popover CSS**

In `app/globals.css`, after the existing `.staff-bar__logout:disabled` block (lines 2080-2083), add:
```css
.staff-bar__branch {
  position: relative;
}

.staff-bar__branch-button {
  background: var(--copper);
  color: var(--paper);
  border: none;
  border-radius: 6px;
  padding: 0.3rem 0.65rem;
  font-family: inherit;
  font-size: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  min-height: 32px;
}

.staff-bar__branch-button:hover,
.staff-bar__branch-button:focus-visible {
  background: var(--copper-bright);
  outline: none;
}

.staff-bar__branch-popover {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.35rem;
  background: var(--paper);
  border: 1px solid var(--clay-faint);
  border-radius: 8px;
  padding: 0.35rem;
  min-width: 160px;
  list-style: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.staff-bar__branch-popover li + li {
  margin-top: 0.15rem;
}

.staff-bar__branch-popover button {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-radius: 5px;
  padding: 0.4rem 0.5rem;
  color: var(--espresso);
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 0.8rem;
  letter-spacing: normal;
  cursor: pointer;
}

.staff-bar__branch-popover button:hover,
.staff-bar__branch-popover button:focus-visible {
  background: var(--crema);
  outline: none;
}
```

- [ ] **Step 9: Run to confirm `StaffBar.test.tsx` passes**

Run: `npm test -- app/components/StaffBar.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add app/components/StaffBarGate.tsx app/components/StaffBarGate.test.tsx app/components/StaffBar.tsx app/components/StaffBar.test.tsx app/globals.css
git commit -m "feat: add a shared branch picker to StaffBar, synced via URL and localStorage"
```

---

### Task 8: `StaffBar` — mobile hamburger panel at 480px

**Files:**
- Modify: `app/components/StaffBar.tsx` (targeted JSX restructure)
- Modify: `app/components/StaffBar.test.tsx` (append a new describe block)
- Modify: `app/globals.css:2007-2017` and surrounding

**Interfaces:**
- Consumes: nothing new.
- Produces: no prop/behavior change for anything outside `StaffBar` — purely a responsive layout change plus one new interactive control (the hamburger).

- [ ] **Step 1: Append the failing test block to `StaffBar.test.tsx`**

Add this describe block at the end of the file, before the final closing `})`:

```tsx
describe('StaffBar mobile nav panel', () => {
  it('renders a hamburger toggle for opening/closing the nav panel', () => {
    render(<StaffBar role="staff" />)
    expect(screen.getByRole('button', { name: 'Show navigation' })).toBeInTheDocument()
  })

  it('nav links and Log out are present in the DOM regardless of panel state (visibility is CSS-driven)', () => {
    render(<StaffBar role="staff" />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('toggles the open class on the nav panel when the hamburger is clicked', async () => {
    const user = userEvent.setup()
    render(<StaffBar role="staff" />)

    const hamburger = screen.getByRole('button', { name: 'Show navigation' })
    await user.click(hamburger)
    expect(screen.getByRole('link', { name: 'Dashboard' }).closest('nav')).toHaveClass('staff-bar__nav--open')
    expect(screen.getByRole('button', { name: 'Hide navigation' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide navigation' }))
    expect(screen.getByRole('link', { name: 'Dashboard' }).closest('nav')).not.toHaveClass('staff-bar__nav--open')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test -- app/components/StaffBar.test.tsx`
Expected: FAIL — there's no hamburger button or `<nav>` element yet.

- [ ] **Step 3: Restructure the returned JSX in `StaffBar.tsx`**

Add a new state hook, alongside the existing ones:
```ts
  const [navPanelOpen, setNavPanelOpen] = useState(false)
```

Replace the entire `return (...)` block for the non-collapsed case — from:
```tsx
  return (
    <div className="staff-strip">
      <div className="staff-bar">
        <span className="staff-bar__role">
          <span className="staff-bar__dot" aria-hidden="true" />
          {role}
        </span>
        <span className="staff-bar__actions">
          {visibleLinks.map((link) => (
            <Fragment key={link.href}>
              <Link
                href={hrefFor(link)}
                className={`staff-bar__action${pathname === link.href ? ' staff-bar__action--active' : ''}`}
              >
                {link.label}
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </Fragment>
          ))}
          {showBranchPicker && (
            <span className="staff-bar__branch">
              <button
                type="button"
                className="staff-bar__branch-button"
                onClick={() => setBranchPopoverOpen((v) => !v)}
                aria-expanded={branchPopoverOpen}
              >
                {selectedBranchLabel} ▾
              </button>
              {branchPopoverOpen && (
                <ul className="staff-bar__branch-popover" role="listbox">
                  {pathname === '/dashboard' && (
                    <li>
                      <button type="button" onClick={() => handleSelectBranch('all')}>
                        All branches
                      </button>
                    </li>
                  )}
                  {branches.map((branch) => (
                    <li key={branch.id}>
                      <button type="button" onClick={() => handleSelectBranch(branch.id)}>
                        {branch.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </span>
          )}
          <button
            type="button"
            className="staff-bar__action staff-bar__logout"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            Log out
          </button>
          <button
            type="button"
            className="staff-bar__collapse"
            onClick={toggleCollapsed}
            aria-label="Hide staff bar"
          >
            ▴
          </button>
        </span>
      </div>
    </div>
  )
```
to:
```tsx
  return (
    <div className="staff-strip">
      <div className="staff-bar">
        <div className="staff-bar__pinned">
          <span className="staff-bar__role">
            <span className="staff-bar__dot" aria-hidden="true" />
            {role}
          </span>
          <span className="staff-bar__pinned-right">
            {showBranchPicker && (
              <span className="staff-bar__branch">
                <button
                  type="button"
                  className="staff-bar__branch-button"
                  onClick={() => setBranchPopoverOpen((v) => !v)}
                  aria-expanded={branchPopoverOpen}
                >
                  {selectedBranchLabel} ▾
                </button>
                {branchPopoverOpen && (
                  <ul className="staff-bar__branch-popover" role="listbox">
                    {pathname === '/dashboard' && (
                      <li>
                        <button type="button" onClick={() => handleSelectBranch('all')}>
                          All branches
                        </button>
                      </li>
                    )}
                    {branches.map((branch) => (
                      <li key={branch.id}>
                        <button type="button" onClick={() => handleSelectBranch(branch.id)}>
                          {branch.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            )}
            <button
              type="button"
              className="staff-bar__collapse"
              onClick={toggleCollapsed}
              aria-label="Hide staff bar"
            >
              ▴
            </button>
            <button
              type="button"
              className="staff-bar__hamburger"
              onClick={() => setNavPanelOpen((v) => !v)}
              aria-expanded={navPanelOpen}
              aria-label={navPanelOpen ? 'Hide navigation' : 'Show navigation'}
            >
              ☰
            </button>
          </span>
        </div>
        <nav className={`staff-bar__nav${navPanelOpen ? ' staff-bar__nav--open' : ''}`}>
          {visibleLinks.map((link) => (
            <Fragment key={link.href}>
              <Link
                href={hrefFor(link)}
                className={`staff-bar__action${pathname === link.href ? ' staff-bar__action--active' : ''}`}
              >
                {link.label}
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </Fragment>
          ))}
          <button
            type="button"
            className="staff-bar__action staff-bar__logout"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            Log out
          </button>
        </nav>
      </div>
    </div>
  )
```

- [ ] **Step 4: Update the CSS layout**

In `app/globals.css`, replace the `.staff-bar` rule (lines 2007-2017):
```css
.staff-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  padding: 0.5rem 1.25rem;
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}
```
with:
```css
.staff-bar {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.staff-bar__pinned {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.staff-bar__pinned-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.staff-bar__nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
}

.staff-bar__hamburger {
  display: none;
  background: none;
  border: 1px solid var(--clay-faint);
  color: var(--crema);
  border-radius: 6px;
  min-width: 32px;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.85rem;
}

.staff-bar__hamburger:hover,
.staff-bar__hamburger:focus-visible {
  border-color: var(--copper-bright);
  color: var(--copper-bright);
  outline: none;
}

@media (max-width: 480px) {
  .staff-bar__hamburger {
    display: inline-flex;
  }

  .staff-bar__nav {
    display: none;
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--clay-faint);
  }

  .staff-bar__nav--open {
    display: flex;
  }
}
```

Note `.staff-bar__actions` (lines 2036-2040) is now dead CSS since the JSX no longer uses that class — remove it:
```css
.staff-bar__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
```

- [ ] **Step 5: Run to confirm `StaffBar.test.tsx` passes**

Run: `npm test -- app/components/StaffBar.test.tsx`
Expected: PASS, all tests green (jsdom doesn't evaluate the media query, so these tests only assert the class toggling, not literal pixel visibility — that's expected and matches how this repo tests responsive CSS elsewhere: it doesn't).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/StaffBar.tsx app/components/StaffBar.test.tsx app/globals.css
git commit -m "feat: collapse StaffBar nav behind a hamburger on narrow screens"
```

---

### Task 9: Dashboard — remove the branch tab strip, consume the header's branch context

**Files:**
- Modify: `app/dashboard/PendingOrdersDashboard.tsx:1,29-40,215-254`
- Modify: `app/dashboard/PendingOrdersDashboard.test.tsx:1-14,515-626`
- Modify: `app/dashboard/page.test.tsx:1-19,65-78`
- Modify: `app/globals.css:1754-1756`

**Interfaces:**
- Consumes: `useSearchParams().get('branch')` (Next.js built-in) instead of internal tab-click state.
- Produces: `PendingOrdersDashboard({ role, branches })` — same props; `branches` is still used for `showBranchTag`, just no longer for rendering a tab strip.

- [ ] **Step 1: Update `PendingOrdersDashboard.test.tsx` first — add the `next/navigation` mock and replace the "branch tabs" describe block**

Add near the top of the file, after the existing `vi.mock('@/lib/apiClient', ...)` block:
```ts
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))
```

Update the top-level `beforeEach` (currently `vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(...)`) to also reset it:
```ts
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:02:00.000Z'))
    mockSearchParams = new URLSearchParams()
  })
```

Replace the entire `describe('branch tabs (admin only)', ...)` block (the last describe block in the file, right before the file's final two closing `})`) with:
```tsx
  describe('branch scoping (admin only, via header context)', () => {
    it('renders no branch tab strip regardless of branches or ?branch=', async () => {
      mockSearchParams = new URLSearchParams('branch=b2')
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

      expect(screen.queryByRole('tablist', { name: 'Branch' })).not.toBeInTheDocument()
    })

    it('defaults to showing every branch\'s orders with a branch tag when there is no ?branch=', async () => {
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

    it('scopes orders to the branch named in ?branch=, hiding the branch tag', async () => {
      mockSearchParams = new URLSearchParams('branch=b2')
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

      expect(screen.getByText('Table 7')).toBeInTheDocument()
      expect(screen.queryByText('Table 4')).not.toBeInTheDocument()
      expect(screen.queryByText('· Downtown')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Pending (1)' })).toBeInTheDocument()
    })

    it('an explicit ?branch=all behaves the same as no ?branch= at all', async () => {
      mockSearchParams = new URLSearchParams('branch=all')
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
    })

    it('never shows a branch tag when branches is empty, even with no ?branch=', async () => {
      mockTabs({ pending: [orderA] })
      render(<PendingOrdersDashboard />)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.queryByText('· Main')).not.toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test -- app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: FAIL — `PendingOrdersDashboard` doesn't call `useSearchParams()` yet, and still renders a clickable tab strip.

- [ ] **Step 3: Update `PendingOrdersDashboard.tsx`**

Add the import (alongside the existing `useEffect, useRef, useState` import, line 3):
```tsx
import { useSearchParams } from 'next/navigation'
```

Replace:
```tsx
export function PendingOrdersDashboard({
  role = 'staff',
  branches = [],
}: { role?: Role; branches?: { id: string; name: string }[] } = {}) {
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest')
  const [activeBranch, setActiveBranch] = useState<'all' | string>('all')
```
with:
```tsx
export function PendingOrdersDashboard({
  role = 'staff',
  branches = [],
}: { role?: Role; branches?: { id: string; name: string }[] } = {}) {
  const searchParams = useSearchParams()
  const activeBranch = searchParams.get('branch') ?? 'all'
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest')
```

Remove the branch tab-strip block:
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
(leave the following `<div className="order-rail__tabs" role="tablist">` Pending/Confirmed block exactly where it is, unchanged).

- [ ] **Step 4: Remove the now-unused `.order-rail__tabs--branch` CSS**

In `app/globals.css`, remove (lines 1754-1756):
```css
.order-rail__tabs--branch {
  margin-bottom: 0.75rem;
}
```

- [ ] **Step 5: Run to confirm `PendingOrdersDashboard.test.tsx` passes**

Run: `npm test -- app/dashboard/PendingOrdersDashboard.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 6: Update `app/dashboard/page.test.tsx`**

Add a `next/navigation` mock near the top (after the existing `vi.mock('@/lib/branchService', ...)` block):
```ts
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
```

Replace the last test in the file (lines 65-78):
```tsx
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
with:
```tsx
  it('fetches branches for an admin session but renders no branch tab strip', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
    ] as never)

    const ui = await DashboardPage()
    render(ui)

    expect(listBranches).toHaveBeenCalled()
    expect(screen.queryByRole('tablist', { name: 'Branch' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 7: Run to confirm `page.test.tsx` passes**

Run: `npm test -- app/dashboard/page.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/dashboard/PendingOrdersDashboard.tsx app/dashboard/PendingOrdersDashboard.test.tsx app/dashboard/page.test.tsx app/globals.css
git commit -m "refactor: dashboard branch scoping comes from the header context, not its own tab strip"
```

---

### Task 10: Menu Management & Table Setup — remove the inline `BranchSelector`

**Files:**
- Modify: `app/admin/menu-items/page.tsx:1-56`
- Modify: `app/admin/menu-items/page.test.tsx:1-108`
- Modify: `app/admin/tables/page.tsx:1-67`
- Modify: `app/admin/tables/page.test.tsx:1-96`
- Delete: `app/components/BranchSelector.tsx`
- Delete: `app/components/BranchSelector.test.tsx`
- Modify: `app/globals.css:2707-2717`

**Interfaces:**
- Consumes: nothing new — `resolveBranchId(session, requestedBranchId)` keeps resolving `?branch=` exactly as before; that param now arrives pre-populated from `StaffBar` (Task 7) instead of a page-local `<select>`.
- Produces: no change to either page's exported default component signature.

- [ ] **Step 1: Update `app/admin/menu-items/page.test.tsx` first**

Remove the `BranchSelector` mock:
```ts
vi.mock('@/app/components/BranchSelector', () => ({
  BranchSelector: ({ branches }: { branches: { id: string; name: string }[] }) => (
    <div>Branch Selector ({branches.length})</div>
  ),
}))
```

Replace the `@/lib/branchService` mock and its `beforeEach` usage — replace:
```ts
vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
  listBranches: vi.fn(),
}))
```
with:
```ts
vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
}))
```

Replace:
```ts
import { resolveBranchId, listBranches } from '@/lib/branchService'
```
with:
```ts
import { resolveBranchId } from '@/lib/branchService'
```

Remove this line from the top-level `beforeEach`:
```ts
    vi.mocked(listBranches).mockResolvedValue([{ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }] as never)
```

Replace the "shows the create form and branch selector for an admin session" test:
```tsx
  it('shows the create form and branch selector for an admin session', async () => {
    const ui = await callPage('admin')
    render(ui)

    expect(screen.getByText('Create Menu Item Form')).toBeInTheDocument()
    expect(screen.getByText('Branch Selector (1)')).toBeInTheDocument()
  })
```
with:
```tsx
  it('shows the create form for an admin session, with no inline branch selector', async () => {
    const ui = await callPage('admin')
    render(ui)

    expect(screen.getByText('Create Menu Item Form')).toBeInTheDocument()
    expect(screen.queryByText(/Branch Selector/)).not.toBeInTheDocument()
  })
```

Also update the "shows the Menu Management heading for a staff session..." test's assertion text (line 67) since `/Branch Selector/` no longer needs special-casing per role — this assertion (`expect(screen.queryByText(/Branch Selector/)).not.toBeInTheDocument()`) already holds true for staff too and can stay unchanged.

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test -- app/admin/menu-items/page.test.tsx`
Expected: FAIL — the page still renders a "Branch Selector (1)" div today.

- [ ] **Step 3: Update `app/admin/menu-items/page.tsx`**

Replace:
```tsx
import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { resolveBranchId, listBranches } from '@/lib/branchService'
import { BranchSelector } from '@/app/components/BranchSelector'
import { CreateMenuItemForm } from './CreateMenuItemForm'
import { MenuItemRow } from './MenuItemRow'

export default async function AdminMenuItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'
  const { branch: requestedBranchId } = await searchParams

  const branchId = await resolveBranchId(session, isAdmin ? requestedBranchId : undefined)
  const [items, branches] = await Promise.all([
    listMenuItemsWithAvailability(branchId),
    isAdmin ? listBranches() : Promise.resolve([]),
  ])

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Menu Management</h1>
      </header>
      {isAdmin && (
        <BranchSelector branches={branches.map((b) => ({ id: b.id, name: b.name }))} selectedBranchId={branchId} />
      )}
      {isAdmin && (
```
with:
```tsx
import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { resolveBranchId } from '@/lib/branchService'
import { CreateMenuItemForm } from './CreateMenuItemForm'
import { MenuItemRow } from './MenuItemRow'

export default async function AdminMenuItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'
  const { branch: requestedBranchId } = await searchParams

  const branchId = await resolveBranchId(session, isAdmin ? requestedBranchId : undefined)
  const items = await listMenuItemsWithAvailability(branchId)

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Menu Management</h1>
      </header>
      {isAdmin && (
```

- [ ] **Step 4: Run to confirm `page.test.tsx` passes**

Run: `npm test -- app/admin/menu-items/page.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Update `app/admin/tables/page.test.tsx` first**

Remove the `BranchSelector` mock:
```ts
vi.mock('@/app/components/BranchSelector', () => ({
  BranchSelector: ({ branches }: { branches: { id: string; name: string }[] }) => (
    <div>Branch Selector ({branches.length})</div>
  ),
}))
```

Replace:
```ts
vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
  listBranches: vi.fn(),
}))
```
with:
```ts
vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
}))
```

Replace:
```ts
import { resolveBranchId, listBranches } from '@/lib/branchService'
```
with:
```ts
import { resolveBranchId } from '@/lib/branchService'
```

Remove this line from the top-level `beforeEach`:
```ts
    vi.mocked(listBranches).mockResolvedValue([{ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }] as never)
```

Replace the "shows the Table Setup heading, branch selector, and create form" test:
```tsx
  it('shows the Table Setup heading, branch selector, and create form', async () => {
    const ui = await callPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Table Setup' })).toBeInTheDocument()
    expect(screen.getByText('Branch Selector (1)')).toBeInTheDocument()
    expect(screen.getByText('Create Table Form')).toBeInTheDocument()
  })
```
with:
```tsx
  it('shows the Table Setup heading and create form, with no inline branch selector', async () => {
    const ui = await callPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Table Setup' })).toBeInTheDocument()
    expect(screen.queryByText(/Branch Selector/)).not.toBeInTheDocument()
    expect(screen.getByText('Create Table Form')).toBeInTheDocument()
  })
```

- [ ] **Step 6: Run to confirm it fails**

Run: `npm test -- app/admin/tables/page.test.tsx`
Expected: FAIL — the page still renders a "Branch Selector (1)" div today.

- [ ] **Step 7: Update `app/admin/tables/page.tsx`**

Replace:
```tsx
import { headers } from 'next/headers'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { resolveBranchId, listBranches } from '@/lib/branchService'
import { generateQrDataUrl } from '@/lib/qrCode'
import { BranchSelector } from '@/app/components/BranchSelector'
import { CreateOrderingPointForm } from './CreateOrderingPointForm'

export default async function AdminTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('admin')
  const { branch: requestedBranchId } = await searchParams

  const [branchId, branches] = await Promise.all([
    resolveBranchId(session, requestedBranchId),
    listBranches(),
  ])
  const orderingPoints = await listOrderingPoints(branchId)
```
with:
```tsx
import { headers } from 'next/headers'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { resolveBranchId } from '@/lib/branchService'
import { generateQrDataUrl } from '@/lib/qrCode'
import { CreateOrderingPointForm } from './CreateOrderingPointForm'

export default async function AdminTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('admin')
  const { branch: requestedBranchId } = await searchParams

  const branchId = await resolveBranchId(session, requestedBranchId)
  const orderingPoints = await listOrderingPoints(branchId)
```

Remove the selector render:
```tsx
      <BranchSelector branches={branches.map((b) => ({ id: b.id, name: b.name }))} selectedBranchId={branchId} />
```

- [ ] **Step 8: Run to confirm `page.test.tsx` passes**

Run: `npm test -- app/admin/tables/page.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 9: Delete the now-unused `BranchSelector` component and its test**

```bash
git rm app/components/BranchSelector.tsx app/components/BranchSelector.test.tsx
```

- [ ] **Step 10: Remove the now-unused CSS**

In `app/globals.css`, remove (lines 2707-2717):
```css
.branch-selector {
  display: block;
  max-width: 640px;
  margin: 1.5rem auto 0;
  padding: 0 1.5rem;
}

.branch-selector__select {
  max-width: 280px;
  cursor: pointer;
}
```

- [ ] **Step 11: Run the full suite to confirm nothing else references `BranchSelector`**

Run: `grep -rn "BranchSelector" --include=*.ts --include=*.tsx app` (expected: no output) then `npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: remove the inline branch selector from Menu Management and Table Setup"
```

---

## Final verification

- [ ] Run `npm test` once more from a clean state to confirm the whole suite is green end-to-end.
- [ ] Run `npm run lint` to catch any unused-import or type issues introduced across the ten tasks.
- [ ] Manually smoke-test in a dev server (`npm run dev`) with a seeded multi-branch admin account: confirm the header branch button appears, switching branches updates Dashboard/Menu Management/Table Setup, the Branches page's chevron/actions row works, `/admin/settings` 404s, and the mobile hamburger (narrow the browser window below 480px) tucks the nav away while the branch button stays visible.
