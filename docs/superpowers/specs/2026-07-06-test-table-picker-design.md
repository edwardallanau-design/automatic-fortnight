# Test Table Picker — Design

**Status.** Approved for implementation.
**Epic.** Digital Ordering Core Loop · Bounded context: Ordering (Table entity) — internal tooling, not a numbered epic story.
**Related docs.** `docs/design/02-domain-model.md`, `docs/superpowers/specs/2026-07-03-story-2-table-setup-qr-design.md`

---

## Context

Every real table is reached via `/order?table=<uuid>` (Story 2), where `<uuid>` is the table's opaque database id. That's correct for QR-scanning customers, who never type the URL, but it makes manual QA tedious: to exercise the order flow for a specific table, a developer/tester has to open Admin → Table Setup, find the right table, and copy its UUID out of the rendered link or QR image every time.

This feature adds one memorable, internal-only URL — `/order/test` — that lists existing tables by their human-friendly `number` and lets the tester jump straight into that table's real, unmodified order flow. It exists purely to make manual testing faster; it is not a customer-facing feature, is not part of the MVP epic's acceptance criteria, and does not change the `Table` domain model, its invariants, or the real ordering flow in any way.

## Decisions

- **Route shape: `/order/test`, not a query-param convention.** Using a distinct path (rather than a reserved value like `/order?table=test`) avoids any ambiguity with `tableService.getTableOrThrow`, which treats its input as an opaque id lookup — no need to special-case a magic string inside real table-resolution logic. Next.js resolves `/order/test` as a sibling route to `/order`'s existing `page.tsx`, so no routing conflict.
- **Picker, not a fixed table.** Confirmed with the user: this must let a tester choose *which* real table to simulate (not just always resolve to one designated fixed table), because different tables may need to be exercised independently during testing. The picker page reuses the existing `listTables()` from `lib/tableService.ts` — no new query or service method needed.
- **No redirect logic, no new session/state.** Selecting a table on the picker is a plain link to `/order?table=<real id>` — the tester lands in the exact same order flow a real customer would, with no special "test mode" flag threaded through `Cart.tsx` or order submission. This guarantees the test path can never diverge from (and therefore never fails to catch bugs in) the real path.
- **Non-production only.** The route checks `process.env.NODE_ENV === 'production'` at the top of the Server Component and renders a plain "not available" message (no table data, no listing) if true. This is a convenience gate, not a security boundary — the picker only ever links to the same `/order?table=<id>` URLs that are already public via QR codes, so there's no new data exposure if the check were ever bypassed; the gate exists solely to keep it out of the production customer-facing surface area.
- **Not shown in Admin → Table Setup.** Confirmed with the user: keep it out of the admin table list/UI entirely. It's a developer/QA entry point, not a manageable resource — there's nothing to create, edit, or delete, so it doesn't belong alongside real `Table` rows.
- **No new Prisma model, no migration.** This is a read-only UI in front of existing data. `Table` stays exactly as defined in `02-domain-model.md` and Story 2's migration.

## Components

1. **`app/order/test/page.tsx` (new).**
   - Server Component, no auth guard (matches `/order`'s existing unauthenticated, customer-facing pattern — this route is reachable by anyone who knows the URL, same trust level as a real QR link).
   - Guard: if `process.env.NODE_ENV === 'production'`, render a plain "This page isn't available." message and return early — no table data fetched or rendered.
   - Otherwise: calls `listTables()` (existing, unchanged) and renders a simple list — each entry shows `Table {number}` as a link to `/order?table=${id}`.
   - Empty state: if `listTables()` returns `[]`, render "No tables have been created yet." (reuses the same plain-text-message style as `/order`'s existing error states).

## Data flow

```
Tester visits /order/test
        │
  NODE_ENV === production? ──yes──> render "not available" message, done
        │ no
        ▼
  listTables() (existing, unchanged)
        │
  render list: Table 1 → /order?table=<id-1>
               Table 2 → /order?table=<id-2>
               ...
        │
  tester clicks a table
        ▼
  /order?table=<id>  (existing Story 2/4/5 flow, completely unmodified)
```

## Error handling

| Scenario | Result |
|---|---|
| Visited in production | Plain "not available" message, `200`, no table data rendered |
| No tables exist yet | Plain "No tables have been created yet." message |
| Table selected from the list | Falls straight into the existing `/order?table=<id>` flow and its existing error handling (Story 2) — nothing new to handle here |

## Testing

- **Component test — `/order/test` page.**
  - `NODE_ENV=production` → renders the "not available" message, does not call `listTables()`.
  - `NODE_ENV!=production`, tables exist → renders one link per table, labeled with `number`, pointing to `/order?table=<id>`.
  - `NODE_ENV!=production`, no tables → renders the empty-state message.
- No changes to `tableService`, `/order`, or `Cart` tests — none of that code is touched.
- No Playwright e2e needed — this is a thin internal picker in front of already-tested flows.

## Scope boundary (do NOT touch)

- `lib/tableService.ts` — reused as-is, no new methods.
- `app/order/page.tsx`, `app/order/Cart.tsx` — real order flow, completely unmodified.
- `app/admin/tables/page.tsx` — the test picker is not linked from or shown here.
- `Table` Prisma model / migrations — no schema change.

## Acceptance criteria

- [ ] Visiting `/order/test` outside production shows a list of existing tables by number.
- [ ] Clicking a table in the list navigates to that table's real `/order?table=<id>` order flow, unchanged from the QR-scan path.
- [ ] Visiting `/order/test` in production shows a plain "not available" message instead of table data.
- [ ] No changes to the `Table` model, `tableService`, the real `/order` page, or the admin table list.
