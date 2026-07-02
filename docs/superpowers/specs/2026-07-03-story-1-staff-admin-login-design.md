# Story 1 — Staff/Admin Login — Design

**Status.** Approved for implementation.
**Epic.** Digital Ordering Core Loop · Bounded context: Auth
**Source story.** `docs/design/07-epic-map.md` — Story 1
**Related docs.** `docs/design/02-domain-model.md`, `03-tenancy-model.md`, `04-architecture.md` (ADR-002, ADR-003), `05-api-conventions.md`, `06a-engineering-principles.md`, `06b-engineering-decisions.md`

---

## Context

The repo currently contains only planning docs — no Next.js app, no Prisma schema, no dependencies installed. Story 1 is the first implementation story, so it also bootstraps the minimal app scaffold (Next.js, Prisma, DB connection, shared `lib/` helpers) needed for auth to function. Later stories reuse this scaffold; this story does not build unrelated domain entities (Table, MenuItem, Order) beyond the one `Credential` model it owns.

Per ADR-003, there is no per-employee account system — two shared role credentials (`staff`, `admin`). Per ADR-004, Postgres (Neon) + Prisma. Per `04-architecture.md`, session is a signed cookie; this design picks a minimal custom JWT-in-cookie over next-auth (see Decisions below).

## Decisions

- **Credential storage.** DB-seeded `Credential` table (one row per role), not env vars — makes rotating a password a data change, not a redeploy, and keeps the auth model consistent with "real" data rather than a special-cased config value.
- **Password values for this build.** Placeholders (`staff-temp-pw`, `admin-temp-pw`) seeded now; user will rotate them before any real deployment. Never logged, never committed in plaintext (only bcrypt hashes reach the DB; the seed script reads plaintext from a gitignored `.env.local` value or hardcodes the placeholder — see Seed section).
- **Session mechanism.** Custom signed JWT stored in an httpOnly cookie, verified with a server-side secret (`AUTH_SECRET` env var). Chosen over next-auth: next-auth's data model assumes individual `User` identities, which doesn't map cleanly onto "two shared role credentials," and pulling in its config surface (providers, adapters, CSRF plumbing) is unjustified weight for a payload that is just `{ role }`.
- **Login form.** Single password field. The password itself determines the role (staff password vs admin password) — no separate role selector, since that would be redundant with what the password already encodes.
- **Dashboard scope.** This story builds a minimal `/dashboard` stub that proves the redirect + role gate work: shows current role, shows a "Menu Management" link only when `role=admin`. Real dashboard content (pending orders, confirm/pay actions) belongs to Stories 7/8 and is explicitly out of scope here.

## Components

1. **Prisma schema — `Credential` model.**
   - `id` (uuid, pk), `role` (enum: `staff` | `admin`, unique), `passwordHash` (string).
   - Seed script creates exactly two rows (one per role) with bcrypt-hashed placeholder passwords.

2. **`lib/authService.ts` (logic layer).**
   - `login(password: string): Promise<{ role: Role }>` — loads all `Credential` rows, bcrypt-compares the input against each hash, returns the matching role.
   - Throws `InvalidCredentialError` (→ `401` per the shared error taxonomy) if no match.
   - Owns the only business rule in this story: "a password matches at most one role." No other layer branches on credential logic.

3. **`app/api/auth/login/route.ts` (boundary).**
   - `POST`, body `{ password: string }`.
   - Parses/validates shape (missing password → `400 ValidationError`), calls `authService.login`.
   - On success: signs a JWT `{ role }` (short expiry not required for MVP — session persists until logout/expiry chosen as 7 days), sets as httpOnly, secure (in prod), `sameSite=lax` cookie named `session`. Returns `200 { role }`.
   - On failure: routed through the shared `handleApiError()` wrapper → `401 { error: "INVALID_CREDENTIAL", message }`.
   - No cookie is set on failure.

4. **`lib/authGuard.ts` — `requireRole(minRole: Role)`.**
   - Reads and verifies the `session` cookie's JWT using the server secret.
   - Role hierarchy: `admin` satisfies any check that requires `staff` or `admin`; `staff` only satisfies `staff`-level checks.
   - Missing/invalid/insufficient → for page routes, redirects to `/login`; for API routes, throws `ForbiddenError` (`403`) or is treated as unauthenticated (`401`) if no session at all — unauthenticated vs wrong-role is distinguished per the acceptance criteria ("wrong credential" vs "unauthenticated" are different scenarios).
   - This is the **only** place authority is checked, per `06b` §8 — no inline role checks anywhere else.

5. **`app/login/page.tsx`.**
   - Single password input + submit button.
   - Calls `apiClient.post('/api/auth/login', { password })`.
   - Success → client-side redirect to `/dashboard`.
   - Failure (`401`) → inline error message "Incorrect password," field retained, no redirect.

6. **`app/dashboard/page.tsx`.**
   - Server component. Calls `requireRole('staff')` (the minimum role for this page) at the top.
   - Unauthenticated/invalid session → redirect to `/login` (server-side redirect, not a client flash).
   - Renders current role and, only if `role === 'admin'`, a "Menu Management" link (target route doesn't exist yet — Story 3 builds it; the link can point to a placeholder path `/admin/menu` that 404s until then, which is acceptable since Story 3 explicitly owns building that page).

7. **Shared scaffolding (reused by all future stories).**
   - `lib/apiClient.ts` — thin `fetch` wrapper; throws one typed `ApiError { code, message }`; used by every future frontend call, not just login.
   - `lib/types.ts` — shared `Role` type (`'staff' | 'admin'`) and response shapes for this story; extended by later stories, never redeclared inline.
   - `lib/errors.ts` — `DomainError` base + `ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `InvalidCredentialError` (extends a 401-mapped category), per `06b` §3 naming convention.
   - `lib/handleApiError.ts` — one shared wrapper called by every route handler; maps error categories to status codes; logs failures exactly once (type + message, never secrets).

## Data flow

```
/login page → apiClient.post → POST /api/auth/login → authService.login → Prisma (Credential lookup) → bcrypt.compare
                                                                                        │
                                                              match ──────────────────┘
                                                                │
                                                    sign JWT{role} → set httpOnly cookie → 200 {role}
                                                                │
                                                    client redirect → /dashboard → requireRole('staff')
                                                                                        │
                                                                          verify cookie JWT → render role + admin link if applicable
```

## Error handling

| Scenario | Layer that detects it | Result |
|---|---|---|
| Missing `password` in request body | API route (shape validation) | `400 { error: VALIDATION_ERROR }` |
| Password matches no credential | `authService.login` → `InvalidCredentialError` | `401 { error: INVALID_CREDENTIAL }`, no cookie set |
| No/invalid/expired session cookie on `/dashboard` | `requireRole` guard | Redirect to `/login` |
| No/invalid session cookie on a protected API route (future stories) | `requireRole` guard | `401` |

All failures route through the one `handleApiError()` wrapper (API routes) or the guard's own redirect logic (pages) — never duplicated per-handler.

## Testing

Per `06b` §7 and P8 (test ownership, one concern one layer):

- **Logic-layer unit (Vitest) — `authService.login`.**
  - Correct staff password → `{ role: 'staff' }`.
  - Correct admin password → `{ role: 'admin' }`.
  - Wrong password → throws `InvalidCredentialError`.
- **Integration (Vitest + test DB) — `/api/auth/login` route.**
  - Valid staff credential → `200`, `role: staff`, `session` cookie present.
  - Valid admin credential → `200`, `role: admin`, `session` cookie present.
  - Invalid credential → `401`, no `Set-Cookie` header.
  - Missing `password` field → `400`.
- **Integration (Vitest) — `requireRole` guard / `/dashboard` access.**
  - No session cookie → redirect to `/login`.
  - Valid staff session → dashboard renders without admin link.
  - Valid admin session → dashboard renders with admin link.
- **No Playwright e2e for this story.** The one happy-path e2e script (scan → order → confirm → pay) is reserved until enough of the core loop exists to make it meaningful; login is exercised as a setup step within that future script, not duplicated here (P8: no concern tested twice).

## Scope boundary (do NOT touch)

- Customer-facing menu/order flow (Stories 4/5).
- Per-employee accounts (explicitly out of scope, ADR-003).
- Real dashboard content — pending orders list, confirm/pay actions (Stories 7/8).
- Table/MenuItem/Order Prisma models (owned by Stories 2/3/5) — this story's schema change is limited to `Credential`.

## Acceptance criteria (from epic map, restated for traceability)

- [ ] Entering the staff credential logs in with `role=staff` and redirects to the staff dashboard.
- [ ] Entering the admin credential logs in with `role=admin` and redirects to the staff dashboard with admin-only controls visible (menu management link).
- [ ] Wrong credential shows an error, no session set.
- [ ] Visiting a staff/admin route while unauthenticated redirects to login.
