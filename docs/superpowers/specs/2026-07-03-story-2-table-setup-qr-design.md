# Story 2 — Table Setup & QR Identification — Design

**Status.** Approved for implementation.
**Epic.** Digital Ordering Core Loop · Bounded context: Ordering (Table entity)
**Source story.** `docs/design/07-epic-map.md` — Story 2
**Related docs.** `docs/design/02-domain-model.md`, `03-tenancy-model.md`, `05-api-conventions.md`, `06a-engineering-principles.md`, `06b-engineering-decisions.md`

---

## Context

Story 1 built the auth scaffold (`lib/authService`, `authGuard`, `session`, `errors`, `handleApiError`, `apiClient`). Story 2 is the first story to add a domain entity beyond `Credential`: `Table`. It also opens the customer-facing side of the app for the first time, via a minimal `/order` route — but the actual menu-rendering content of that route belongs to Story 4, not here.

Per `02-domain-model.md`, Table is a simple reference value ("no lifecycle of its own"; only invariant is uniqueness of `number`) — not an aggregate root with business rules. This keeps the story small: create + list + identify, nothing else.

## Decisions

- **Table identifier in the QR URL.** The QR encodes `/order?table=<id>` using the table's database UUID, not its human-assigned `number`. Rationale: the number is guessable/enumerable and could be reassigned; the UUID is opaque and stable. Customers never type it — they only scan — so readability doesn't matter.
- **No persisted `qrCode` column.** The domain model doc lists `qrCode` as a Table field, but the QR image is fully derived from `id` (which is already stable and unique). Persisting a redundant copy would just be a cache to keep in sync for no benefit at this scale. This is a deliberate, harmless divergence from the domain-model doc's literal field list — it is not one of the file's invariants, so it doesn't require a stop-and-ask under CLAUDE.md's stop rules. The QR image is generated at render time from `id`.
- **QR generation library.** The `qrcode` npm package (small, no native deps, generates a data-URL PNG server-side). Rejected: a third-party QR image API — adds an external runtime dependency and availability risk to something in the core ordering path, which conflicts with ADR-002's preference for a self-contained deploy.
- **`/order` page scope.** Story 2 builds only a stub: resolve the `table` query param, show a plain "Table {number} — menu coming soon" placeholder on success, and a clear error state on missing/invalid id (no crash). Story 4 replaces the placeholder with the real menu. This satisfies this story's acceptance criterion about invalid table ids without pulling Story 4's scope forward.
- **Admin-only.** Table creation and the QR view/print page are gated by `requireRole('admin')`, consistent with `06b` §8 (staff can view/operate the ordering flow day-to-day, but table setup is an admin/setup-time action, matching how `07-epic-map.md` scopes Story 3's admin-only menu management).

## Components

1. **Prisma schema — `Table` model.**
   - `id` (uuid, pk), `number` (Int, unique), `createdAt` (DateTime, default now).
   - New migration, additive only — does not touch the existing `Credential` model.

2. **`lib/tableService.ts` (logic layer, calls Prisma directly).**
   - `createTable(number: number): Promise<Table>` — calls `prisma.table.create`; on a Prisma unique-constraint violation (duplicate `number`, code `P2002`), throws `ConflictError` (→ `409`).
   - No separate repository module: `tableService` calls `prisma` directly, matching the established pattern from Story 1's `authService` rather than the aspirational separate-repository-layer description in `04-architecture.md` (implementation-time simplification, decided during planning).
   - `getTableOrThrow(id: string): Promise<Table>` — throws `NotFoundError` (→ `404`) if `id` is missing/malformed or no row matches.
   - `listTables(): Promise<Table[]>` — passthrough for the admin page.

3. **`app/api/tables/route.ts` (boundary).**
   - `POST` — body `{ number: number }`. `requireApiRole('admin')`. Missing/non-integer `number` → `400 ValidationError`. Duplicate → `409` via `tableService.createTable`. Success → `201` + created table.
   - No `GET /api/tables` route: the admin page is a Server Component and calls `tableService.listTables()` directly, so a dedicated read endpoint would be an unused indirection (implementation-time simplification over the original design, decided during planning).

4. **`lib/qrCode.ts`.**
   - `generateQrDataUrl(url: string): Promise<string>` — thin wrapper around the `qrcode` package's `toDataURL`, returning a `data:image/png;base64,...` string.
   - No persistence; called at render time only.

5. **`app/admin/tables/page.tsx`.**
   - Server component, `requireRole('admin')` at the top (same pattern as `app/dashboard/page.tsx`).
   - Renders a create-table form (number input) and a list of existing tables.
   - For each table, computes the `/order?table=<id>` URL (absolute, using the request's origin) and renders its QR via `generateQrDataUrl`, plus the raw URL as text (for manual printing/debugging).
   - Create form posts via `apiClient.post('/api/tables', { number })`; on `409`, shows an inline "table number already exists" error; on success, refreshes the list.
   - Linked from `app/dashboard/page.tsx`'s existing admin nav block, alongside the "Menu Management" link.

6. **`app/order/page.tsx`.**
   - No auth guard (customer-facing, unauthenticated by design per `06b` §8).
   - Reads `table` search param. Missing or not resolvable via `tableService.getTableOrThrow` → renders a plain error message ("This table link isn't valid. Please ask staff for help."), no crash, no throw escaping to a Next.js error boundary.
   - Valid → renders `Table {number} — menu coming soon` placeholder. Story 4 replaces this rendering with the real menu; the id-resolution/error-handling shell built here is reused as-is.

## Data flow

```
Admin creates table:
/admin/tables page → apiClient.post → POST /api/tables → tableService.createTable → Prisma (unique on number)
                                                                    │
                                                    duplicate ─────┴─── 409 CONFLICT
                                                                    │
                                                              201 { id, number, createdAt }
                                                                    │
                                                    page re-renders list → generateQrDataUrl(`${origin}/order?table=${id}`) → <img>

Customer scans QR:
/order?table=<id> → tableService.getTableOrThrow(id) → Prisma findUnique
                                            │
                              not found ────┴──── render error state (no crash)
                                            │
                                      render "Table {number} — menu coming soon"
```

## Error handling

| Scenario | Layer that detects it | Result |
|---|---|---|
| `POST /api/tables` missing/non-numeric `number` | API route (shape validation) | `400 VALIDATION` |
| `POST /api/tables` duplicate `number` | `tableService.createTable` → `ConflictError` | `409 CONFLICT` |
| `POST /api/tables` without admin session | `requireApiRole('admin')` guard | `403 FORBIDDEN` (throws instead of redirecting, since `redirect()` doesn't work inside Route Handlers) |
| `/admin/tables` without admin session | `requireRole('admin')` guard | Redirect to `/login` (page-level pattern, same as Story 1) |
| `/order?table=` missing or invalid/nonexistent id | `tableService.getTableOrThrow` → `NotFoundError`, caught in the page component | Rendered error state, `200` (no thrown error escapes to Next.js's default error boundary) |

All API-route failures route through the existing shared `handleApiError()` wrapper — no new error-handling pattern introduced.

## Testing

Per `06b` §7 and P8:

- **Logic-layer unit (Vitest) — `tableService`.**
  - `createTable` with a fresh number → returns the created table.
  - `createTable` with a duplicate number → throws `ConflictError`.
  - `getTableOrThrow` with a valid id → returns the table.
  - `getTableOrThrow` with a missing/invalid id → throws `NotFoundError`.
- **Integration (Vitest, mocked service) — `/api/tables` route, mirroring `login/route.test.ts`'s pattern.**
  - `POST` valid body → `201` + table.
  - `POST` duplicate number → `409`.
  - `POST` missing `number` → `400`.
  - `GET` → `200` + array.
- **`/order` page — invalid table id renders the error state, not a thrown exception** (component-level test).
- **No Playwright e2e for this story** — reserved for the full happy-path script once more of the core loop exists (same reasoning as Story 1).

## Scope boundary (do NOT touch)

- Menu items (`MenuItem` model) — Story 3.
- Order submission logic — Story 5.
- The real customer menu view content on `/order` — Story 4 (this story only builds the id-resolution shell and placeholder).

## Acceptance criteria (from epic map, restated for traceability)

- [ ] Admin can create a table with a unique number; duplicate numbers are rejected (`409`).
- [ ] Each table has a QR code rendering that links to `/order?table=<id>`.
- [ ] Visiting `/order?table=<invalid-id>` shows a clear error, not a crash.
