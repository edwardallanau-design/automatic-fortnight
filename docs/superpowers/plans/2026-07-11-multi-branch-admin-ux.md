# Multi-branch admin UX Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create/rename/open-close/rotate-password branches, and give admin a real branch selector on Table Setup and Menu Management instead of the current hardcoded fallback to "Main".

**Architecture:** `lib/branchService.ts` grows real CRUD on top of Plan 1's already-merged `Branch`/`Credential`/`OrderingPoint`/`MenuItemSoldOut` schema (no migration needed — this plan is purely additive). `resolveBranchId` gains a second parameter so an admin-selected branch (carried via a `?branch=<id>` URL param, matching this app's existing `/order?table=<id>` convention) can override the Main-branch fallback; staff sessions ignore it unconditionally, preserving Plan 1's security boundary. A new `/admin/branches` page and a shared `BranchSelector` component round out the UI.

**Tech Stack:** Next.js App Router (server components + route handlers), Prisma/PostgreSQL, bcrypt, Vitest + Testing Library. No new dependencies.

## Global Constraints

- No branch deletion in this plan (per the design spec) — only create/rename/toggle `acceptingOrders`/rotate password.
- `INV-15`: a branch's staff password must not collide with any other credential's password in the system (admin's, or any other branch's). Checked at write time via `bcrypt.compare` against every existing `Credential` row, excluding the target branch's own current credential when rotating (so re-saving the same password isn't a false-positive collision against itself).
- Staff sessions **always** win: `resolveBranchId`'s new `requestedBranchId` parameter is honored **only** when `session.branchId` is absent (admin). A staff session's own `branchId` is returned unconditionally, even if a different `requestedBranchId` is supplied — this is a security boundary from Plan 1, not just a default preference, and must not be weakened.
- No `GET /api/branches` route — every consumer is a server component reading `branchService` directly, matching the existing `VenueSettings` precedent (no `GET /api/venue-settings` either).
- Branch password is required at creation (not optional/set-later).
- Branch selector mechanism is the URL query param `?branch=<id>`, not client-side-only state — matches this app's existing `?table=<id>` convention on `/order`.
- Work branches off `dev` (Plan 1 is merged at `07f6755`); this plan needs no database migration.
- Spec: `docs/superpowers/specs/2026-07-11-multi-branch-admin-ux-design.md`.

---

### Task 1: `lib/branchService.ts` — real CRUD + `resolveBranchId`'s new parameter

**Files:**
- Modify: `lib/branchService.ts`
- Modify: `lib/branchService.test.ts`

**Interfaces:**
- Consumes: `prisma.branch`, `prisma.credential`, `prisma.orderingPoint` (existing Prisma models from Plan 1).
- Produces: `listBranches(): Promise<Branch[]>`, `createBranch(name: string, password: string): Promise<Branch>`, `renameBranch(id: string, name: string): Promise<Branch>`, `setBranchAcceptingOrders(id: string, acceptingOrders: boolean): Promise<Branch>`, `setBranchPassword(id: string, password: string): Promise<void>` — all used by Task 2's API routes. `resolveBranchId(session: { branchId?: string }, requestedBranchId?: string): Promise<string>` — the new second parameter is used by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests for the CRUD functions**

Add these `describe` blocks to the end of `lib/branchService.test.ts` (keep the existing `getBranchOrThrow`/`getMainBranch`/`resolveBranchId` blocks — `resolveBranchId`'s block is replaced in Step 3 below, not here):

```ts
describe('branchService.listBranches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all branches ordered by name', async () => {
    const branches = [
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() },
    ]
    vi.mocked(prisma.branch.findMany).mockResolvedValue(branches as never)

    const result = await listBranches()
    expect(result).toEqual(branches)
    expect(prisma.branch.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } })
  })
})

describe('branchService.createBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.credential.findMany).mockResolvedValue([])
  })

  it('creates a branch, its Counter ordering point, and its credential', async () => {
    const created = { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() }
    vi.mocked(prisma.branch.create).mockResolvedValue(created as never)
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as never)

    const result = await createBranch('Downtown', 'downtown-pw')

    expect(result).toEqual(created)
    expect(prisma.branch.create).toHaveBeenCalledWith({ data: { name: 'Downtown' } })
    expect(prisma.orderingPoint.create).toHaveBeenCalledWith({
      data: { branchId: 'b2', label: 'Counter', isCounter: true },
    })
    expect(prisma.credential.create).toHaveBeenCalledWith({
      data: { role: 'staff', branchId: 'b2', passwordHash: 'hashed-pw' },
    })
  })

  it('throws ConflictError when the password collides with an existing credential', async () => {
    const existingHash = await realBcrypt.hash('taken-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: 'c1', role: 'admin', branchId: null, passwordHash: existingHash },
    ] as never)
    vi.mocked(bcrypt.compare).mockImplementation((plain) => realBcrypt.compare(plain as string, existingHash))

    await expect(createBranch('Downtown', 'taken-pw')).rejects.toThrow(ConflictError)
    expect(prisma.branch.create).not.toHaveBeenCalled()
  })
})

describe('branchService.renameBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the branch name', async () => {
    const updated = { id: 'b1', name: 'Main Street', acceptingOrders: true, createdAt: new Date() }
    vi.mocked(prisma.branch.update).mockResolvedValue(updated as never)

    const result = await renameBranch('b1', 'Main Street')
    expect(result).toEqual(updated)
    expect(prisma.branch.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { name: 'Main Street' } })
  })
})

describe('branchService.setBranchAcceptingOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the branch acceptingOrders flag', async () => {
    const updated = { id: 'b1', name: 'Main', acceptingOrders: false, createdAt: new Date() }
    vi.mocked(prisma.branch.update).mockResolvedValue(updated as never)

    const result = await setBranchAcceptingOrders('b1', false)
    expect(result).toEqual(updated)
    expect(prisma.branch.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { acceptingOrders: false } })
  })
})

describe('branchService.setBranchPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.credential.findMany).mockResolvedValue([])
  })

  it('updates the branch credential passwordHash', async () => {
    vi.mocked(bcrypt.hash).mockResolvedValue('new-hashed-pw' as never)

    await setBranchPassword('b1', 'new-pw')

    expect(prisma.credential.findMany).toHaveBeenCalledWith({ where: { branchId: { not: 'b1' } } })
    expect(prisma.credential.update).toHaveBeenCalledWith({
      where: { branchId: 'b1' },
      data: { passwordHash: 'new-hashed-pw' },
    })
  })

  it('throws ConflictError when the new password collides with a DIFFERENT credential', async () => {
    const existingHash = await realBcrypt.hash('other-branch-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: 'c2', role: 'staff', branchId: 'b2', passwordHash: existingHash },
    ] as never)
    vi.mocked(bcrypt.compare).mockImplementation((plain) => realBcrypt.compare(plain as string, existingHash))

    await expect(setBranchPassword('b1', 'other-branch-pw')).rejects.toThrow(ConflictError)
    expect(prisma.credential.update).not.toHaveBeenCalled()
  })

  it('excludes the branch\'s own current credential from the collision scan (re-saving the same password succeeds)', async () => {
    vi.mocked(bcrypt.hash).mockResolvedValue('same-hashed-pw' as never)

    await expect(setBranchPassword('b1', 'same-pw-as-before')).resolves.toBeUndefined()

    expect(prisma.credential.findMany).toHaveBeenCalledWith({ where: { branchId: { not: 'b1' } } })
  })
})
```

Update the mock block at the top of `lib/branchService.test.ts` — replace the existing `vi.mock('./prisma', ...)` with:

```ts
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import bcrypt from 'bcrypt'
import { getBranchOrThrow, getMainBranch, resolveBranchId, listBranches, createBranch, renameBranch, setBranchAcceptingOrders, setBranchPassword } from './branchService'
import { NotFoundError, ConflictError } from './errors'
import { prisma } from './prisma'

let realBcrypt: typeof import('bcrypt')

beforeAll(async () => {
  realBcrypt = await vi.importActual<typeof import('bcrypt')>('bcrypt')
})

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}))

vi.mock('./prisma', () => ({
  prisma: {
    branch: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    credential: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orderingPoint: {
      create: vi.fn(),
    },
  },
}))
```

Note: `vi.mock('bcrypt', ...)` replaces the module by specifier — a second plain `import` of `'bcrypt'` under a different local name would still resolve to the same mock, not the real module. `vi.importActual('bcrypt')` is the correct way to bypass the mock and get genuine `hash`/`compare` behavior, needed by the tests below that simulate a real password collision (they hash a real password, then wire the mocked `bcrypt.compare` to delegate to the real `compare` against that hash — that's the only way to make the mocked `compare` return `true` for a matching password and `false` for a non-matching one, exactly like the real function would).

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run lib/branchService.test.ts`
Expected: FAIL — `listBranches`, `createBranch`, `renameBranch`, `setBranchAcceptingOrders`, `setBranchPassword` don't exist yet.

- [ ] **Step 3: Update the existing `resolveBranchId` tests for the new parameter**

Replace the existing `describe('branchService.resolveBranchId', ...)` block with:

```ts
describe('branchService.resolveBranchId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the session's own branchId when present (staff), ignoring requestedBranchId entirely", async () => {
    const result = await resolveBranchId({ branchId: 'b2' }, 'some-other-branch')
    expect(result).toBe('b2')
    expect(prisma.branch.findFirst).not.toHaveBeenCalled()
    expect(prisma.branch.findUnique).not.toHaveBeenCalled()
  })

  it('honors a valid requestedBranchId when the session has no branchId (admin)', async () => {
    vi.mocked(prisma.branch.findUnique).mockResolvedValue({ id: 'b3', name: 'Downtown', acceptingOrders: true, createdAt: new Date() } as never)

    const result = await resolveBranchId({}, 'b3')
    expect(result).toBe('b3')
    expect(prisma.branch.findFirst).not.toHaveBeenCalled()
  })

  it('falls back to the Main branch when the session has no branchId and no requestedBranchId is given', async () => {
    vi.mocked(prisma.branch.findFirst).mockResolvedValue({ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() } as never)

    const result = await resolveBranchId({})
    expect(result).toBe('b1')
  })

  it('throws NotFoundError when requestedBranchId does not name a real branch', async () => {
    vi.mocked(prisma.branch.findUnique).mockResolvedValue(null)

    await expect(resolveBranchId({}, 'nonexistent')).rejects.toThrow(NotFoundError)
  })
})
```

- [ ] **Step 4: Run the tests to verify they still fail (for the right reason)**

Run: `npx vitest run lib/branchService.test.ts`
Expected: FAIL — `resolveBranchId` doesn't accept a second parameter yet.

- [ ] **Step 5: Implement the CRUD functions and the `INV-15` collision helper**

Replace the entire contents of `lib/branchService.ts`:

```ts
import bcrypt from 'bcrypt'
import type { Branch } from '@prisma/client'
import { prisma } from './prisma'
import { NotFoundError, ConflictError } from './errors'

export async function getBranchOrThrow(id: string): Promise<Branch> {
  const branch = await prisma.branch.findUnique({ where: { id } })
  if (!branch) {
    throw new NotFoundError('Branch not found')
  }
  return branch
}

export async function getMainBranch(): Promise<Branch> {
  const branch = await prisma.branch.findFirst({ where: { name: 'Main' } })
  if (!branch) {
    throw new NotFoundError('Main branch not found')
  }
  return branch
}

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

export async function listBranches(): Promise<Branch[]> {
  return prisma.branch.findMany({ orderBy: { name: 'asc' } })
}

async function assertPasswordAvailable(password: string, excludeBranchId?: string): Promise<void> {
  const credentials = await prisma.credential.findMany(
    excludeBranchId ? { where: { branchId: { not: excludeBranchId } } } : undefined,
  )
  for (const credential of credentials) {
    if (await bcrypt.compare(password, credential.passwordHash)) {
      throw new ConflictError('This password is already in use by another branch or the admin login')
    }
  }
}

export async function createBranch(name: string, password: string): Promise<Branch> {
  await assertPasswordAvailable(password)

  const branch = await prisma.branch.create({ data: { name } })
  await prisma.orderingPoint.create({ data: { branchId: branch.id, label: 'Counter', isCounter: true } })
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.credential.create({ data: { role: 'staff', branchId: branch.id, passwordHash } })

  return branch
}

export async function renameBranch(id: string, name: string): Promise<Branch> {
  return prisma.branch.update({ where: { id }, data: { name } })
}

export async function setBranchAcceptingOrders(id: string, acceptingOrders: boolean): Promise<Branch> {
  return prisma.branch.update({ where: { id }, data: { acceptingOrders } })
}

export async function setBranchPassword(id: string, password: string): Promise<void> {
  await assertPasswordAvailable(password, id)

  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.credential.update({ where: { branchId: id }, data: { passwordHash } })
}
```

Note on `assertPasswordAvailable`'s `findMany` call: when `excludeBranchId` is given, the `where: { branchId: { not: excludeBranchId } }` clause excludes that branch's row but still includes the admin row (`branchId: null`) and every other branch's row — Prisma's `not` filter on a nullable field still matches `null` rows correctly (a `null` value is never equal to a non-null `excludeBranchId`, so it passes the `not` filter and is included in the scan, which is exactly what we want).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/branchService.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Commit**

```bash
git add lib/branchService.ts lib/branchService.test.ts
git commit -m "branchService: add create/rename/toggle/password-rotate CRUD, resolveBranchId's requestedBranchId param"
```

---

### Task 2: `POST /api/branches`, `PATCH /api/branches/:id`

**Files:**
- Create: `app/api/branches/route.ts`
- Create: `app/api/branches/route.test.ts`
- Create: `app/api/branches/[id]/route.ts`
- Create: `app/api/branches/[id]/route.test.ts`

**Interfaces:**
- Consumes: `createBranch`, `renameBranch`, `setBranchAcceptingOrders`, `setBranchPassword` (Task 1).
- Produces: `POST /api/branches` (admin-only, body `{ name, password }`), `PATCH /api/branches/:id` (admin-only, body may include any of `{ name, acceptingOrders, password }`) — used by Task 3's UI.

- [ ] **Step 1: Write the failing tests for `POST /api/branches`**

Create `app/api/branches/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ForbiddenError, ConflictError } from '@/lib/errors'

vi.mock('@/lib/branchService', () => ({
  createBranch: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createBranch } from '@/lib/branchService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/branches', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('creates a branch on success', async () => {
    const created = { id: 'b2', name: 'Downtown', acceptingOrders: true, createdAt: new Date() }
    vi.mocked(createBranch).mockResolvedValue(created as never)

    const res = await POST(makeRequest({ name: 'Downtown', password: 'downtown-pw' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Downtown')
    expect(createBranch).toHaveBeenCalledWith('Downtown', 'downtown-pw')
    expect(requireApiRole).toHaveBeenCalledWith('admin')
  })

  it('returns 400 when name is missing or blank', async () => {
    const res = await POST(makeRequest({ name: '  ', password: 'pw' }))

    expect(res.status).toBe(400)
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('returns 400 when password is missing or blank', async () => {
    const res = await POST(makeRequest({ name: 'Downtown', password: '' }))

    expect(res.status).toBe(400)
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('returns 409 when the password collides with an existing credential', async () => {
    vi.mocked(createBranch).mockRejectedValue(new ConflictError('This password is already in use by another branch or the admin login'))

    const res = await POST(makeRequest({ name: 'Downtown', password: 'taken-pw' }))

    expect(res.status).toBe(409)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makeRequest({ name: 'Downtown', password: 'downtown-pw' }))

    expect(res.status).toBe(403)
    expect(createBranch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/branches/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the `POST /api/branches` implementation**

Create `app/api/branches/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createBranch } from '@/lib/branchService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new ValidationError('name is required')
    }
    if (typeof body.password !== 'string' || body.password.trim() === '') {
      throw new ValidationError('password is required')
    }

    const branch = await createBranch(body.name.trim(), body.password)
    return NextResponse.json(branch, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/branches/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing tests for `PATCH /api/branches/:id`**

Create `app/api/branches/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { ForbiddenError, ConflictError, NotFoundError } from '@/lib/errors'

vi.mock('@/lib/branchService', () => ({
  renameBranch: vi.fn(),
  setBranchAcceptingOrders: vi.fn(),
  setBranchPassword: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { renameBranch, setBranchAcceptingOrders, setBranchPassword } from '@/lib/branchService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/branches/b1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

const branch = { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }

describe('PATCH /api/branches/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('renames the branch when name is provided', async () => {
    vi.mocked(renameBranch).mockResolvedValue({ ...branch, name: 'Main Street' } as never)

    const res = await PATCH(makeRequest({ name: 'Main Street' }), makeContext('b1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Main Street')
    expect(renameBranch).toHaveBeenCalledWith('b1', 'Main Street')
    expect(setBranchAcceptingOrders).not.toHaveBeenCalled()
    expect(setBranchPassword).not.toHaveBeenCalled()
  })

  it('toggles acceptingOrders when provided', async () => {
    vi.mocked(setBranchAcceptingOrders).mockResolvedValue({ ...branch, acceptingOrders: false } as never)

    const res = await PATCH(makeRequest({ acceptingOrders: false }), makeContext('b1'))

    expect(res.status).toBe(200)
    expect(setBranchAcceptingOrders).toHaveBeenCalledWith('b1', false)
    expect(renameBranch).not.toHaveBeenCalled()
  })

  it('rotates the password when provided', async () => {
    vi.mocked(setBranchPassword).mockResolvedValue(undefined)

    const res = await PATCH(makeRequest({ password: 'new-pw' }), makeContext('b1'))

    expect(res.status).toBe(200)
    expect(setBranchPassword).toHaveBeenCalledWith('b1', 'new-pw')
  })

  it('applies multiple fields in one request', async () => {
    vi.mocked(renameBranch).mockResolvedValue({ ...branch, name: 'Main Street' } as never)
    vi.mocked(setBranchAcceptingOrders).mockResolvedValue({ ...branch, name: 'Main Street', acceptingOrders: false } as never)

    const res = await PATCH(makeRequest({ name: 'Main Street', acceptingOrders: false }), makeContext('b1'))

    expect(res.status).toBe(200)
    expect(renameBranch).toHaveBeenCalledWith('b1', 'Main Street')
    expect(setBranchAcceptingOrders).toHaveBeenCalledWith('b1', false)
  })

  it('returns 400 when the body has none of the recognized fields', async () => {
    const res = await PATCH(makeRequest({}), makeContext('b1'))

    expect(res.status).toBe(400)
    expect(renameBranch).not.toHaveBeenCalled()
  })

  it('returns 400 when name is present but blank', async () => {
    const res = await PATCH(makeRequest({ name: '  ' }), makeContext('b1'))

    expect(res.status).toBe(400)
    expect(renameBranch).not.toHaveBeenCalled()
  })

  it('returns 409 when the new password collides', async () => {
    vi.mocked(setBranchPassword).mockRejectedValue(new ConflictError('This password is already in use by another branch or the admin login'))

    const res = await PATCH(makeRequest({ password: 'taken-pw' }), makeContext('b1'))

    expect(res.status).toBe(409)
  })

  it('returns 404 when the branch does not exist', async () => {
    vi.mocked(renameBranch).mockRejectedValue(new NotFoundError('Branch not found'))

    const res = await PATCH(makeRequest({ name: 'Ghost' }), makeContext('missing'))

    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await PATCH(makeRequest({ name: 'Main Street' }), makeContext('b1'))

    expect(res.status).toBe(403)
    expect(renameBranch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run "app/api/branches/[id]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`. (Quote the path — the `[id]` brackets can trip up shell globbing.)

- [ ] **Step 7: Write the `PATCH /api/branches/:id` implementation**

Create `app/api/branches/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { renameBranch, setBranchAcceptingOrders, setBranchPassword } from '@/lib/branchService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiRole('admin')

    const { id } = await context.params
    const body = await request.json()

    if (body.name === undefined && body.acceptingOrders === undefined && body.password === undefined) {
      throw new ValidationError('At least one of name, acceptingOrders, or password is required')
    }

    let branch
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        throw new ValidationError('name must be a non-empty string')
      }
      branch = await renameBranch(id, body.name.trim())
    }
    if (body.acceptingOrders !== undefined) {
      if (typeof body.acceptingOrders !== 'boolean') {
        throw new ValidationError('acceptingOrders must be a boolean')
      }
      branch = await setBranchAcceptingOrders(id, body.acceptingOrders)
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.trim() === '') {
        throw new ValidationError('password must be a non-empty string')
      }
      await setBranchPassword(id, body.password)
    }

    return NextResponse.json(branch ?? { id }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

Note: when the body only contains `password` (no `name`/`acceptingOrders`), `branch` stays `undefined` since `setBranchPassword` returns `void` — the response falls back to `{ id }`. This is acceptable since the client-side password-rotation control (Task 3) doesn't need the full branch object back, only a success/failure signal.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run "app/api/branches/[id]/route.test.ts"`
Expected: PASS (9 tests).

- [ ] **Step 9: Commit**

```bash
git add app/api/branches
git commit -m "Add POST /api/branches and PATCH /api/branches/:id routes"
```

---

### Task 3: `/admin/branches` page

**Files:**
- Create: `app/admin/branches/page.tsx`
- Create: `app/admin/branches/page.test.tsx`
- Create: `app/admin/branches/BranchRow.tsx`
- Create: `app/admin/branches/BranchRow.test.tsx`
- Create: `app/admin/branches/CreateBranchForm.tsx`
- Create: `app/admin/branches/CreateBranchForm.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `listBranches` (Task 1), `POST /api/branches` and `PATCH /api/branches/:id` (Task 2), the shared `.slider-toggle` CSS (already exists, from Plan 1's `AcceptingOrdersToggle`).
- Produces: the `/admin/branches` route.

- [ ] **Step 1: Add branch-row CSS**

In `app/globals.css`, insert this new block immediately after the existing `.menu-admin-row__error { ... }` rule (end of the menu-admin-row section):

```css
/* Branch list (admin) */

.branch-list {
  list-style: none;
  width: 100%;
  max-width: 640px;
  margin: 1.5rem auto 0;
  padding: 0 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.branch-row {
  background: var(--paper);
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

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

- [ ] **Step 2: Write the failing tests for `CreateBranchForm`**

Create `app/admin/branches/CreateBranchForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateBranchForm } from './CreateBranchForm'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { post: vi.fn() },
  }
})

describe('CreateBranchForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits name and password and refreshes on success', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    render(<CreateBranchForm />)

    fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'Downtown' } })
    fireEvent.change(screen.getByLabelText('Staff password'), { target: { value: 'downtown-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }))

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/api/branches', { name: 'Downtown', password: 'downtown-pw' }),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('shows a conflict-specific error when the password is already in use', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('CONFLICT', 'This password is already in use by another branch or the admin login'))
    render(<CreateBranchForm />)

    fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'Downtown' } })
    fireEvent.change(screen.getByLabelText('Staff password'), { target: { value: 'taken-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This password is already in use by another branch or the admin login')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run app/admin/branches/CreateBranchForm.test.tsx`
Expected: FAIL — `Cannot find module './CreateBranchForm'`.

- [ ] **Step 4: Write the `CreateBranchForm` implementation**

Create `app/admin/branches/CreateBranchForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function CreateBranchForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/branches', { name, password })
      setName('')
      setPassword('')
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
        <label htmlFor="branch-name" className="admin-panel__label">
          Branch name
        </label>
        <input
          id="branch-name"
          type="text"
          className="admin-panel__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="branch-password" className="admin-panel__label">
          Staff password
        </label>
        <input
          id="branch-password"
          type="password"
          className="admin-panel__input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="admin-panel__submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add branch'}
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/admin/branches/CreateBranchForm.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing tests for `BranchRow`**

Create `app/admin/branches/BranchRow.test.tsx`:

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

  it('reveals a rename form when the name is clicked, and saves it', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('New name for Main'), { target: { value: 'Main Street' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/branches/b1', { name: 'Main Street' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('reveals a password field when "Change password" is clicked, and submits it', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    fireEvent.change(screen.getByLabelText('New password for Main'), { target: { value: 'new-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/branches/b1', { password: 'new-pw' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('shows a conflict-specific error when the new password collides', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('CONFLICT', 'This password is already in use by another branch or the admin login'))
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    fireEvent.change(screen.getByLabelText('New password for Main'), { target: { value: 'taken-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This password is already in use by another branch or the admin login')
  })
})
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run app/admin/branches/BranchRow.test.tsx`
Expected: FAIL — `Cannot find module './BranchRow'`.

- [ ] **Step 8: Write the `BranchRow` implementation**

Create `app/admin/branches/BranchRow.tsx`:

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

  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(name)
  const [renameSubmitting, setRenameSubmitting] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const [changingPassword, setChangingPassword] = useState(false)
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

  async function handleSaveName() {
    setRenameError(null)
    setRenameSubmitting(true)
    try {
      await apiClient.patch(`/api/branches/${id}`, { name: newName })
      setRenaming(false)
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
      setChangingPassword(false)
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
        {renaming ? (
          <>
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
          </>
        ) : (
          <>
            <span className="branch-row__name">{name}</span>
            <button type="button" className="menu-admin-row__edit" onClick={() => setRenaming(true)}>
              Rename
            </button>
          </>
        )}
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
      </div>
      {renameError && (
        <p role="alert" className="admin-panel__error">
          {renameError}
        </p>
      )}
      {toggleError && (
        <p role="alert" className="admin-panel__error">
          {toggleError}
        </p>
      )}
      {changingPassword ? (
        <div className="branch-row__password-form">
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
      ) : (
        <button type="button" className="branch-row__password-toggle" onClick={() => setChangingPassword(true)}>
          Change password
        </button>
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

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run app/admin/branches/BranchRow.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 10: Write the failing test for the page**

Create `app/admin/branches/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminBranchesPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listBranches } from '@/lib/branchService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  listBranches: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('AdminBranchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listBranches).mockResolvedValue([])
  })

  it('is gated behind an admin session', async () => {
    await AdminBranchesPage()

    expect(requireRole).toHaveBeenCalledWith('admin')
  })

  it('shows the Branches heading and create form', async () => {
    const ui = await AdminBranchesPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Branches' })).toBeInTheDocument()
    expect(screen.getByLabelText('Branch name')).toBeInTheDocument()
  })

  it('renders each branch', async () => {
    vi.mocked(listBranches).mockResolvedValue([
      { id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() },
      { id: 'b2', name: 'Downtown', acceptingOrders: false, createdAt: new Date() },
    ] as never)

    const ui = await AdminBranchesPage()
    render(ui)

    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText('Downtown')).toBeInTheDocument()
  })

  it('shows an empty state when there are no branches', async () => {
    const ui = await AdminBranchesPage()
    render(ui)

    expect(screen.getByText('No branches yet — add one above.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npx vitest run app/admin/branches/page.test.tsx`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 12: Write the page implementation**

Create `app/admin/branches/page.tsx`:

```tsx
import { requireRole } from '@/lib/authGuard'
import { listBranches } from '@/lib/branchService'
import { CreateBranchForm } from './CreateBranchForm'
import { BranchRow } from './BranchRow'

export default async function AdminBranchesPage() {
  await requireRole('admin')

  const branches = await listBranches()

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Branches</h1>
      </header>
      <div className="admin-panel">
        <CreateBranchForm />
      </div>
      {branches.length === 0 ? (
        <p className="admin-empty">No branches yet — add one above.</p>
      ) : (
        <ul className="branch-list">
          {branches.map((branch) => (
            <BranchRow key={branch.id} id={branch.id} name={branch.name} acceptingOrders={branch.acceptingOrders} />
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx vitest run app/admin/branches/page.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 14: Commit**

```bash
git add app/admin/branches app/globals.css
git commit -m "Add /admin/branches page (create, rename, toggle, password rotation)"
```

---

### Task 4: "Branches" nav link in `StaffBar`

**Files:**
- Modify: `app/components/StaffBar.tsx`
- Modify: `app/components/StaffBar.test.tsx`

**Interfaces:**
- Consumes: nothing new — `/admin/branches` (Task 3).
- Produces: a "Branches" link in the global toolbar, admin-only.

- [ ] **Step 1: Write the failing tests**

In `app/components/StaffBar.test.tsx`, add these two tests inside the existing `describe('StaffBar')` block, right after the existing `'hides the Settings link when already on that page'` test:

```tsx
it('shows a Branches link for an admin session', () => {
  render(<StaffBar role="admin" />)

  expect(screen.getByRole('link', { name: 'Branches' })).toHaveAttribute('href', '/admin/branches')
})

it('hides the Branches link when already on that page', () => {
  mockPathname = '/admin/branches'
  render(<StaffBar role="admin" />)

  expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument()
})
```

Also extend the existing `'does not show admin-only nav links for a staff session'` test to cover Branches too:

```tsx
it('does not show admin-only nav links for a staff session', () => {
  render(<StaffBar role="staff" />)

  expect(screen.queryByRole('link', { name: 'Table Setup' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Payment Methods' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run app/components/StaffBar.test.tsx`
Expected: FAIL — no "Branches" link exists yet.

- [ ] **Step 3: Add the Branches link**

In `app/components/StaffBar.tsx`, add a new visibility flag alongside the existing ones (after `showSettingsLink`):

```tsx
const showSettingsLink = role === 'admin' && pathname !== '/admin/settings'
const showBranchesLink = role === 'admin' && pathname !== '/admin/branches'
```

Add the link block right after the `showSettingsLink` block's closing `)}`, before the `Log out` button:

```tsx
{showBranchesLink && (
  <>
    <Link href="/admin/branches" className="staff-bar__action">
      Branches
    </Link>
    <span className="staff-bar__sep" aria-hidden="true">
      ·
    </span>
  </>
)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/components/StaffBar.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add app/components/StaffBar.tsx app/components/StaffBar.test.tsx
git commit -m "Add Branches nav link to StaffBar"
```

---

### Task 5: Table Setup branch selector

**Files:**
- Create: `app/components/BranchSelector.tsx`
- Create: `app/components/BranchSelector.test.tsx`
- Modify: `app/admin/tables/page.tsx`
- Modify: `app/admin/tables/page.test.tsx`
- Modify: `app/admin/tables/CreateOrderingPointForm.tsx`
- Modify: `app/admin/tables/CreateOrderingPointForm.test.tsx`
- Modify: `app/api/ordering-points/route.ts`
- Modify: `app/api/ordering-points/route.test.ts`

**Interfaces:**
- Consumes: `listBranches` (Task 1), `resolveBranchId`'s new second parameter (Task 1).
- Produces: `BranchSelector({ branches, selectedBranchId }: { branches: { id: string; name: string }[]; selectedBranchId: string })` — a shared client component, also used by Task 6.

- [ ] **Step 1: Write the failing tests for `BranchSelector`**

Create `app/components/BranchSelector.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BranchSelector } from './BranchSelector'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/tables',
}))

describe('BranchSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an option per branch with the selected one chosen', () => {
    render(
      <BranchSelector
        branches={[
          { id: 'b1', name: 'Main' },
          { id: 'b2', name: 'Downtown' },
        ]}
        selectedBranchId="b2"
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveValue('b2')
    expect(screen.getByRole('option', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Downtown' })).toBeInTheDocument()
  })

  it('navigates to the current pathname with the new branch id on change', () => {
    render(
      <BranchSelector
        branches={[
          { id: 'b1', name: 'Main' },
          { id: 'b2', name: 'Downtown' },
        ]}
        selectedBranchId="b1"
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), { target: { value: 'b2' } })

    expect(push).toHaveBeenCalledWith('/admin/tables?branch=b2')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/components/BranchSelector.test.tsx`
Expected: FAIL — `Cannot find module './BranchSelector'`.

- [ ] **Step 3: Write the `BranchSelector` implementation**

Create `app/components/BranchSelector.tsx`:

```tsx
'use client'

import { useRouter, usePathname } from 'next/navigation'

type BranchSelectorProps = {
  branches: { id: string; name: string }[]
  selectedBranchId: string
}

export function BranchSelector({ branches, selectedBranchId }: BranchSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`${pathname}?branch=${e.target.value}`)
  }

  return (
    <label className="branch-selector">
      <span className="admin-panel__label">Branch</span>
      <select
        className="admin-panel__input branch-selector__select"
        value={selectedBranchId}
        onChange={handleChange}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 4: Add minimal CSS for the selector's layout**

In `app/globals.css`, insert this block right after the `.branch-row__password-form { ... }` rule added in Task 3:

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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run app/components/BranchSelector.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Update `app/admin/tables/page.tsx` to resolve the branch from the URL and render the selector**

Replace the whole file:

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
  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const origin = `${protocol}://${host}`

  const pointsWithQr = await Promise.all(
    orderingPoints.map(async (point) => {
      const orderUrl = `${origin}/order?table=${point.id}`
      const qrDataUrl = await generateQrDataUrl(orderUrl)
      return { ...point, orderUrl, qrDataUrl }
    }),
  )

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Table Setup</h1>
      </header>
      <BranchSelector branches={branches.map((b) => ({ id: b.id, name: b.name }))} selectedBranchId={branchId} />
      <div className="admin-panel">
        <CreateOrderingPointForm branchId={branchId} />
      </div>
      {pointsWithQr.length === 0 ? (
        <p className="admin-empty">No tables yet — add one above.</p>
      ) : (
        <ul className="table-grid">
          {pointsWithQr.map((point) => (
            <li key={point.id} className="table-qr-card">
              <p className="table-qr-card__title">{point.label}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
              <img
                src={point.qrDataUrl}
                alt={`QR code for ${point.label}`}
                width={160}
                height={160}
                className="table-qr-card__image"
              />
              <p className="table-qr-card__url">{point.orderUrl}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Update `app/admin/tables/page.test.tsx`**

Replace the whole file:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminTablesPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { resolveBranchId, listBranches } from '@/lib/branchService'
import { generateQrDataUrl } from '@/lib/qrCode'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/orderingPointService', () => ({
  listOrderingPoints: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
  listBranches: vi.fn(),
}))

vi.mock('@/lib/qrCode', () => ({
  generateQrDataUrl: vi.fn(),
}))

vi.mock('./CreateOrderingPointForm', () => ({
  CreateOrderingPointForm: () => <div>Create Table Form</div>,
}))

vi.mock('@/app/components/BranchSelector', () => ({
  BranchSelector: ({ branches }: { branches: { id: string; name: string }[] }) => (
    <div>Branch Selector ({branches.length})</div>
  ),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([['host', 'localhost:3000']])),
}))

describe('AdminTablesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
    vi.mocked(listBranches).mockResolvedValue([{ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }] as never)
    vi.mocked(listOrderingPoints).mockResolvedValue([])
    vi.mocked(generateQrDataUrl).mockResolvedValue('data:image/png;base64,x')
  })

  function callPage(branch?: string) {
    return AdminTablesPage({ searchParams: Promise.resolve(branch ? { branch } : {}) })
  }

  it('is gated behind an admin session', async () => {
    await callPage()

    expect(requireRole).toHaveBeenCalledWith('admin')
  })

  it('resolves the branch from the ?branch= query param', async () => {
    await callPage('b2')

    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')
  })

  it('shows an empty state when there are no ordering points', async () => {
    const ui = await callPage()
    render(ui)

    expect(screen.getByText('No tables yet — add one above.')).toBeInTheDocument()
  })

  it('shows the Table Setup heading, branch selector, and create form', async () => {
    const ui = await callPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Table Setup' })).toBeInTheDocument()
    expect(screen.getByText('Branch Selector (1)')).toBeInTheDocument()
    expect(screen.getByText('Create Table Form')).toBeInTheDocument()
  })

  it('renders each ordering point with its QR code', async () => {
    vi.mocked(listOrderingPoints).mockResolvedValue([
      { id: 'op1', branchId: 'b1', label: 'Table 3', isCounter: false, createdAt: new Date() },
    ] as never)

    const ui = await callPage()
    render(ui)

    expect(screen.getByText('Table 3')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR code for Table 3' })).toHaveAttribute(
      'src',
      'data:image/png;base64,x',
    )
  })
})
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run app/admin/tables/page.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 9: Update `CreateOrderingPointForm` to take and send a `branchId`**

Replace the whole file `app/admin/tables/CreateOrderingPointForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function CreateOrderingPointForm({ branchId }: { branchId: string }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/ordering-points', { label, branchId })
      setLabel('')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setError('A table with that label already exists')
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
        <label htmlFor="label" className="admin-panel__label">
          Table label
        </label>
        <input
          id="label"
          type="text"
          className="admin-panel__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
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

- [ ] **Step 10: Update `CreateOrderingPointForm.test.tsx`**

In `app/admin/tables/CreateOrderingPointForm.test.tsx`, add the `branchId="b1"` prop to both `render(<CreateOrderingPointForm />)` calls (making them `render(<CreateOrderingPointForm branchId="b1" />)`), and update the assertion in the first test:

```tsx
await waitFor(() =>
  expect(apiClient.post).toHaveBeenCalledWith('/api/ordering-points', { label: 'Patio 1', branchId: 'b1' }),
)
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run app/admin/tables/CreateOrderingPointForm.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 12: Update `POST /api/ordering-points` to read `body.branchId`**

In `app/api/ordering-points/route.ts`, change:

```ts
    const branchId = await resolveBranchId(session)
    const orderingPoint = await createOrderingPoint(branchId, body.label.trim())
```

to:

```ts
    const branchId = await resolveBranchId(session, body.branchId)
    const orderingPoint = await createOrderingPoint(branchId, body.label.trim())
```

- [ ] **Step 13: Update `app/api/ordering-points/route.test.ts`**

Add this test to the existing `describe('POST /api/ordering-points')` block, after the existing `'creates an ordering point...'` test:

```ts
it('passes body.branchId through to resolveBranchId', async () => {
  vi.mocked(createOrderingPoint).mockResolvedValue({ id: 'op1', branchId: 'b2', label: 'Patio 1', isCounter: false, createdAt: new Date() } as never)

  await POST(makeRequest({ label: 'Patio 1', branchId: 'b2' }))

  expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')
})
```

- [ ] **Step 14: Run the tests to verify they pass**

Run: `npx vitest run app/api/ordering-points/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 15: Commit**

```bash
git add app/components/BranchSelector.tsx app/components/BranchSelector.test.tsx app/admin/tables app/api/ordering-points app/globals.css
git commit -m "Add admin branch selector to Table Setup"
```

---

### Task 6: Menu Management branch selector

**Files:**
- Modify: `app/admin/menu-items/page.tsx`
- Modify: `app/admin/menu-items/page.test.tsx`
- Modify: `app/admin/menu-items/MenuItemRow.tsx`
- Modify: `app/admin/menu-items/MenuItemRow.test.tsx`
- Modify: `app/api/menu-items/[id]/availability/route.ts`
- Modify: `app/api/menu-items/[id]/availability/route.test.ts`

**Interfaces:**
- Consumes: `listBranches`, `resolveBranchId`'s new second parameter (Task 1), `BranchSelector` (Task 5).
- Produces: nothing new for later tasks — this is the last UI task.

- [ ] **Step 1: Update `app/admin/menu-items/page.tsx` to resolve the branch from the URL and render the selector (admin only)**

Replace the whole file:

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
              branchId={branchId}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
```

Note: `isAdmin ? requestedBranchId : undefined` means a staff session never even attempts to honor a `?branch=` param, even a manually-typed one — belt-and-suspenders on top of `resolveBranchId` already ignoring it for staff sessions, keeping the page's own logic legible without relying solely on the service layer's guarantee.

- [ ] **Step 2: Update `app/admin/menu-items/page.test.tsx`**

Replace the whole file:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminMenuItemsPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { resolveBranchId, listBranches } from '@/lib/branchService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/menuService', () => ({
  listMenuItemsWithAvailability: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
  listBranches: vi.fn(),
}))

vi.mock('./CreateMenuItemForm', () => ({
  CreateMenuItemForm: () => <div>Create Menu Item Form</div>,
}))

vi.mock('@/app/components/BranchSelector', () => ({
  BranchSelector: ({ branches }: { branches: { id: string; name: string }[] }) => (
    <div>Branch Selector ({branches.length})</div>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('AdminMenuItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([])
    vi.mocked(listBranches).mockResolvedValue([{ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }] as never)
  })

  function callPage(role: 'staff' | 'admin', branch?: string) {
    vi.mocked(requireRole).mockResolvedValue({ role })
    return AdminMenuItemsPage({ searchParams: Promise.resolve(branch ? { branch } : {}) })
  }

  it('is gated behind at least a staff session', async () => {
    await callPage('staff')

    expect(requireRole).toHaveBeenCalledWith('staff')
  })

  it('shows an empty state when there are no menu items', async () => {
    const ui = await callPage('staff')
    render(ui)

    expect(screen.getByText('No menu items yet — add one above.')).toBeInTheDocument()
  })

  it('shows the Menu Management heading for a staff session, without the create form or branch selector', async () => {
    const ui = await callPage('staff')
    render(ui)

    expect(screen.getByRole('heading', { name: 'Menu Management' })).toBeInTheDocument()
    expect(screen.queryByText('Create Menu Item Form')).not.toBeInTheDocument()
    expect(screen.queryByText(/Branch Selector/)).not.toBeInTheDocument()
  })

  it('shows the create form and branch selector for an admin session', async () => {
    const ui = await callPage('admin')
    render(ui)

    expect(screen.getByText('Create Menu Item Form')).toBeInTheDocument()
    expect(screen.getByText('Branch Selector (1)')).toBeInTheDocument()
  })

  it('resolves the branch from ?branch= for admin, ignoring it for staff', async () => {
    await callPage('admin', 'b2')
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')

    vi.mocked(resolveBranchId).mockClear()
    await callPage('staff', 'b2')
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'staff' }, undefined)
  })

  it('renders each menu item with the resolved branchId', async () => {
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, available: true, archived: false, createdAt: new Date() },
    ] as never)

    const ui = await callPage('staff')
    render(ui)

    expect(screen.getByText('Burger')).toBeInTheDocument()
  })

  it('shows an interactive availability toggle for a staff (non-admin) session', async () => {
    vi.mocked(listMenuItemsWithAvailability).mockResolvedValue([
      { id: 'm1', name: 'Burger', price: { toString: () => '12.50' }, available: true, archived: false, createdAt: new Date() },
    ] as never)

    const ui = await callPage('staff')
    render(ui)

    expect(screen.getByRole('switch')).not.toBeDisabled()
  })
})
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run app/admin/menu-items/page.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 4: Update `MenuItemRow` to take and send a `branchId`**

In `app/admin/menu-items/MenuItemRow.tsx`, change the props type:

```tsx
type MenuItemRowProps = {
  id: string
  name: string
  price: string
  available: boolean
  editable: boolean
  branchId: string
}

export function MenuItemRow({ id, name, price, available, editable, branchId }: MenuItemRowProps) {
```

Change `handleAvailabilityChange`'s PATCH call:

```tsx
  async function handleAvailabilityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setCheckedAvailable(next)
    setAvailabilityError(null)
    setAvailabilitySubmitting(true)
    try {
      await apiClient.patch(`/api/menu-items/${id}/availability`, { available: next, branchId })
      router.refresh()
    } catch (err) {
      setCheckedAvailable(!next)
      setAvailabilityError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setAvailabilitySubmitting(false)
    }
  }
```

- [ ] **Step 5: Update `MenuItemRow.test.tsx`**

In `app/admin/menu-items/MenuItemRow.test.tsx`, add `branchId="b1"` to every `render(<MenuItemRow ... />)` call in the file (there are 12 — every one needs it, since `branchId` is now a required prop and a missing required prop would still render in tests but the assertions below need the right value). Then update the two tests that assert on the availability PATCH call:

Change:

```tsx
    it('toggling availability calls the availability endpoint and does not open edit mode', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({})
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={false} branchId="b1" />)

      fireEvent.click(screen.getByRole('switch'))

      expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/m1/availability', { available: false, branchId: 'b1' })
      await waitFor(() => expect(refresh).toHaveBeenCalled())
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run app/admin/menu-items/MenuItemRow.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Update `PATCH /api/menu-items/[id]/availability` to read `body.branchId`**

In `app/api/menu-items/[id]/availability/route.ts`, change:

```ts
    const branchId = await resolveBranchId(session)
    await setMenuItemSoldOut(id, branchId, !body.available)
```

to:

```ts
    const branchId = await resolveBranchId(session, body.branchId)
    await setMenuItemSoldOut(id, branchId, !body.available)
```

- [ ] **Step 8: Update `app/api/menu-items/[id]/availability/route.test.ts`**

Replace the existing `'allows an admin session too, resolving branch via resolveBranchId'` test:

```ts
it('allows an admin session too, resolving branch via resolveBranchId with body.branchId', async () => {
  vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })

  const res = await PATCH(makePatchRequest({ available: true, branchId: 'b2' }), makeContext('m1'))

  expect(res.status).toBe(200)
  expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')
})
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run "app/api/menu-items/[id]/availability/route.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 10: Commit**

```bash
git add app/admin/menu-items app/api/menu-items
git commit -m "Add admin branch selector to Menu Management"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

**Interfaces:** none — confirms Plan 2 is complete and integrates correctly.

- [ ] **Step 1: Run the full automated suite**

Run: `npx vitest run`
Expected: PASS — every test file in the repo, including all new/changed files from Tasks 1-6.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint .`
Expected: no NEW errors. (This repo has 3 pre-existing `react-hooks` errors unrelated to this feature, logged as `ISSUE-20` — confirm the count/identity of any errors matches exactly that pre-existing set, not more.)

- [ ] **Step 3: Manual smoke test via Docker Compose**

Per this repo's `.claude/skills/verify/SKILL.md`, prefer Docker Compose over `npm run dev`.

Run: `docker compose up --build -d && docker compose logs app --tail 40` — confirm "✓ Ready" with no errors.

Then, against `http://localhost:3001`:

1. Log in as admin. Confirm a **Branches** link appears in the StaffBar; visit `/admin/branches`. Confirm "Main" is listed, `acceptingOrders` shows checked.
2. Create a new branch ("Downtown", a distinct password). Confirm it appears in the list, with its own Counter ordering point auto-created (verify via `/admin/tables?branch=<Downtown's id>` — should show one "Counter" entry and nothing else).
3. Try creating another branch with the SAME password as Downtown's. Confirm it's rejected with a 409/conflict message, not silently accepted.
4. On `/admin/tables`, confirm the branch selector defaults to Main and lists both Main and Downtown. Switch to Downtown, add a table ("Patio 1"), confirm it's created under Downtown (not Main) and Main's table list is unaffected when you switch back.
5. On `/admin/menu-items`, confirm the same selector behavior for admin, and confirm a STAFF login (Main's password) sees no selector at all and only ever operates on Main — toggle a menu item's sold-out state as Main's staff, confirm it does NOT affect Downtown's sold-out state for the same item (check via the admin selector switched to Downtown).
6. Rename Downtown to "Downtown Store" via its `BranchRow`; confirm the rename persists and the branch selector's option label updates on refresh.
7. Rotate Downtown's password via its `BranchRow`; log out, log back in with the NEW Downtown password, confirm it lands on the dashboard as staff scoped to Downtown (not Main).
8. Toggle Downtown's `acceptingOrders` off; visit Downtown's Counter ordering point's `/order?table=<id>` URL; confirm it shows the closed-venue message (the branch-closed half of the existing dual gate from Plan 1) while Main's own order URLs still work normally.

- [ ] **Step 4: Teardown**

Run: `docker compose stop` (not `down -v` — preserves the `dbdata` volume's seed/table state per this repo's convention).

- [ ] **Step 5: Confirm `BUILD_STATUS.md` is ready for an update**

No file changes in this step — once this branch is merged, update `BUILD_STATUS.md`'s Story 20 row to note Plan 2 is also complete (still `Building` until Plan 3 lands too, per this project's `CLAUDE.md` operating loop), as a follow-up action outside this plan.
