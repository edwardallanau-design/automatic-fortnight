# Story 2 — Table Setup & QR Identification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create tables with unique numbers, view/print a QR code per table that links to `/order?table=<id>`, and have that link resolve to a minimal placeholder (or a clear error for invalid ids) on the customer side.

**Architecture:** Follows the existing three-layer pattern from Story 1 (API route boundary → service logic → Prisma persistence, service calling Prisma directly as `authService` already does). One new Prisma model (`Table`), one new service module (`tableService`), one new small utility (`qrCode`), one new protected API route (`POST /api/tables`), one new admin page (`/admin/tables`), and a stub customer page (`/order`).

**Tech Stack:** Next.js 16 (App Router, async `searchParams`), React 19, Prisma 7 + `@prisma/adapter-pg`, Postgres (Neon/local), Vitest 4, the `qrcode` npm package (new dependency) for QR image generation.

## Global Constraints

- Additive Prisma migration only — do not alter the existing `Credential` model/migration.
- No inline authority checks in service or persistence code — all role gating goes through `lib/authGuard.ts`'s guard functions only (per `06b-engineering-decisions.md` §8).
- All API route failures route through the existing shared `lib/handleApiError.ts` — no new error-handling pattern.
- Error taxonomy: reuse `lib/errors.ts` (`ValidationError`→400, `NotFoundError`→404, `ConflictError`→409, `ForbiddenError`→403) — no new error classes needed for this story.
- API conventions (`05-api-conventions.md`): `POST` → `201` + created resource; collections → `200` + array, never `404`.
- No `qrCode` DB column — QR images are generated on demand from the table's `id`, never persisted (per the approved spec).
- The customer-facing `/order` route stays unauthenticated by design — no `requireRole`/`requireApiRole` call in it.
- Follow existing test conventions exactly: Vitest, `vi.mock` at the top of test files, mock `./prisma` or sibling modules the same way `authService.test.ts` / `authGuard.test.ts` / `login/route.test.ts` already do. No new test infrastructure (no jsdom/RTL) — page components (`admin/tables/page.tsx`, `order/page.tsx`) are verified manually via the dev server, not with automated rendering tests, matching Story 1 (which also has no tests for `login/page.tsx` or `dashboard/page.tsx`).

---

### Task 1: `requireApiRole` guard for API routes

Story 1's `requireRole` calls `next/navigation`'s `redirect()`, which only works from Server Components/Actions — calling it inside a Route Handler does not produce a redirect response. Story 2 is the first story to protect an API route, so `authGuard.ts` needs a second guard function that throws a `DomainError` instead, letting `handleApiError` turn it into a proper JSON response.

**Files:**
- Modify: `lib/authGuard.ts`
- Test: `lib/authGuard.test.ts` (modify — add new `describe` block)

**Interfaces:**
- Produces: `requireApiRole(minRole: Role): Promise<{ role: Role }>` — throws `ForbiddenError` (imported from `./errors`) if the session is missing, invalid, or of insufficient rank; otherwise resolves the session, exactly like `requireRole` but without any redirect.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `lib/authGuard.test.ts` (imports for `ForbiddenError` and `requireApiRole` go at the top alongside the existing imports):

```ts
import { ForbiddenError } from './errors'
import { requireRole, requireApiRole } from './authGuard'
```

(Replace the existing `import { requireRole } from './authGuard'` line with the combined import above.)

```ts
describe('requireApiRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = 'test-secret'
  })

  it('returns the session role when a valid staff cookie exists and staff is required', async () => {
    const token = signSession('staff')
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: token })

    const result = await requireApiRole('staff')
    expect(result).toEqual({ role: 'staff' })
  })

  it('allows admin to satisfy a staff-level requirement', async () => {
    const token = signSession('admin')
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: token })

    const result = await requireApiRole('staff')
    expect(result).toEqual({ role: 'admin' })
  })

  it('throws ForbiddenError when no cookie is present', async () => {
    mockCookieGet.mockReturnValue(undefined)

    await expect(requireApiRole('admin')).rejects.toThrow(ForbiddenError)
  })

  it('throws ForbiddenError when the cookie is invalid', async () => {
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: 'garbage' })

    await expect(requireApiRole('admin')).rejects.toThrow(ForbiddenError)
  })

  it('throws ForbiddenError when staff tries to satisfy an admin-level requirement', async () => {
    const token = signSession('staff')
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: token })

    await expect(requireApiRole('admin')).rejects.toThrow(ForbiddenError)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/authGuard.test.ts`
Expected: FAIL — `requireApiRole` is not exported / not defined.

- [ ] **Step 3: Implement `requireApiRole`**

In `lib/authGuard.ts`, add the import and new function (leave the existing `requireRole` untouched):

```ts
import { ForbiddenError } from './errors'
```

```ts
export async function requireApiRole(minRole: Role): Promise<{ role: Role }> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  const session = cookie ? verifySession(cookie.value) : null

  if (!session || ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError('Insufficient role for this action')
  }

  return session
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/authGuard.test.ts`
Expected: PASS (all `requireRole` and `requireApiRole` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/authGuard.ts lib/authGuard.test.ts
git commit -m "Add requireApiRole guard for protecting API routes"
```

---

### Task 2: `Table` Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_table/migration.sql` (generated, not hand-written)

**Interfaces:**
- Produces: Prisma model `Table { id: String (uuid pk), number: Int (unique), createdAt: DateTime }`, giving later tasks `prisma.table.create`, `prisma.table.findUnique`, `prisma.table.findMany`.

- [ ] **Step 1: Add the model to the schema**

Append to `prisma/schema.prisma`:

```prisma
model Table {
  id        String   @id @default(uuid())
  number    Int      @unique
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_table`
Expected: Creates `prisma/migrations/<timestamp>_add_table/migration.sql` containing a `CREATE TABLE "Table" (...)` statement with a unique index on `number`, applies it to the local dev database, and regenerates the Prisma client. If this errors because the dev database isn't reachable, start it first (see the gotchas log in `BUILD_STATUS.md` re: local Postgres on port 5432) before re-running.

- [ ] **Step 3: Verify the client picked up the new model**

Run: `npx tsc --noEmit`
Expected: No type errors (confirms `@prisma/client`'s generated types now include `Table`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add Table model migration"
```

---

### Task 3: `tableService` — create, get-or-throw, list

**Files:**
- Create: `lib/tableService.ts`
- Test: `lib/tableService.test.ts`

**Interfaces:**
- Consumes: `prisma.table.create`, `prisma.table.findUnique`, `prisma.table.findMany` (from `./prisma`); `ConflictError`, `NotFoundError` (from `./errors`).
- Produces:
  - `createTable(number: number): Promise<Table>` — `Table` here is the Prisma-generated type `{ id: string; number: number; createdAt: Date }`.
  - `getTableOrThrow(id: string): Promise<Table>`
  - `listTables(): Promise<Table[]>` — ordered by `number` ascending.

- [ ] **Step 1: Write the failing tests**

Create `lib/tableService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { createTable, getTableOrThrow, listTables } from './tableService'
import { ConflictError, NotFoundError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    table: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

describe('tableService.createTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the created table', async () => {
    const created = { id: 't1', number: 12, createdAt: new Date() }
    vi.mocked(prisma.table.create).mockResolvedValue(created as never)

    const result = await createTable(12)
    expect(result).toEqual(created)
    expect(prisma.table.create).toHaveBeenCalledWith({ data: { number: 12 } })
  })

  it('throws ConflictError when the number already exists', async () => {
    vi.mocked(prisma.table.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }) as never,
    )

    await expect(createTable(12)).rejects.toThrow(ConflictError)
  })

  it('rethrows unrelated errors', async () => {
    vi.mocked(prisma.table.create).mockRejectedValue(new Error('connection lost'))

    await expect(createTable(12)).rejects.toThrow('connection lost')
  })
})

describe('tableService.getTableOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the table when found', async () => {
    const table = { id: 't1', number: 12, createdAt: new Date() }
    vi.mocked(prisma.table.findUnique).mockResolvedValue(table as never)

    const result = await getTableOrThrow('t1')
    expect(result).toEqual(table)
  })

  it('throws NotFoundError when no table matches', async () => {
    vi.mocked(prisma.table.findUnique).mockResolvedValue(null)

    await expect(getTableOrThrow('missing-id')).rejects.toThrow(NotFoundError)
  })
})

describe('tableService.listTables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all tables ordered by number', async () => {
    const tables = [
      { id: 't1', number: 1, createdAt: new Date() },
      { id: 't2', number: 2, createdAt: new Date() },
    ]
    vi.mocked(prisma.table.findMany).mockResolvedValue(tables as never)

    const result = await listTables()
    expect(result).toEqual(tables)
    expect(prisma.table.findMany).toHaveBeenCalledWith({ orderBy: { number: 'asc' } })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tableService.test.ts`
Expected: FAIL — `./tableService` module not found.

- [ ] **Step 3: Implement `tableService.ts`**

Create `lib/tableService.ts`:

```ts
import { Prisma } from '@prisma/client'
import type { Table } from '@prisma/client'
import { prisma } from './prisma'
import { ConflictError, NotFoundError } from './errors'

export async function createTable(number: number): Promise<Table> {
  try {
    return await prisma.table.create({ data: { number } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`Table number ${number} already exists`)
    }
    throw error
  }
}

export async function getTableOrThrow(id: string): Promise<Table> {
  const table = await prisma.table.findUnique({ where: { id } })
  if (!table) {
    throw new NotFoundError('Table not found')
  }
  return table
}

export async function listTables(): Promise<Table[]> {
  return prisma.table.findMany({ orderBy: { number: 'asc' } })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tableService.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tableService.ts lib/tableService.test.ts
git commit -m "Add tableService: create, get-or-throw, list"
```

---

### Task 4: `qrCode` generation utility

**Files:**
- Create: `lib/qrCode.ts`
- Test: `lib/qrCode.test.ts`
- Modify: `package.json` (new dependencies)

**Interfaces:**
- Produces: `generateQrDataUrl(url: string): Promise<string>` — resolves to a `data:image/png;base64,...` string.

- [ ] **Step 1: Install the QR library**

Run: `npm install qrcode` and `npm install -D @types/qrcode`
Expected: `package.json` `dependencies` gains `qrcode`, `devDependencies` gains `@types/qrcode`.

- [ ] **Step 2: Write the failing test**

Create `lib/qrCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateQrDataUrl } from './qrCode'

describe('generateQrDataUrl', () => {
  it('returns a base64 PNG data URL for the given URL', async () => {
    const dataUrl = await generateQrDataUrl('https://example.com/order?table=abc-123')
    expect(dataUrl).toMatch(/^data:image\/png;base64,/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/qrCode.test.ts`
Expected: FAIL — `./qrCode` module not found.

- [ ] **Step 4: Implement `qrCode.ts`**

Create `lib/qrCode.ts`:

```ts
import QRCode from 'qrcode'

export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/qrCode.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/qrCode.ts lib/qrCode.test.ts
git commit -m "Add QR code data-URL generation utility"
```

---

### Task 5: `POST /api/tables` route

**Files:**
- Create: `app/api/tables/route.ts`
- Test: `app/api/tables/route.test.ts`

**Interfaces:**
- Consumes: `requireApiRole` (from `@/lib/authGuard`, Task 1), `createTable` (from `@/lib/tableService`, Task 3), `handleApiError` (from `@/lib/handleApiError`), `ValidationError` (from `@/lib/errors`).
- Produces: `POST` handler — `201` + `{ id, number, createdAt }` on success; `400` if `number` missing/non-integer; `409` on duplicate; `403` if the caller isn't admin.

- [ ] **Step 1: Write the failing tests**

Create `app/api/tables/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { ConflictError, ForbiddenError } from '@/lib/errors'

vi.mock('@/lib/tableService', () => ({
  createTable: vi.fn(),
}))

vi.mock('@/lib/authGuard', () => ({
  requireApiRole: vi.fn(),
}))

import { createTable } from '@/lib/tableService'
import { requireApiRole } from '@/lib/authGuard'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/tables', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/tables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireApiRole).mockResolvedValue({ role: 'admin' })
  })

  it('returns 201 with the created table on success', async () => {
    const created = { id: 't1', number: 12, createdAt: new Date() }
    vi.mocked(createTable).mockResolvedValue(created as never)

    const res = await POST(makeRequest({ number: 12 }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.number).toBe(12)
    expect(createTable).toHaveBeenCalledWith(12)
  })

  it('returns 409 when the table number already exists', async () => {
    vi.mocked(createTable).mockRejectedValue(new ConflictError('Table number 12 already exists'))

    const res = await POST(makeRequest({ number: 12 }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('CONFLICT')
  })

  it('returns 400 when number is missing', async () => {
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(createTable).not.toHaveBeenCalled()
  })

  it('returns 400 when number is not an integer', async () => {
    const res = await POST(makeRequest({ number: 'twelve' }))

    expect(res.status).toBe(400)
    expect(createTable).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not admin', async () => {
    vi.mocked(requireApiRole).mockRejectedValue(new ForbiddenError('Insufficient role for this action'))

    const res = await POST(makeRequest({ number: 12 }))

    expect(res.status).toBe(403)
    expect(createTable).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/tables/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement the route**

Create `app/api/tables/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createTable } from '@/lib/tableService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (typeof body.number !== 'number' || !Number.isInteger(body.number)) {
      throw new ValidationError('number is required and must be an integer')
    }

    const table = await createTable(body.number)
    return NextResponse.json(table, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/tables/route.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/tables/route.ts app/api/tables/route.test.ts
git commit -m "Add POST /api/tables route"
```

---

### Task 6: Admin table setup page (create form + QR list)

**Files:**
- Create: `app/admin/tables/CreateTableForm.tsx`
- Create: `app/admin/tables/page.tsx`
- Modify: `app/dashboard/page.tsx` (add nav link)

**Interfaces:**
- Consumes: `requireRole` (`@/lib/authGuard`), `listTables` (`@/lib/tableService`, Task 3), `generateQrDataUrl` (`@/lib/qrCode`, Task 4), `apiClient`/`ApiError` (`@/lib/apiClient`), `POST /api/tables` (Task 5).
- No new exports consumed by later tasks — this is a leaf UI task.

- [ ] **Step 1: Create the client-side form component**

Create `app/admin/tables/CreateTableForm.tsx`:

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
    <form onSubmit={handleSubmit}>
      <label htmlFor="number">Table number</label>
      <input
        id="number"
        type="number"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        required
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add table'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 2: Create the server page that lists tables with QR codes**

Create `app/admin/tables/page.tsx`:

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
    <main>
      <h1>Table Setup</h1>
      <CreateTableForm />
      <ul>
        {tablesWithQr.map((table) => (
          <li key={table.id}>
            <p>Table {table.number}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
            <img src={table.qrDataUrl} alt={`QR code for table ${table.number}`} width={200} height={200} />
            <p>{table.orderUrl}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: Link the page from the dashboard's admin nav**

In `app/dashboard/page.tsx`, update the admin nav block to add a Tables link alongside Menu Management:

```tsx
      {role === 'admin' && (
        <nav>
          <Link href="/admin/menu">Menu Management</Link>
          <Link href="/admin/tables">Table Setup</Link>
        </nav>
      )}
```

- [ ] **Step 4: Manually verify in the dev server**

Run: `npm run dev`, log in as admin at `/login` (per Story 1's seeded `admin-temp-pw`), navigate to `/admin/tables`.
Expected: page loads with an empty list and a create form; submitting a table number adds it to the list with a rendered QR image below it and the plain `/order?table=<id>` URL text; submitting the same number again shows the inline "already exists" error and does not add a duplicate row.

- [ ] **Step 5: Commit**

```bash
git add app/admin/tables app/dashboard/page.tsx
git commit -m "Add admin table setup page with QR code display"
```

---

### Task 7: Customer `/order` stub page

**Files:**
- Create: `app/order/page.tsx`

**Interfaces:**
- Consumes: `getTableOrThrow` (`@/lib/tableService`, Task 3), `NotFoundError` (`@/lib/errors`).
- No exports consumed elsewhere — Story 4 will replace this file's rendering body, reusing the same id-resolution shell.

- [ ] **Step 1: Implement the page**

Create `app/order/page.tsx`:

```tsx
import { getTableOrThrow } from '@/lib/tableService'
import { NotFoundError } from '@/lib/errors'

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>
}) {
  const { table: tableId } = await searchParams

  if (!tableId) {
    return (
      <main>
        <p role="alert">This table link isn&apos;t valid. Please ask staff for help.</p>
      </main>
    )
  }

  try {
    const table = await getTableOrThrow(tableId)
    return (
      <main>
        <h1>Table {table.number}</h1>
        <p>Menu coming soon.</p>
      </main>
    )
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main>
          <p role="alert">This table link isn&apos;t valid. Please ask staff for help.</p>
        </main>
      )
    }
    throw error
  }
}
```

- [ ] **Step 2: Manually verify in the dev server**

Run: `npm run dev`. With a table created in Task 6 (note its id from the printed `/order?table=<id>` URL), visit that URL directly.
Expected: renders "Table {number} — Menu coming soon." Then visit `/order?table=not-a-real-id` and `/order` (no param).
Expected: both render "This table link isn't valid. Please ask staff for help." with no crash/500 page.

- [ ] **Step 3: Commit**

```bash
git add app/order/page.tsx
git commit -m "Add customer /order stub page with table id resolution"
```

---

### Task 8: Update `BUILD_STATUS.md`

**Files:**
- Modify: `BUILD_STATUS.md`

- [ ] **Step 1: Mark Story 2 Done**

Change the Story 2 row in the table:

```markdown
| 2 | Table setup & QR identification | Done | |
```

- [ ] **Step 2: Add any gotchas found during this story**

If any non-obvious issue came up during implementation (e.g. anything about `next/navigation` `redirect()` not working in Route Handlers, discovered in Task 1), append a bullet to the "Gotchas log" section, following the existing bullet format (bold one-line summary, then detail, then which file it was hit in). If nothing new and non-obvious came up beyond what's already documented, skip this step.

- [ ] **Step 3: Commit**

```bash
git add BUILD_STATUS.md
git commit -m "Mark Story 2 (Table setup & QR identification) as Done"
```

---

## Self-Review Notes

- **Spec coverage:** Table creation + uniqueness/409 (Task 3, 5) · QR rendering linking to `/order?table=<id>` (Task 4, 6) · invalid table id error, no crash (Task 7) · admin-only gating (Task 1, 5, 6) · no persisted `qrCode` column (Task 2 schema has none) · scope boundary respected (no MenuItem/Order files touched in any task).
- **Placeholder scan:** none found — every step has runnable code and exact commands.
- **Type consistency:** `Table` type flows from Prisma's generated type (Task 2) through `tableService`'s signatures (Task 3) into the route (Task 5) and pages (Tasks 6, 7) without re-declaration; `generateQrDataUrl(url: string): Promise<string>` matches its one call site in Task 6; `requireApiRole(minRole: Role): Promise<{ role: Role }>` matches its one call site in Task 5.
