# API Conventions

**Status codes.**
- `POST` (create) → `201` + created resource
- `PATCH` (partial update, e.g. confirm/pay/toggle sold-out) → `200` + updated resource
- `DELETE` (cancel/remove) → `204`, regardless of prior existence
- `GET` single → `200` or `404`
- `GET` collection → `200` + array, always (empty array, never `404`)

**Error envelope.**
```json
{ "error": "<short code, e.g. ORDER_NOT_PENDING>", "message": "<human-readable>" }
```
Flat shape for MVP — no trace ID/timestamp yet (collapsed per `06a` P5 guidance).

**Pagination.** None for MVP — collections (orders, menu items) are small enough (tens of rows) to return in full. Add pagination only if a collection's real size demands it.

**Auth.** Session cookie carrying a `role` claim (`staff` | `admin`). Checked by one shared `requireRole()` guard applied per route — never inline per-handler logic.

**Naming.** RESTful resource nouns, plural: `/api/tables`, `/api/menu-items`, `/api/orders`, `/api/orders/:id/confirm`, `/api/orders/:id/pay`. `camelCase` for JSON field names.

**Versioning.** None. Single client (this app), no external consumers — add a version segment only if a second client ever consumes this API.
