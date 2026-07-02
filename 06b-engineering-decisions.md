# Engineering Decisions — Digital Menu & Ordering (MVP)

**Dial setting.** Product mode, MVP/POC — principles collapsed per `06a-engineering-principles.md` guidance (Floor principles still fully apply; Scales principles run at their collapsed/MVP form).

---

## 1. Stack
- Backend: Node.js via Next.js API routes, Prisma as the data layer, Postgres (Neon) as the DB.
- Frontend: Next.js (React), mobile-first responsive layout, no separate UI framework.
- Infra / deploy: Vercel (app hosting + serverless functions), Neon (managed Postgres), no containers needed at this scale.

## 2. Layer names — *Instantiates P1*
- Boundary (transport): Next.js **API route handlers** (`/app/api/**`)
- Logic (business rules): **service modules** (`orderService`, `menuService`, `authService`)
- Persistence (storage): **Prisma repository functions**, one module per entity
- Cross-cutting location: `lib/` — auth guard, error types, shared validation

## 3. Exception taxonomy — *Instantiates P2*
- Root type: one base `DomainError` (unchecked)
- Category parents → status: `NotFoundError → 404`, `ValidationError → 400`, `ConflictError → 409` (e.g. confirming an already-confirmed order), `ForbiddenError → 403`
- Naming convention: `{Entity}{Condition}Error` (e.g. `OrderNotPendingError`)
- Single handler location: one shared `handleApiError()` wrapper called by every route handler — collapsed MVP form, no full global-handler framework needed since Next.js API routes are independent functions.

## 4. Logging format — *Instantiates P3*
- Format + transport: plain structured `console.log`/`console.error` lines (JSON-stringified) — Vercel captures these directly; no separate logging service for MVP.
- Context fields: `orderId`/`tableNumber` where relevant, attached at the point of logging (no request-scoped middleware needed at this scale).
- Per-call fields: success → entity id + action (e.g. `order.confirmed { orderId }`); failure → error type + message, logged once in `handleApiError()`.
- Severity convention: service layer logs business outcomes (success/rejection); the shared error wrapper logs failures. Never both for the same event.
- **Never logged:** session cookie/token values.

## 5. API contract — *Instantiates P5*
See `05-api-conventions.md` — status-code table, flat error envelope `{ error, message }`, no pagination, no versioning.

## 6. Boundary gateway & shared types — *Instantiates P6/P7*
- Outbound wrapper: not applicable for MVP — no external service calls exist (no payment/delivery integrations). If one is added later (e.g. a notification provider), it gets one wrapper module then.
- Frontend → API: one shared `apiClient` fetch wrapper in `lib/apiClient.ts`; components never call `fetch` directly.
- Typed error it throws: one `ApiError { code, message }` type.
- Shared types location: `lib/types.ts` — `Order`, `OrderItem`, `MenuItem`, `Table` types imported everywhere, never redeclared inline.

## 7. Test stack — *Instantiates P8*
- Logic-layer unit (domain rules/invariants): **Vitest** on service modules.
- Integration (API route + DB): **Vitest** + a real Postgres test database (Neon branch or local Postgres via Docker for test runs).
- Boundary-call unit (apiClient shape): skipped for MVP — low risk, single internal consumer.
- End-to-end (one happy path): **Playwright** — one script covering scan → order → staff confirm → pay.

## 8. Authorization placement & roles
- Authority-check location: one `requireRole(role)` guard applied at the top of each protected route handler — never inline business-logic checks.
- Hard rule confirmed: no inline authority checks in service or persistence code.
- Role set: `staff` (confirm orders, mark paid, toggle menu item availability), `admin` (all staff permissions + edit menu items/prices + modify Confirmed orders). No customer-side auth — the customer flow is unauthenticated by design (no accounts, per Artifact 01 non-goals).

## 9. Pointers
- **Tenancy / isolation:** single-tenant → see `03-tenancy-model.md`.
- **Architecture topology & module boundaries:** → see `04-architecture.md`.
- **Domain model & invariants:** → see `02-domain-model.md`.
