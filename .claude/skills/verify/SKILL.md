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

Login is **password-only** (no username field, `#password` input) — role comes
from which shared password you enter:

```bash
grep SEED_ .env.docker   # SEED_STAFF_PASSWORD / SEED_ADMIN_PASSWORD
```

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

**Alternative install, if the script lives inside the repo instead of the
scratchpad dir** (e.g. a throwaway `./receipt-smoke.tmp.mjs` at repo root,
deleted before committing): `npm install --no-save playwright` at the repo
root works too and skips the nested `npm init`. Either way, **Node's ESM
resolver walks up from the *script's own file location*, not `cwd`** — a
script saved under the scratchpad temp dir can't see a `playwright` installed
in the repo's `node_modules` (`ERR_MODULE_NOT_FOUND`) even when you `cd` into
the repo first. Keep the script and the `node_modules` it needs in the same
directory tree, one way or the other.

For server-only branches (invalid table id, closed venue), plain `curl` on
`/order?table=...` and grepping the response body is enough — no browser
needed since nothing client-side is being exercised.

## Drive it — staff/admin flow (login → dashboard → order actions)

Same throwaway-Playwright setup as above. Sequence that reliably gets you
from a cold login to a manipulable order:

```
goto /login → fill #password → click button[type=submit] → waitForURL /dashboard
goto /order/new → click the "Counter" link/button → click .menu-item-button (not disabled)
click .cart-rail__toggle (same collapse gotcha as the customer flow)
click .cart-summary__submit → click .review-modal__confirm → waitForLoadState('networkidle')
goto /dashboard
```

Two more gotchas specific to this flow:
- **The dashboard can show more than one order card** (a prior smoke-test run's
  order, other Pending orders). `.order-card` alone with `.first()` is a race —
  scope by badge text instead: `page.locator('.order-card', { hasText: 'UNPAID' })`.
- **`OrderDetailModal` renders `Receipt` (Story 22+) as an always-mounted,
  visually-hidden sibling with the same text** (order number, item lines,
  totals) as the modal's own read-only view. Plain `page.getByText(...)`
  queries can match both and throw "multiple elements found." Scope to
  `page.getByRole('dialog')` first: `within(dialog).getByText(...)` (or the
  Playwright-native `dialog.getByText(...)`).

## Verifying print-only CSS (`@media print`)

jsdom/Vitest never renders `@media print` — a passing unit test proves nothing
about how print output actually looks. The only way to see it without a
physical printer is Playwright's print-media emulation plus a screenshot:

```js
await page.emulateMedia({ media: 'print' })
await page.screenshot({ path: 'print-preview.png', fullPage: true })
await page.emulateMedia({ media: 'screen' }) // restore before further interaction
```

**Known trap:** the standard "print only this element" CSS pattern
(`body * { visibility: hidden } .target, .target * { visibility: visible }`)
hides all *content* but does not clear a painted ancestor `background` — `body`
itself is never targeted by that selector, so a dark app theme bleeds through
as unreadable text-on-dark-background in the screenshot. Explicitly set
`background: #fff` on `html`, `body`, and the printed element itself inside
the `@media print` block; don't assume "no background set" means white.

## Teardown

```bash
docker compose down   # DB is ephemeral (tmpfs) — nothing to preserve; `stop` also fine
```
