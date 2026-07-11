---
name: verify
description: Build/launch/drive recipe for smoke-testing this app end-to-end
---

# Verifying digitalmenu changes

This app has no Playwright/e2e harness checked in. Docker Compose is the
real local run loop (see root `CLAUDE.md` gotchas) — use it, not `npm run dev`.

## Launch

```bash
docker compose up --build -d      # rebuilds image, applies migrations, seeds (idempotent)
docker compose logs app --tail 40 # confirm "✓ Ready" with no errors
```

App: `http://localhost:3001` (maps to container port 3000). DB: host port 5433.

## Get real ids to drive with

There's no `GET /api/tables` (405 — that route only takes `POST`). Query
Postgres directly instead:

```bash
docker compose exec db psql -U $(grep POSTGRES_USER .env.docker | cut -d= -f2) \
  -d $(grep POSTGRES_DB .env.docker | cut -d= -f2) \
  -c 'SELECT id, number FROM "Table" ORDER BY number;'
```

The dev DB volume persists across sessions and may have extra tables beyond
the seed's `1,2,3` — don't assume table numbers map to a fixed id.

Check/toggle venue acceptance the same way:

```bash
... -c 'SELECT * FROM "VenueSettings";'
... -c "UPDATE \"VenueSettings\" SET \"acceptingOrders\" = false WHERE id = 'singleton';"
```

Toggling this is how you exercise the closed-venue branch of `/order` — flip
it back to `true` when done, since this DB is shared, not disposable.

## Drive it — customer order flow (`/order?table=<id>`)

For anything client-side (cart timers, animations, stepper state), curl only
proves the SSR shell — the bug/fix lives in the browser. This project has no
`@playwright/test` dependency; install a throwaway one in the scratchpad dir
rather than touching `package.json`:

```bash
mkdir -p <scratchpad>/pw && cd <scratchpad>/pw
npm init -y && npm install playwright@1
npx playwright install chromium   # ~/AppData/Local/ms-playwright, often already cached
```

Then a small Node script with `chromium.launch()` / `page.goto(...)`. Two
UI gotchas that will otherwise stall a script:
- The cart panel starts collapsed (`cart-summary--collapsed`) — the qty
  stepper buttons aren't clickable until `.cart-rail__toggle` is clicked.
- Menu item button accessible names are `"<name>$<price>"` concatenated —
  `getByRole('button', { name: /^Espresso/ })` (anchored) avoids matching
  the "Increase/Decrease Espresso quantity" stepper buttons too.

For server-only branches (invalid table id, closed venue), plain `curl` on
`/order?table=...` and grepping the response body is enough — no browser
needed since nothing client-side is being exercised.

## Teardown

```bash
docker compose stop   # NOT `down -v` — the dbdata volume has real seed/table state, don't nuke it
```
