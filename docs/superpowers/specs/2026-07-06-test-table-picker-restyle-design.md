# Test Table Picker — Café Restyle — Design

**Status.** Approved for implementation.
**Epic.** Digital Ordering Core Loop · Internal tooling (follow-up to the test-table picker).
**Related docs.** `docs/superpowers/specs/2026-07-06-test-table-picker-design.md` (the picker it restyles), `app/globals.css` (the design system it reuses).

---

## Context

The `/order/test` picker built earlier works but is unstyled plain HTML (`<h1>` + a bare `<ul>` of links). It clashes with the rest of the app, which has a distinctive café identity defined in `app/globals.css`: an espresso/crema/copper/clay palette, a serif-italic display face (`--font-display`), a mono utility face for eyebrows and data (`--font-mono`), warm paper cards, and ticket-stub confirmations.

This change is styling only. It dresses the picker in the existing café tokens so it reads as the staff/QA entrance to the same product a customer sees — without inventing any new palette, typeface, or interaction. Confirmed with the user: no dropdown (direct one-tap links are fewer clicks than a dropdown for the handful of tables a QA tool deals with), keep it minimal (just pick a table and go, no extra features).

## Decisions

- **Reuse existing patterns, add zero new tokens.** The header reuses the `.order-header` treatment (mono uppercase eyebrow + serif-italic title over an espresso bar with a copper underline). Each table reuses the `.menu-item-button` card idiom (warm `--paper` background, `--clay-faint` border, `--copper` hover, 44px min tap target, `--copper` focus ring). All colors come from the existing `:root` custom properties; all fonts from the existing `--font-display`/`--font-mono`/`--font-body` variables. No new hex values, no new font imports.
- **Interaction unchanged.** Each table stays a plain `next/link` to `/order?table=<id>` — one tap = go, exactly as before. No dropdown, no select, no client component, no JS. The restyle is CSS classes plus one footnote line.
- **New CSS lives in a `.table-picker` BEM block** appended to `app/globals.css`, following the same naming convention as the existing `.order-*`, `.menu-*`, `.cart-*`, `.ticket__*`, and `.staff-*` blocks in that file. Scoped class names (`.table-picker`, `.table-picker__row`, etc.) so no selector collides with existing blocks.
- **Copy sets expectations.** A mono footnote — "Dev only — customers reach tables by scanning the QR code." — tells a dev landing on the page what it is. The empty state points to where tables are created rather than dead-ending.
- **Behavior gates untouched.** The `process.env.NODE_ENV === 'production'` short-circuit, the `listTables()` reuse, and the production `role="alert"` "not available" message all stay exactly as built — only their class names / surrounding markup change so they inherit the themed page.

## Components

1. **`app/order/test/page.tsx` (modify).**
   - Production branch: keep the early return and its `role="alert"` message; render it inside the themed `.table-picker` shell (so the page background/typography match) rather than the current bare `.order-page` wrapper. Message copy unchanged: "This page isn't available."
   - Non-production branch:
     - A header block reusing the `.order-header` structure: eyebrow `QA · Table picker`, title `Choose a table`.
     - Populated: a `<ul>` where each `<li>` is a `next/link` to `/order?table=${table.id}`, styled as a `.table-picker__row` card showing `Table {number}` on the left and a `→` chevron on the right.
     - Empty (`tables.length === 0`): a message — "No tables yet. Create one in Table setup." — where "Table setup" links to `/admin/tables`.
     - A mono footnote: "Dev only — customers reach tables by scanning the QR code."
   - No change to imports beyond what's needed (`Link` already imported; `listTables` already imported).

2. **`app/globals.css` (modify — append only).**
   - A new `/* Test table picker (dev/QA) */` section with a `.table-picker` block: page shell (crema bg, espresso text, min-height, bottom padding), reused-header styles if not directly reusing `.order-header` classes, `.table-picker__list`, `.table-picker__row` (the card), `.table-picker__row-label`, `.table-picker__chevron`, `.table-picker__footnote`, and `.table-picker__empty`.
   - Includes `:hover`, `:focus-visible` (copper outline, matching `.menu-item-button`), and respects the existing dark-mode custom-property overrides automatically (all colors are tokens, which already flip in the `prefers-color-scheme: dark` block).
   - Append only — does not edit or reorder any existing rule.

## Data flow

Unchanged from the original picker:

```
/order/test → NODE_ENV === production? ──yes──> themed "not available" message
                    │ no
                    ▼
              listTables()  (existing, unchanged)
                    │
              render themed list → each row links to /order?table=<id>
                    │
              tester taps a row → existing /order?table=<id> flow (unmodified)
```

## Error / empty handling

| Scenario | Result |
|---|---|
| Visited in production | Themed page with `role="alert"` "This page isn't available." message, no table data |
| No tables exist | Themed empty state: "No tables yet. Create one in Table setup." with a link to `/admin/tables` |
| Tables exist | Themed list of table cards, each linking to its `/order?table=<id>` |

## Testing

The 3 existing tests in `app/order/test/page.test.tsx` assert behavior that does not change (production message + `listTables` not called; one link per table with correct `href` and `Table {number}` label; empty-state message). They must continue to pass. Class-name additions don't affect `getByRole('link')` / `getByText` queries.

- Update the empty-state test's expected text to the new copy ("No tables yet. Create one in Table setup.") and assert the "Table setup" link points to `/admin/tables`.
- No new test files. This is a styling change; the behavioral contract is already covered.

## Scope boundary (do NOT touch)

- `lib/tableService.ts`, `app/order/page.tsx`, `app/order/Cart.tsx`, `app/admin/tables/page.tsx`, the `Table` model — none change.
- The `NODE_ENV` gate, `listTables()` reuse, and link targets — behavior-identical.
- No existing CSS rule is edited or reordered; the new block is appended.

## Acceptance criteria

- [ ] `/order/test` (outside production) renders with the café theme: espresso header bar with mono eyebrow + serif-italic title, warm crema body, table rows styled as paper cards with copper hover/focus.
- [ ] Each table row is still a one-tap link to `/order?table=<id>` labeled `Table {number}`. No dropdown, no added interaction step.
- [ ] Empty state shows themed guidance linking to `/admin/tables`.
- [ ] Production still shows the `role="alert"` "not available" message, now themed.
- [ ] All colors and fonts come from existing tokens; no new hex/font added. Dark mode works via the existing custom-property overrides.
- [ ] The 3 existing tests pass (empty-state copy/link assertion updated).
