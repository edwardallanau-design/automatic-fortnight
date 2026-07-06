# Test Table Picker Café Restyle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing `/order/test` table picker to match the app's café design system (espresso/copper/crema palette, serif-italic display face, mono utility face) — reusing existing `globals.css` idioms, adding no new tokens, and changing no behavior.

**Architecture:** Two-file change: (1) `app/order/test/page.tsx` gets themed markup (a header block reusing the `.order-header` treatment, table rows styled as paper cards, a footnote, and an updated empty state), and (2) `app/globals.css` gets an appended `.table-picker` BEM block using only existing custom properties. The `NODE_ENV` gate, `listTables()` reuse, and `/order?table=<id>` links are behavior-identical. No new components, no client JS, no dropdown.

**Tech Stack:** Next.js App Router (Server Component), `next/link`, plain CSS with existing custom properties, Vitest + Testing Library.

## Global Constraints

- **No new design tokens.** Every color must be an existing `var(--...)` from `app/globals.css` `:root` (`--espresso`, `--crema`, `--paper`, `--copper`, `--copper-bright`, `--clay`, `--clay-faint`, `--sage`). Every font must be an existing `var(--font-display)` / `var(--font-mono)` / `var(--font-body)`. No new hex values, no new `@font` imports.
- **Behavior unchanged.** Keep the `process.env.NODE_ENV === 'production'` early-return short-circuit (must run before `listTables()`), keep `role="alert"` on the production message, keep each table as a plain `next/link` to `/order?table=${table.id}` labeled `Table {number}`. No dropdown / select / client component.
- **Accessible name must stay clean.** The decorative `→` chevron in each row must be `aria-hidden="true"` (or in an `aria-hidden` span) so the link's accessible name remains exactly `Table {number}` — the existing test queries `getByRole('link', { name: 'Table 1' })`.
- **CSS is append-only.** Add a new `/* Test table picker (dev/QA) */` block at the end of `app/globals.css`. Do not edit or reorder any existing rule. Use scoped `.table-picker*` class names that collide with nothing already in the file.
- **Do not touch:** `lib/tableService.ts`, `app/order/page.tsx`, `app/order/Cart.tsx`, `app/admin/tables/page.tsx`, the `Table` Prisma model.

---

### Task 1: Themed markup + CSS for the picker

**Files:**
- Modify: `app/order/test/page.tsx` (currently 32 lines — full replacement given below)
- Modify: `app/globals.css` (append a new block at end of file)
- Test: `app/order/test/page.test.tsx` (update one existing test's expected copy)

**Interfaces:**
- Consumes: `listTables(): Promise<Table[]>` from `@/lib/tableService` (unchanged; `Table` has `id: string`, `number: number`, `createdAt: Date`), and `Link` from `next/link`.
- Produces: nothing consumed by other tasks — this is the only task.

- [ ] **Step 1: Update the empty-state test to the new copy and assert the setup link**

In `app/order/test/page.test.tsx`, replace the entire third test (the `'shows an empty-state message when there are no tables'` block, lines 47–55) with:

```tsx
  it('shows an empty-state message with a link to table setup when there are no tables', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.mocked(listTables).mockResolvedValue([])

    const ui = await TestTablePage()
    render(ui)

    expect(screen.getByText(/No tables yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table setup' })).toHaveAttribute(
      'href',
      '/admin/tables',
    )
  })
```

Leave the first two tests (production message; one link per table with correct href/label) unchanged — the restyle must not break them.

- [ ] **Step 2: Run the test file to verify the updated empty-state test fails**

Run: `npx vitest run app/order/test/page.test.tsx`
Expected: FAIL — the empty-state test fails because the current page renders "No tables have been created yet." and has no "Table setup" link. The other two tests still PASS.

- [ ] **Step 3: Replace the page with themed markup**

Replace the entire contents of `app/order/test/page.tsx` with:

```tsx
import Link from 'next/link'
import { listTables } from '@/lib/tableService'

export default async function TestTablePage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="table-picker">
        <p role="alert" className="order-page__error">
          This page isn&apos;t available.
        </p>
      </main>
    )
  }

  const tables = await listTables()

  return (
    <main className="table-picker">
      <header className="order-header">
        <span className="order-header__eyebrow">QA · Table picker</span>
        <h1 className="order-header__title">Choose a table</h1>
      </header>

      {tables.length === 0 ? (
        <p className="table-picker__empty">
          No tables yet. Create one in <Link href="/admin/tables">Table setup</Link>.
        </p>
      ) : (
        <ul className="table-picker__list">
          {tables.map((table) => (
            <li key={table.id}>
              <Link className="table-picker__row" href={`/order?table=${table.id}`}>
                <span className="table-picker__row-label">Table {table.number}</span>
                <span className="table-picker__chevron" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="table-picker__footnote">
        Dev only — customers reach tables by scanning the QR code.
      </p>
    </main>
  )
}
```

Note: the chevron span carries `aria-hidden="true"`, so the link's accessible name stays `Table {number}` and the existing `getByRole('link', { name: 'Table 1' })` test keeps passing.

- [ ] **Step 4: Append the themed CSS block to `app/globals.css`**

Append this at the very end of `app/globals.css` (after the last existing rule — do not edit anything above it):

```css
/* Test table picker (dev/QA) */

.table-picker {
  min-height: 100%;
  width: 100%;
  background: var(--crema);
  color: var(--espresso);
  font-family: var(--font-body), Arial, Helvetica, sans-serif;
  padding-bottom: 3rem;
}

.table-picker__list {
  list-style: none;
  width: 100%;
  max-width: 480px;
  margin: 1.25rem auto 0;
  padding: 0 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.table-picker__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0.85rem 1rem;
  border: 1px solid var(--clay-faint);
  border-radius: 10px;
  background: var(--paper);
  color: var(--espresso);
  font-family: var(--font-body), Arial, sans-serif;
  font-size: 1rem;
  transition: border-color 0.15s ease, transform 0.1s ease;
}

.table-picker__row:hover {
  border-color: var(--copper);
}

.table-picker__row:active {
  transform: scale(0.99);
}

.table-picker__row:focus-visible {
  outline: 2px solid var(--copper);
  outline-offset: 2px;
}

.table-picker__row-label {
  font-weight: 500;
}

.table-picker__chevron {
  font-family: var(--font-mono), monospace;
  color: var(--copper);
  margin-left: 1rem;
}

.table-picker__empty {
  max-width: 480px;
  margin: 2.5rem auto 0;
  padding: 0 1.25rem;
  text-align: center;
  color: var(--clay);
}

.table-picker__empty a {
  color: var(--copper);
  text-decoration: underline;
}

.table-picker__footnote {
  max-width: 480px;
  margin: 1.75rem auto 0;
  padding: 0 1.25rem;
  text-align: center;
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--clay);
}
```

Every color and font above is an existing custom property; dark mode flips automatically via the existing `prefers-color-scheme: dark` overrides for `--crema`, `--paper`, `--espresso`, `--clay`, and `--clay-faint`.

- [ ] **Step 5: Run the test file to verify all tests pass**

Run: `npx vitest run app/order/test/page.test.tsx`
Expected: PASS (3/3) — production message + `listTables` not called; one link per table with clean accessible name and correct href; empty-state with new copy and `/admin/tables` link.

- [ ] **Step 6: Manually verify the theme in dev**

Run: `npm run dev`, then visit `http://localhost:3000/order/test`.
Expected: an espresso header bar with a copper underline, a mono uppercase "QA · TABLE PICKER" eyebrow and a serif-italic "Choose a table" title, a warm crema body with paper table cards that highlight copper on hover, a copper `→` on each row, and a small mono footnote. Clicking a row still loads `/order?table=<id>`. Toggle your OS to dark mode and confirm the page darkens (crema/paper/espresso invert via existing tokens).

- [ ] **Step 7: Commit**

```bash
git add app/order/test/page.tsx app/globals.css app/order/test/page.test.tsx
git commit -m "feat: café-theme the /order/test table picker"
```

## Spec Coverage Check

- "Café theme: espresso header, mono eyebrow + serif-italic title, crema body, paper cards with copper hover/focus" → Task 1, Steps 3–4 (markup reuses `.order-header`; `.table-picker__row` mirrors `.menu-item-button`).
- "Each row still a one-tap link labeled `Table {number}`, no dropdown" → Task 1, Step 3 (plain `next/link`, chevron `aria-hidden`), verified by the unchanged link test in Step 5.
- "Empty state shows themed guidance linking to `/admin/tables`" → Task 1, Steps 1 & 3, verified by the updated test.
- "Production still shows `role="alert"` 'not available', now themed" → Task 1, Step 3 (message kept inside `.table-picker` shell), verified by the unchanged production test.
- "All colors/fonts from existing tokens; dark mode works" → Task 1, Step 4 (tokens only) + Step 6 (manual dark-mode check).
- "3 existing tests pass, empty-state copy/link updated" → Task 1, Steps 1, 2, 5.
- "Append-only CSS, no existing rule edited; behavior gates untouched; do-not-touch files respected" → Global Constraints; satisfied by construction (only 3 files in the commit, CSS appended).
