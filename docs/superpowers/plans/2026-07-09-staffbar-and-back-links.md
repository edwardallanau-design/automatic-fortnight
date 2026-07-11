# StaffBar Redesign & Back-Links as Buttons (Story 16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the global `StaffBar`'s expanded state (integrated dark toolbar) and collapsed state (hairline + animated arrow tab), and restyle `.order-header__back` as a filled button matching `.staff-header__new-order`.

> **Correction (post-implementation, caught in the final whole-branch review):** this plan and its spec were written assuming `.order-header__back` had 5 call sites. That was already stale — Story 14 had already replaced the 4 staff "← Dashboard" links with the global `StaffBar`'s own nav links before this plan was written. Only 1 real usage exists (the customer "← Menu" link, `app/order/[id]/page.tsx`). Task 1 below was executed as a CSS-only change, which was correct regardless of the usage count — the "5 pages" language throughout this plan is inaccurate but did not affect what was actually built or tested. See `docs/superpowers/specs/2026-07-09-staffbar-and-back-links-design.md`'s Decision 3 for the full correction.

**Architecture:** Pure presentational change to one shared component (`StaffBar.tsx`) and one shared CSS class (`.order-header__back`) consumed by 5 pages. The `collapsed` boolean + `localStorage` persistence logic in `StaffBar.tsx` is untouched — only its two rendered states change.

**Tech Stack:** Next.js App Router, React 19, plain CSS in `app/globals.css`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-09-staffbar-and-back-links-design.md`
**Validated mockups:** `.superpowers/brainstorm/1557-1783567565/content/staffbar-options.html`, `staffbar-collapsed-v2.html`

## Global Constraints

- Only these existing CSS custom properties may be used: `--espresso`, `--crema`, `--paper`, `--copper`, `--copper-bright`, `--sage`, `--clay`, `--clay-faint`, `--danger`. No new colors, except the Log out accent (`#e8a05a`) which the spec leaves as an approximate warm accent — implement it as a new local value since it isn't one of this app's token roles (not danger, not copper); do not add it as a new global CSS variable.
- Only existing font vars (`--font-mono` for all StaffBar text).
- No new npm dependencies.
- All interactive elements: `min-height: 44px` (or `min-width` for icon-only controls) — this already holds for the collapsed tab per its existing `min-width`/`min-height`.
- All focus-visible states: `outline: 2px solid var(--copper-bright); outline-offset: 2px;` (or `outline: none` + color-only change, matching this component's existing convention for `.staff-bar__action`/`.staff-bar__collapse`).
- The bounce animation must be wrapped in `@media (prefers-reduced-motion: reduce)` with the animation disabled.
- No change to `collapsed` state logic, `localStorage` key (`staffBarCollapsed`), `showDashboardLink`/`showMenuManagementLink`/`showTableSetupLink` visibility logic, or the logout handler — markup/class only, except the collapsed branch's JSX structure (Task 3).
- Both aria-labels (`"Hide staff bar"`, `"Show staff bar"`) must be preserved exactly — existing tests assert on them.
- Do not touch `StaffBarGate.tsx`, `lib/authGuard.ts`, or any API route.

---

### Task 1: Back-links as buttons

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks (independent of StaffBar work).

- [ ] **Step 1: Replace the `.order-header__back` rule block**

In `app/globals.css`, find the existing block (currently around lines 107-126):

```css
.order-header__back {
  font-family: var(--font-mono), monospace;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--copper-bright);
  text-decoration: none;
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0 0.25rem;
}

.order-header__back:hover {
  text-decoration: underline;
}

.order-header__back:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}
```

Replace it with:

```css
.order-header__back {
  font-family: var(--font-body), Arial, sans-serif;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  background: var(--copper-bright);
  color: var(--espresso);
  font-weight: 700;
  font-size: 0.9rem;
  text-decoration: none;
  transition: transform 0.1s ease, background-color 0.1s ease;
}

.order-header__back:hover {
  background: var(--copper);
  text-decoration: none;
}

.order-header__back:active {
  transform: scale(0.97);
}

.order-header__back:focus-visible {
  outline: 2px solid var(--copper-bright);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .order-header__back:active {
    transform: none;
  }
}
```

No `.tsx` changes are needed — all 5 usages (`app/order/[id]/page.tsx`, `app/order/page.tsx`, `app/order/new/page.tsx`, `app/admin/menu-items/page.tsx`, `app/admin/tables/page.tsx`) already reference `className="order-header__back"` and only need the CSS to change.

- [ ] **Step 2: Run the tests for all 5 pages that render this link, to confirm no regression**

Run: `npx vitest run app/order/page.test.tsx "app/order/[id]/page.test.tsx" app/order/new/page.test.tsx app/admin/menu-items/page.test.tsx app/admin/tables/page.test.tsx`
Expected: PASS — these tests query the link by `role`/`text`/`href`, none of which depend on the class's visual styling.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: restyle order-header back-links as buttons"
```

---

### Task 2: StaffBar expanded state — integrated dark toolbar

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: restyled `.staff-strip`, `.staff-bar*` classes — consumed structurally (not visually) by Task 3, which adds the collapsed-state sibling rules.

- [ ] **Step 1: Replace the expanded-state `.staff-strip`/`.staff-bar*` rules**

In `app/globals.css`, find the existing "Staff bar" section (currently starting around line 1785) and replace **only these rules** — `.staff-strip`, `.staff-bar`, `.staff-bar__role`, `.staff-bar__dot`, `.staff-bar__actions`, `.staff-bar__action`, `.staff-bar__action:hover, .staff-bar__action:focus-visible`, `.staff-bar__sep`, `.staff-bar__logout:disabled`, `.staff-bar__collapse`, `.staff-bar__collapse:hover, .staff-bar__collapse:focus-visible` — with:

```css
/* Staff bar (session chrome: role, dashboard link, logout) — integrated dark toolbar */

.staff-strip {
  background: var(--espresso);
  color: var(--crema);
}

.staff-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  padding: 0.5rem 1.25rem;
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.staff-bar__role {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--crema);
  opacity: 0.85;
  text-transform: uppercase;
}

.staff-bar__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sage);
  flex-shrink: 0;
}

.staff-bar__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.staff-bar__action {
  color: var(--crema);
  opacity: 0.85;
  font-weight: 600;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  letter-spacing: inherit;
  text-transform: uppercase;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

.staff-bar__action:hover,
.staff-bar__action:focus-visible {
  color: var(--copper-bright);
  opacity: 1;
  outline: none;
}

.staff-bar__sep {
  color: var(--clay);
}

.staff-bar__logout {
  color: #e8a05a;
  opacity: 1;
}

.staff-bar__logout:hover,
.staff-bar__logout:focus-visible {
  color: #f0b578;
}

.staff-bar__logout:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.staff-bar__collapse {
  background: none;
  border: none;
  color: var(--crema);
  opacity: 0.7;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  min-height: 44px;
  min-width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.staff-bar__collapse:hover,
.staff-bar__collapse:focus-visible {
  color: var(--copper-bright);
  opacity: 1;
  outline: none;
}
```

Leave the remaining rules (`.staff-strip--collapsed`, `.staff-bar__toggle`) in place for now — Task 3 replaces those.

- [ ] **Step 2: Run `StaffBar.test.tsx` to confirm no regression**

Run: `npx vitest run app/components/StaffBar.test.tsx`
Expected: PASS (all existing tests) — every assertion queries by `role`/`text`/`href`/`aria-label`, none of which depend on the visual styling changed here.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: redesign StaffBar's expanded state as an integrated dark toolbar"
```

---

### Task 3: StaffBar collapsed state — hairline + animated arrow tab

**Files:**
- Modify: `app/globals.css`
- Modify: `app/components/StaffBar.tsx`

**Interfaces:**
- Consumes: `.staff-strip` (restyled in Task 2 — this task only touches the collapsed-state rules, which sit alongside it).
- Produces: nothing consumed by later tasks (final task in this plan).

- [ ] **Step 1: Replace the collapsed-state CSS rules**

In `app/globals.css`, find and replace `.staff-strip--collapsed` and `.staff-bar__toggle` (previously left in place by Task 2) with:

```css
/* Collapsed state: hairline + animated corner tab */

.staff-strip--collapsed {
  background: none;
  position: relative;
  height: 0;
}

.staff-strip__hairline {
  height: 3px;
  background: var(--copper);
}

.staff-bar__toggle {
  position: absolute;
  top: 0;
  right: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 32px;
  padding: 0.3rem 0.6rem;
  background: var(--espresso);
  color: var(--copper-bright);
  border: none;
  border-radius: 0 0 6px 6px;
  box-shadow: 0 2px 6px var(--clay-faint);
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  animation: staff-bar-toggle-bounce 1.4s ease-in-out infinite;
}

.staff-bar__toggle:hover,
.staff-bar__toggle:focus-visible {
  color: var(--crema);
  outline: none;
}

@keyframes staff-bar-toggle-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .staff-bar__toggle {
    animation: none;
  }
}
```

- [ ] **Step 2: Update the collapsed-state markup in `StaffBar.tsx`**

In `app/components/StaffBar.tsx`, find the `if (collapsed) { ... }` block:

```tsx
  if (collapsed) {
    return (
      <div className="staff-strip staff-strip--collapsed">
        <button type="button" className="staff-bar__toggle" onClick={toggleCollapsed} aria-label="Show staff bar">
          <span className="staff-bar__dot" aria-hidden="true" />
          Staff
        </button>
      </div>
    )
  }
```

Replace it with:

```tsx
  if (collapsed) {
    return (
      <div className="staff-strip staff-strip--collapsed">
        <div className="staff-strip__hairline" aria-hidden="true" />
        <button type="button" className="staff-bar__toggle" onClick={toggleCollapsed} aria-label="Show staff bar">
          ▾
        </button>
      </div>
    )
  }
```

The `aria-label="Show staff bar"` is unchanged, so the button's accessible name is unchanged even though its visible content is now just the arrow glyph.

- [ ] **Step 3: Run `StaffBar.test.tsx` to confirm the collapse/expand and persistence tests still pass**

Run: `npx vitest run app/components/StaffBar.test.tsx`
Expected: PASS (all existing tests, including `'collapses to a reopen control...'` and `'persists the collapsed state across remounts...'`) — both query the toggle by `getByRole('button', { name: 'Show staff bar' })`, which still resolves via the unchanged `aria-label`.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/components/StaffBar.tsx
git commit -m "feat: redesign StaffBar's collapsed state as a hairline + animated arrow tab"
```

---

### Task 4: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file in the repo.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: PASS, no new warnings/errors.

- [ ] **Step 3: Manual visual check (Docker dev loop)**

Run: `docker compose up --build`

Visit as staff/admin (check `docker/entrypoint.sh` seed output for credentials):
- `http://localhost:3001/dashboard` — confirm the StaffBar reads as an integrated dark toolbar sitting flush above the dashboard's own dark header, with Log out visually set apart from the nav links.
- Click "Hide staff bar" — confirm the bar collapses to a thin copper hairline with a bouncing arrow tab in the top-right corner, and that the tab's motion is noticeable without being distracting.
- Reload the page — confirm the collapsed preference persisted.
- Click the arrow tab — confirm the bar re-expands.
- In OS/browser settings, enable "reduce motion" and reload — confirm the arrow tab is present but static (no bounce).
- Visit `/order/[id]` for an existing order — confirm "← Menu" now renders as a filled button. Visit a staff-facing page with "← Dashboard" (e.g. `/order/new`) — confirm it also renders as a filled button.

This step has no pass/fail command output — confirm visually and note any issue before proceeding.

- [ ] **Step 4: Update `BUILD_STATUS.md`**

In `BUILD_STATUS.md`, change Story 16's status cell from `Building` to `Done`.

- [ ] **Step 5: Commit**

```bash
git add BUILD_STATUS.md
git commit -m "docs: mark Story 16 (StaffBar redesign + back-links) done"
```
