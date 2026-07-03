# Story 4 — Customer Menu View — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Menu (read) · Follows `05-api-conventions.md`, `02-domain-model.md`.

## Architecture

Extends the existing `app/order/page.tsx` server component from Story 2 — no new route, no new API endpoint. The page already: reads `searchParams.table`, shows a friendly `role="alert"` message if `tableId` is missing, calls `getTableOrThrow(tableId)`, and shows the same friendly message on `NotFoundError`. That error handling is unchanged.

After a successful table lookup, the page calls `listMenuItems()` from `lib/menuService.ts` directly (same service the admin page uses) and renders the result. The page stays a pure server component — no `"use client"`, no interaction handlers, no client-side state. Story 4 is read-only display; wiring clicks to a cart is explicitly Story 5's job.

## Rendering

- A `<ul>` of menu items, each `<li>` containing a `<button type="button">`:
  - **Available** (`available === true`): enabled, focusable, styled as interactive (hover/focus visual states), shows name + price. No `onClick` — clicking currently does nothing. This satisfies "selectable" as a pure visual/accessibility affordance for Story 5 to wire up later, without building any cart logic now.
  - **Sold out** (`available === false`): rendered with the `disabled` attribute (native HTML disables focus, click, and exposes correct semantics to assistive tech — no need for a separate `aria-disabled`), styled visibly muted (e.g. reduced opacity + strikethrough on the name), shown in place rather than hidden, per the acceptance criteria.
- Ordering: whatever `listMenuItems()` returns (already sorted by `name`) — no reordering by availability.
- Empty state: if `listMenuItems()` returns an empty array, render "No items available right now." instead of an empty `<ul>`. (Not in the acceptance criteria, but avoids a customer seeing what looks like a broken blank page.) This is a flat text condition, not a special-cased "all sold out" vs "literally zero rows" distinction — both look like an empty list to the customer.

## Styling

No CSS framework exists in this codebase yet (plain semantic HTML + `app/globals.css` CSS variables for light/dark). This story adds mobile-first plain CSS — a single-column list, tap targets at a minimum comfortable height (~44px), respecting the existing `--background`/`--foreground` variables and dark-mode media query. Scope: enough to make the list usable and legible on a phone screen; not a design system. Lives in `app/globals.css` alongside the existing rules, matching how minimal the current styling footprint already is — a colocated CSS module would be reasonable too, but there's no existing per-page CSS module convention to break from by adding one.

## Data flow

```
customer scans QR → GET /order?table=<id>
  → tableId missing/invalid → existing friendly error (unchanged)
  → getTableOrThrow(tableId) succeeds
  → listMenuItems() → MenuItem[] (id, name, price: Decimal, available)
  → price converted via .toString() for rendering (Decimal isn't directly usable in JSX the same way; matches the existing admin page's pattern of passing price as a string)
  → render list (or empty-state message)
```

## Errors

No new error handling. Table-not-found and missing-table-id paths are already fully covered by the existing try/catch in `app/order/page.tsx`. `listMenuItems()` has no error path of its own beyond the shared Prisma failure mode, which isn't specific to this story.

## Testing

This is the first UI-rendering story in the codebase — all existing tests are Vitest against services/API routes in a `node` environment; there's no React Testing Library or `jsdom` setup yet.

- Add `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` as devDependencies.
- Add a `jsdom` Vitest environment, scoped to component tests only (e.g. via a `// @vitest-environment jsdom` pragma per test file, or a separate project/config block) — do not switch the whole suite to `jsdom`, since existing service/API tests are correctly `node`.
- New test file colocated with the page (e.g. `app/order/page.test.tsx`), covering:
  - Available items render as enabled, focusable buttons showing name and price.
  - Sold-out items render as `disabled` buttons, visually distinct, not focusable.
  - Empty menu (`listMenuItems()` returns `[]`) renders the "No items available right now." message.
  - Existing missing/invalid table id behavior still holds (regression coverage for the pre-existing logic this story extends).
- Mock `lib/menuService` and `lib/tableService` the same way `api/tables/route.test.ts` mocks `tableService` today.

## Scope boundary

Does not touch: cart/order submission (Story 5), staff dashboard (Story 7/8), menu management (Story 3 — read-only consumer of `listMenuItems()` only). No `onClick` handlers, no client-side cart state, no new API routes.
