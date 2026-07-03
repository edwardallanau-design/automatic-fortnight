# Story 1 — Staff/Admin Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the Next.js app scaffold and implement shared-credential staff/admin login: a login page that authenticates against a DB-seeded `Credential` row, sets a role-bearing JWT cookie, and a minimal role-gated `/dashboard` stub that proves the redirect and admin-only-controls behavior.

**Architecture:** Next.js (App Router) single app on Vercel, Prisma + Postgres (Neon) persistence, layered as boundary (API route handlers) → logic (`authService`) → persistence (Prisma). Session is a custom signed JWT stored in an httpOnly cookie, verified by one `requireRole()` guard used by every protected route/page. No next-auth, no per-employee accounts (ADR-003).

**Tech Stack:** Next.js 14+ (App Router, TypeScript), Prisma, Postgres (Neon in prod; local Postgres or Neon dev branch for this build), `bcrypt` (password hashing), `jsonwebtoken` (JWT sign/verify), Vitest (unit + integration tests).

## Global Constraints

- Layered ownership: boundary (API routes) does transport only, logic (`authService`) owns business rules, persistence (Prisma) owns queries only — no business branching outside the logic layer. (`06a` P1)
- One `DomainError` base + category subclasses (`ValidationError→400`, `NotFoundError→404`, `ConflictError→409`, `ForbiddenError→403`, plus `InvalidCredentialError→401`); translated to HTTP status by exactly one shared `handleApiError()` wrapper. (`06b` §3)
- Error envelope is flat: `{ "error": "<CODE>", "message": "<human-readable>" }`. No trace ID/timestamp. (`05-api-conventions.md`)
- Session cookie carries a `role` claim (`staff` | `admin`); `requireRole()` is the **only** place authority is checked — never inline in service/persistence code. (`06b` §8)
- Session cookie/token values are never logged. (`06b` §4)
- Frontend never calls `fetch` directly — all calls go through one `lib/apiClient.ts` wrapper. (`06b` §6, P6)
- No `any` at type boundaries; shared types live in `lib/types.ts`, never redeclared inline. (`06b` §6, P7)
- Test ownership: business rules → Vitest unit tests on `authService`; contract/boundary behavior (status codes, auth) → Vitest integration tests; no concern tested twice across layers. (`06b` §7, P8)
- Surgical changes only — this story touches auth scaffolding and its own `Credential` model; it does not touch Table/MenuItem/Order schema or the customer-facing flow. (`07-epic-map.md` Story 1 scope boundary)

---

### Task 1: Bootstrap Next.js app + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `.gitignore` (extend if needed), `.env.example`, `.env.local` (gitignored, not committed)
- Create: `app/layout.tsx`, `app/page.tsx` (placeholder root page)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: a runnable Next.js app (`npm run dev`) and a runnable test command (`npm test`) that later tasks build on.

- [ ] **Step 1: Scaffold the Next.js app**

Run:
```bash
cd "d:\Projects\digitalmenu"
npx create-next-app@latest . --typescript --app --no-tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm
```
When prompted about the current directory not being empty, confirm to proceed (existing docs/CLAUDE.md/etc. are unrelated to the scaffold and won't be touched).

- [ ] **Step 2: Verify dev server boots**

Run: `npm run dev -- --port 3100 &` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100` (or open browser). Expected: `200`. Stop the dev server after confirming.

- [ ] **Step 3: Add Vitest**

Run:
```bash
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
  },
})
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `.env.example` documenting required env vars**

```
DATABASE_URL="postgresql://user:password@host:5432/dbname"
AUTH_SECRET="replace-with-a-long-random-string"
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs vitest.config.ts .env.example .gitignore app
git commit -m "Bootstrap Next.js app scaffold with Vitest"
```

---

### Task 2: Prisma setup + `Credential` model

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `prisma.seed` config + `db:seed` script)
- Create: `lib/prisma.ts`

**Interfaces:**
- Produces: `lib/prisma.ts` exports a singleton `prisma: PrismaClient` used by every persistence-layer module in this and future stories.
- Produces: `prisma/schema.prisma` defines `Role` enum (`staff`, `admin`) and `Credential` model (`id`, `role` unique, `passwordHash`) — later stories add their own models to this same file, not a new one.

- [ ] **Step 1: Install Prisma + bcrypt**

```bash
npm install @prisma/client bcrypt
npm install -D prisma @types/bcrypt tsx
```

- [ ] **Step 2: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and appends `DATABASE_URL` to `.env` — replace with `.env.local` usage (Next.js convention): move the `DATABASE_URL` line into `.env.local` and delete the auto-created `.env` if Prisma created one with a placeholder (keep `.env.example` as the documented template from Task 1).

- [ ] **Step 3: Define the `Credential` model**

Replace `prisma/schema.prisma` contents:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  staff
  admin
}

model Credential {
  id           String @id @default(uuid())
  role         Role   @unique
  passwordHash String
}
```

- [ ] **Step 4: Set `DATABASE_URL` in `.env.local`**

Use the user's actual Neon/local Postgres connection string. If none is available yet for local dev, use a local Postgres instance:
```bash
# .env.local
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/digitalmenu?schema=public"
AUTH_SECRET="dev-only-secret-change-before-deploy"
```
(This step requires the user to confirm a real `DATABASE_URL` — flag this as a checkpoint if no DB is reachable yet, and skip to Task 3 stub testing without a live migration until one is provided.)

- [ ] **Step 5: Run the first migration**

```bash
npx prisma migrate dev --name init_credential
```
Expected: creates `prisma/migrations/<timestamp>_init_credential/`, applies to the dev DB, generates the Prisma Client.

- [ ] **Step 6: Create `lib/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 7: Create the seed script**

`prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const SEED_CREDENTIALS = [
  { role: 'staff' as const, password: 'staff-temp-pw' },
  { role: 'admin' as const, password: 'admin-temp-pw' },
]

async function main() {
  for (const { role, password } of SEED_CREDENTIALS) {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.credential.upsert({
      where: { role },
      update: { passwordHash },
      create: { role, passwordHash },
    })
  }
  console.log('Seeded credentials for roles:', SEED_CREDENTIALS.map((c) => c.role).join(', '))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

Add to `package.json`:
```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
},
"scripts": {
  "db:seed": "prisma db seed"
}
```

- [ ] **Step 8: Run the seed**

```bash
npx prisma db seed
```
Expected output: `Seeded credentials for roles: staff, admin`

- [ ] **Step 9: Commit**

```bash
git add prisma package.json package-lock.json lib/prisma.ts .env.example
git commit -m "Add Prisma schema with Credential model and seed script"
```
(`.env.local` stays gitignored — verify with `git status` that it's not staged.)

---

### Task 3: Shared error types + `handleApiError` wrapper

**Files:**
- Create: `lib/errors.ts`
- Create: `lib/handleApiError.ts`
- Test: `lib/handleApiError.test.ts`

**Interfaces:**
- Consumes: nothing (foundational).
- Produces: `DomainError`, `ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `InvalidCredentialError` classes from `lib/errors.ts`. `handleApiError(error: unknown): Response` from `lib/handleApiError.ts` — every future API route calls this in its catch block.

- [ ] **Step 1: Write `lib/errors.ts`**

```typescript
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ValidationError extends DomainError {}
export class NotFoundError extends DomainError {}
export class ConflictError extends DomainError {}
export class ForbiddenError extends DomainError {}
export class InvalidCredentialError extends DomainError {}
```

- [ ] **Step 2: Write the failing test for `handleApiError`**

`lib/handleApiError.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleApiError } from './handleApiError'
import { ValidationError, InvalidCredentialError, NotFoundError, ConflictError, ForbiddenError } from './errors'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleApiError', () => {
  it('maps ValidationError to 400', async () => {
    const res = handleApiError(new ValidationError('bad input'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'VALIDATION_ERROR', message: 'bad input' })
  })

  it('maps InvalidCredentialError to 401', async () => {
    const res = handleApiError(new InvalidCredentialError('no match'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'INVALID_CREDENTIAL', message: 'no match' })
  })

  it('maps NotFoundError to 404', async () => {
    const res = handleApiError(new NotFoundError('missing'))
    expect(res.status).toBe(404)
  })

  it('maps ConflictError to 409', async () => {
    const res = handleApiError(new ConflictError('conflict'))
    expect(res.status).toBe(409)
  })

  it('maps ForbiddenError to 403', async () => {
    const res = handleApiError(new ForbiddenError('forbidden'))
    expect(res.status).toBe(403)
  })

  it('maps unknown errors to 500 without leaking details', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = handleApiError(new Error('raw db error: connection string leaked'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'INTERNAL_ERROR', message: 'Something went wrong' })
    expect(consoleSpy).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/handleApiError.test.ts`
Expected: FAIL — `handleApiError` module not found.

- [ ] **Step 4: Write `lib/handleApiError.ts`**

```typescript
import { NextResponse } from 'next/server'
import {
  DomainError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  InvalidCredentialError,
} from './errors'

function statusFor(error: DomainError): number {
  if (error instanceof ValidationError) return 400
  if (error instanceof InvalidCredentialError) return 401
  if (error instanceof ForbiddenError) return 403
  if (error instanceof NotFoundError) return 404
  if (error instanceof ConflictError) return 409
  return 500
}

function codeFor(error: DomainError): string {
  return error.name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return NextResponse.json(
      { error: codeFor(error), message: error.message },
      { status: statusFor(error) },
    )
  }

  console.error(JSON.stringify({ level: 'error', message: String(error) }))
  return NextResponse.json(
    { error: 'INTERNAL_ERROR', message: 'Something went wrong' },
    { status: 500 },
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/handleApiError.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/errors.ts lib/handleApiError.ts lib/handleApiError.test.ts
git commit -m "Add shared DomainError taxonomy and handleApiError wrapper"
```

---

### Task 4: `authService.login`

**Files:**
- Create: `lib/authService.ts`
- Test: `lib/authService.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/prisma.ts`, `InvalidCredentialError` from `lib/errors.ts`, `bcrypt` from `bcrypt`.
- Produces: `login(password: string): Promise<{ role: 'staff' | 'admin' }>` — used by the login API route in Task 6.

- [ ] **Step 1: Write the failing unit tests**

`lib/authService.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import { login } from './authService'
import { InvalidCredentialError } from './errors'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    credential: {
      findMany: vi.fn(),
    },
  },
}))

describe('authService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns role staff when password matches the staff credential', async () => {
    const staffHash = await bcrypt.hash('staff-temp-pw', 10)
    const adminHash = await bcrypt.hash('admin-temp-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: '1', role: 'staff', passwordHash: staffHash },
      { id: '2', role: 'admin', passwordHash: adminHash },
    ] as never)

    const result = await login('staff-temp-pw')
    expect(result).toEqual({ role: 'staff' })
  })

  it('returns role admin when password matches the admin credential', async () => {
    const staffHash = await bcrypt.hash('staff-temp-pw', 10)
    const adminHash = await bcrypt.hash('admin-temp-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: '1', role: 'staff', passwordHash: staffHash },
      { id: '2', role: 'admin', passwordHash: adminHash },
    ] as never)

    const result = await login('admin-temp-pw')
    expect(result).toEqual({ role: 'admin' })
  })

  it('throws InvalidCredentialError when password matches nothing', async () => {
    const staffHash = await bcrypt.hash('staff-temp-pw', 10)
    vi.mocked(prisma.credential.findMany).mockResolvedValue([
      { id: '1', role: 'staff', passwordHash: staffHash },
    ] as never)

    await expect(login('wrong-password')).rejects.toThrow(InvalidCredentialError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/authService.test.ts`
Expected: FAIL — `authService` module not found.

- [ ] **Step 3: Write `lib/authService.ts`**

```typescript
import bcrypt from 'bcrypt'
import { prisma } from './prisma'
import { InvalidCredentialError } from './errors'
import type { Role } from './types'

export async function login(password: string): Promise<{ role: Role }> {
  const credentials = await prisma.credential.findMany()

  for (const credential of credentials) {
    const matches = await bcrypt.compare(password, credential.passwordHash)
    if (matches) {
      return { role: credential.role as Role }
    }
  }

  throw new InvalidCredentialError('Password does not match any known role')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/authService.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/authService.ts lib/authService.test.ts
git commit -m "Add authService.login with staff/admin credential matching"
```

---

### Task 5: Shared types + `apiClient`

**Files:**
- Create: `lib/types.ts`
- Create: `lib/apiClient.ts`
- Test: `lib/apiClient.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Role` type, `LoginResponse` type from `lib/types.ts`. `apiClient.post<T>(path: string, body: unknown): Promise<T>` from `lib/apiClient.ts`, throwing `ApiError { code: string; message: string }` on failure — used by the login page in Task 7.

- [ ] **Step 1: Write `lib/types.ts`**

```typescript
export type Role = 'staff' | 'admin'

export interface LoginResponse {
  role: Role
}
```

- [ ] **Step 2: Write the failing test for `apiClient`**

`lib/apiClient.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiClient, ApiError } from './apiClient'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('apiClient.post', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ role: 'staff' }),
    }))

    const result = await apiClient.post('/api/auth/login', { password: 'x' })
    expect(result).toEqual({ role: 'staff' })
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'x' }),
      credentials: 'include',
    })
  })

  it('throws ApiError with code/message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'INVALID_CREDENTIAL', message: 'Incorrect password' }),
    }))

    await expect(apiClient.post('/api/auth/login', { password: 'wrong' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIAL', message: 'Incorrect password' })
  })

  it('ApiError is an instance of Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'VALIDATION_ERROR', message: 'bad input' }),
    }))

    try {
      await apiClient.post('/api/auth/login', {})
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/apiClient.test.ts`
Expected: FAIL — `apiClient` module not found.

- [ ] **Step 4: Write `lib/apiClient.ts`**

```typescript
export class ApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.error, data.message)
  }

  return data as T
}

export const apiClient = { post }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/apiClient.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/apiClient.ts lib/apiClient.test.ts
git commit -m "Add shared Role/LoginResponse types and apiClient wrapper"
```

---

### Task 6: `POST /api/auth/login` route + session cookie

**Files:**
- Create: `lib/session.ts`
- Create: `app/api/auth/login/route.ts`
- Test: `lib/session.test.ts`
- Test: `app/api/auth/login/route.test.ts`

**Interfaces:**
- Consumes: `login` from `lib/authService.ts`, `handleApiError` from `lib/handleApiError.ts`, `ValidationError` from `lib/errors.ts`, `Role` from `lib/types.ts`.
- Produces: `signSession(role: Role): string` and `verifySession(token: string): { role: Role } | null` from `lib/session.ts` — consumed by `requireRole()` in Task 8. `SESSION_COOKIE_NAME = 'session'` exported constant, reused by the guard.

- [ ] **Step 1: Install `jsonwebtoken`**

```bash
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

- [ ] **Step 2: Write the failing test for `lib/session.ts`**

`lib/session.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signSession, verifySession } from './session'

describe('session', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret'
  })

  afterEach(() => {
    delete process.env.AUTH_SECRET
  })

  it('signs and verifies a role round-trip', () => {
    const token = signSession('admin')
    const result = verifySession(token)
    expect(result).toEqual({ role: 'admin' })
  })

  it('returns null for an invalid token', () => {
    expect(verifySession('not-a-real-token')).toBeNull()
  })

  it('returns null for a token signed with a different secret', () => {
    const token = signSession('staff')
    process.env.AUTH_SECRET = 'different-secret'
    expect(verifySession(token)).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/session.test.ts`
Expected: FAIL — `session` module not found.

- [ ] **Step 4: Write `lib/session.ts`**

```typescript
import jwt from 'jsonwebtoken'
import type { Role } from './types'

export const SESSION_COOKIE_NAME = 'session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is not set')
  }
  return secret
}

export function signSession(role: Role): string {
  return jwt.sign({ role }, getSecret(), { expiresIn: SESSION_MAX_AGE_SECONDS })
}

export function verifySession(token: string): { role: Role } | null {
  try {
    const decoded = jwt.verify(token, getSecret())
    if (typeof decoded === 'object' && decoded !== null && 'role' in decoded) {
      return { role: (decoded as { role: Role }).role }
    }
    return null
  } catch {
    return null
  }
}

export { SESSION_MAX_AGE_SECONDS }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/session.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing integration test for the login route**

`app/api/auth/login/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { InvalidCredentialError } from '@/lib/errors'

vi.mock('@/lib/authService', () => ({
  login: vi.fn(),
}))

import { login } from '@/lib/authService'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = 'test-secret'
  })

  it('returns 200 with role and sets a session cookie on success', async () => {
    vi.mocked(login).mockResolvedValue({ role: 'staff' })

    const res = await POST(makeRequest({ password: 'staff-temp-pw' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ role: 'staff' })
    expect(res.headers.get('set-cookie')).toContain('session=')
  })

  it('returns 401 with no cookie on invalid credential', async () => {
    vi.mocked(login).mockRejectedValue(new InvalidCredentialError('no match'))

    const res = await POST(makeRequest({ password: 'wrong' }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'INVALID_CREDENTIAL', message: 'no match' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 400 when password is missing', async () => {
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(login).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- app/api/auth/login/route.test.ts`
Expected: FAIL — `route` module not found.

- [ ] **Step 8: Write `app/api/auth/login/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { login } from '@/lib/authService'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'
import { signSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.password || typeof body.password !== 'string') {
      throw new ValidationError('password is required')
    }

    const { role } = await login(body.password)
    const token = signSession(role)

    const response = NextResponse.json({ role }, { status: 200 })
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    })
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- app/api/auth/login/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Commit**

```bash
git add lib/session.ts lib/session.test.ts app/api/auth/login package.json package-lock.json
git commit -m "Add session JWT helpers and POST /api/auth/login route"
```

---

### Task 7: `requireRole()` guard

**Files:**
- Create: `lib/authGuard.ts`
- Test: `lib/authGuard.test.ts`

**Interfaces:**
- Consumes: `verifySession`, `SESSION_COOKIE_NAME` from `lib/session.ts`, `Role` from `lib/types.ts`.
- Produces: `requireRole(minRole: Role): Promise<{ role: Role }>` — reads cookies via `next/headers`, throws `UnauthenticatedRedirect` sentinel (calls `redirect('/login')` for page use) when no valid session exists. Used by `app/dashboard/page.tsx` in Task 8.

Note: `next/headers` cookie reading and `redirect()` only work inside a request/render context, so the guard is exercised via a unit test that mocks `next/headers`, not a full page render.

- [ ] **Step 1: Write the failing unit test**

`lib/authGuard.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCookieGet = vi.fn()
const mockRedirect = vi.fn(() => {
  throw new Error('NEXT_REDIRECT')
})

vi.mock('next/headers', () => ({
  cookies: () => ({ get: mockCookieGet }),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { requireRole } from './authGuard'
import { signSession, SESSION_COOKIE_NAME } from './session'

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = 'test-secret'
  })

  it('returns the session role when a valid staff cookie exists and staff is required', async () => {
    const token = signSession('staff')
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: token })

    const result = await requireRole('staff')
    expect(result).toEqual({ role: 'staff' })
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('allows admin to satisfy a staff-level requirement', async () => {
    const token = signSession('admin')
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: token })

    const result = await requireRole('staff')
    expect(result).toEqual({ role: 'admin' })
  })

  it('redirects to /login when no cookie is present', async () => {
    mockCookieGet.mockReturnValue(undefined)

    await expect(requireRole('staff')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login when the cookie is invalid', async () => {
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: 'garbage' })

    await expect(requireRole('staff')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/authGuard.test.ts`
Expected: FAIL — `authGuard` module not found.

- [ ] **Step 3: Write `lib/authGuard.ts`**

```typescript
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession, SESSION_COOKIE_NAME } from './session'
import type { Role } from './types'

const ROLE_RANK: Record<Role, number> = {
  staff: 1,
  admin: 2,
}

export async function requireRole(minRole: Role): Promise<{ role: Role }> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  const session = cookie ? verifySession(cookie.value) : null

  if (!session || ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
    redirect('/login')
  }

  return session
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/authGuard.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/authGuard.ts lib/authGuard.test.ts
git commit -m "Add requireRole guard for page-level auth gating"
```

---

### Task 8: `/login` page

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: `apiClient` from `lib/apiClient.ts`, `ApiError` from `lib/apiClient.ts`.
- Produces: a client-rendered page at `/login`; no other task consumes this directly (it's a leaf UI page), so no unit test is written for it per the plan's testing scope (manual verification in Task 10 covers it).

- [ ] **Step 1: Write `app/login/page.tsx`**

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
    <main>
      <h1>Staff / Admin Login</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Manual smoke check (dev server)**

Run: `npm run dev`
Visit `http://localhost:3000/login`, submit an empty-then-wrong password, confirm "Incorrect password" renders and no navigation occurs. (Full flow re-checked end-to-end in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "Add /login page"
```

---

### Task 9: `/dashboard` page

**Files:**
- Create: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `requireRole` from `lib/authGuard.ts`.
- Produces: a server-rendered page at `/dashboard`, the redirect target for Task 8's login page and the route future stories (7, 8) build real content into.

- [ ] **Step 1: Write `app/dashboard/page.tsx`**

```tsx
import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'

export default async function DashboardPage() {
  const { role } = await requireRole('staff')

  return (
    <main>
      <h1>Staff Dashboard</h1>
      <p>Logged in as: {role}</p>
      {role === 'admin' && (
        <nav>
          <Link href="/admin/menu">Menu Management</Link>
        </nav>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "Add /dashboard page with role-gated admin controls"
```

---

### Task 10: Full test suite run + manual end-to-end verification

**Files:** none created; verification only.

**Interfaces:** none.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all tests from Tasks 3–7 pass (unit + integration), no failures.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Manual end-to-end verification against acceptance criteria**

With the dev server running (`npm run dev`) and the DB seeded (Task 2, Step 8):

1. Visit `/dashboard` while logged out → expect redirect to `/login`. ✅ AC4
2. On `/login`, enter `staff-temp-pw` → expect redirect to `/dashboard` showing "Logged in as: staff" and **no** Menu Management link. ✅ AC1
3. Clear the `session` cookie (dev tools), revisit `/login`, enter `admin-temp-pw` → expect redirect to `/dashboard` showing "Logged in as: admin" **with** the Menu Management link visible. ✅ AC2
4. Clear the `session` cookie, on `/login` enter an incorrect password → expect an inline "Incorrect password" message, no redirect, and confirm via dev tools that no `session` cookie was set. ✅ AC3

- [ ] **Step 4: Update `BUILD_STATUS.md`**

Change Story 1's row from `Building` to `Done` in the MVP epic table. Check off "Skeleton deployed" only if a real deploy has happened (it hasn't yet at this story) — leave deployment checklist untouched.

- [ ] **Step 5: Commit**

```bash
git add BUILD_STATUS.md
git commit -m "Mark Story 1 (Staff/Admin login) Done"
```
