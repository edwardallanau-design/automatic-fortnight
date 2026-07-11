---
name: verify
description: Build/launch/drive recipe for smoke-testing this app end-to-end
---

# Verifying digitalmenu changes

This app has no Playwright/e2e harness checked in. Docker Compose is the
real local run loop (see root `CLAUDE.md` gotchas) — use it, not `npm run dev`.

## Launch

```bash
docker compose up --build -d      # rebuilds image, applies migrations, create-once seeds
docker compose logs app --tail 40 # confirm "✓ Ready" with no errors
```

App: `http://localhost:3001` (maps to container port 3000). DB: host port 5433.

The local DB is **ephemeral** (tmpfs, RAM-backed): every `docker compose up`
starts from an empty database that the entrypoint migrates and seeds fresh. It's
a throwaway fixture, not a store of real data — safe to nuke, and it never
carries state between runs. Prod/dev use their own persistent Neon databases.

## Get real ids to drive with

There's no `GET /api/ordering-points` list route, so query Postgres directly.
Ordering points live in `"OrderingPoint"` (the old `Table` was renamed in the
multi-branch work); the seed creates just the **Counter** for the Main branch,
so ids change every run — always re-query, never hardcode:

```bash
docker compose exec db psql -U $(grep POSTGRES_USER .env.docker | cut -d= -f2) \
  -d $(grep POSTGRES_DB .env.docker | cut -d= -f2) \
  -c 'SELECT op.id, op.label, b.name AS branch FROM "OrderingPoint" op JOIN "Branch" b ON b.id = op."branchId" ORDER BY b.name, op.label;'
```

To exercise the closed-venue branch of `/order`, close the ordering point's
**branch** (venue-wide `VenueSettings.acceptingOrders` is vestigial since INV-10
was amended to a branch-level-only gate — the app no longer reads it):

```bash
... -c 'UPDATE "Branch" SET "acceptingOrders" = false WHERE name = ''Main'';'
```

Since the DB is ephemeral you don't have to revert it — the next `up` reseeds.

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
docker compose down   # DB is ephemeral (tmpfs) — nothing to preserve; `stop` also fine
```
