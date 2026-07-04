# Story 7 — Staff Dashboard: View Pending Orders (Polling) — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (read) · Follows `04-architecture.md` ADR-001 (polling, not WebSockets/managed realtime), `02-domain-model.md`, `05-api-conventions.md`.

## Architecture

`app/dashboard/page.tsx` stays a server component exactly as it is today (Story 1): it calls `requireRole('staff')` for the auth gate and renders the admin-only nav links unchanged. It additionally renders a new client component, `app/dashboard/PendingOrdersDashboard.tsx` (`"use client"`), which owns all polling state — the fetched order list, the `setInterval` loop, and rendering. No routing change.

```
DashboardPage (server, auth-gated)
   └─ PendingOrdersDashboard (client)
         ├─ on mount: fetch, then setInterval(fetch, 3500ms)
         ├─ state: orders[]
         └─ renders OrderCard per order
```

## Service layer — `lib/orderService.ts`

Add `listOrders({ status }: { status?: FulfillmentStatus } = {}): Promise<OrderWithItems[]>`:
- Queries `prisma.order.findMany`, filtered by `fulfillmentStatus: status` when provided (no filter → all orders — not used by this story, but keeps the function generally correct rather than pending-only).
- `include: { items: true, table: true }` — the dashboard needs `table.number`, which `createOrder`'s existing include doesn't fetch.
- `orderBy: { createdAt: 'asc' }` — oldest-first (FIFO), so the longest-waiting order stays at the top instead of sliding down as new ones arrive.

`OrderWithItems` (already exported) is extended to `Order & { items: OrderItem[]; table: Table }` to carry the table relation through both `createOrder` and `listOrders`.

## API — `GET /api/orders`

- `requireApiRole('staff')` guard (admin passes too, per existing guard semantics) — the API-route variant that throws `ForbiddenError` on failure, per `app/api/menu-items/route.ts`'s pattern. (`requireRole`, used by `app/dashboard/page.tsx`, is the server-component variant that redirects — not usable inside a route handler.)
- Query param `status`, optional. If present, must be one of `Pending | Confirmed | Cancelled` (the `FulfillmentStatus` enum) — otherwise `ValidationError` (`400`). This story only ever calls it with `status=pending`; the generic validation exists so Story 8 can reuse this same route for a Confirmed-orders view without another round of route changes.
- Calls `listOrders({ status })`, returns `200` + array — empty array, never `404`, per `05-api-conventions.md`.
- Response shape per order: `{ id, orderNumber, fulfillmentStatus, paymentStatus, createdAt, table: { number }, items: [{ id, nameSnapshot, priceSnapshot, quantity }] }`.

## Client dashboard component (`app/dashboard/PendingOrdersDashboard.tsx`)

- `lib/apiClient.ts` currently only exports `post`/`patch`/`del`; this story adds a `get<T>(path: string): Promise<T>` following the same `fetch` + `ApiError`-on-non-2xx pattern as the others.
- On mount, fetches `/api/orders?status=pending` via the new `apiClient.get`, then re-fetches on a `setInterval` every 3.5s (midpoint of the 3–4s ADR-001 window), clearing the interval on unmount.
- A failed fetch (network error or non-2xx) is caught and ignored for that tick — the previously rendered order list is left as-is, and the next tick tries again. No error banner, no retry backoff (per design discussion: transient blips shouldn't add UI noise for a screen staff glance at repeatedly).
- Renders one `OrderCard` per order, oldest first: table number, order number, a relative "time placed" (e.g. "2 min ago"), and each item as `<qty>x <nameSnapshot>`.
- No pending orders → a plain "No pending orders" message instead of an empty list.
- Because polling only ever asks for `status=pending`, an order that becomes Confirmed or Cancelled simply stops appearing in the next fetch's result — no separate removal logic needed on the client.

## Errors

No new error classes. `ValidationError` (bad `status` value) flows through the existing `handleApiError` envelope, same as other routes.

## Testing

- `lib/orderService.test.ts` (extend existing file, mocks `prisma`): `listOrders` filters by the given status; omitting status queries all; results are ordered `createdAt asc`; `table` and `items` are included in the query.
- `app/api/orders/route.test.ts` (extend existing file, mocks `orderService` + `authGuard`): `GET` calls `requireApiRole('staff')` and returns `403` when it rejects; valid `status=pending` returns `200` + array; invalid status value returns `400`; no status returns `200` with an unfiltered call.
- `lib/apiClient.test.ts` (extend if it exists, else create): `get` resolves with parsed JSON on a `2xx` response and throws `ApiError` on non-`2xx`, mirroring `post`'s existing test coverage.
- `app/dashboard/PendingOrdersDashboard.test.tsx` (new, jsdom + Testing Library, Vitest fake timers per `06b-engineering-decisions.md`'s test stack): initial fetch renders returned orders; advancing fake timers by one interval triggers a second fetch and re-renders with updated data; a rejected fetch on one tick leaves the previously rendered orders unchanged and a later successful tick recovers; zero orders renders "No pending orders".

## Scope boundary

Does not touch: confirm/pay actions (Story 8 — no interactive buttons on `OrderCard` yet), menu management (Story 3), customer-side order edit/cancel (Story 6).
