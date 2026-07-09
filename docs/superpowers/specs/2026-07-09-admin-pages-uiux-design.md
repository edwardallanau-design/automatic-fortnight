# Real UI/UX for Login, Table Setup, Menu Management — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: cross-cutting (Auth + Menu + Ordering admin surfaces) · Backlog item: "Real UI/UX for Login, Table Setup, and Menu Management" (`07-epic-map.md`, removed from that file's Backlog list once this ships). Post-epic, user-directed.

**Motivation.** `app/login/page.tsx`, `app/admin/tables/page.tsx`, and `app/admin/menu-items/page.tsx` are still functional-only markup — unstyled `<h1>`/`<ul>`/plain `<input>`, no `className`s, no design-token usage — while the rest of the app (customer ordering flow, staff dashboard, the global `StaffBar`) follows the established café-ticket visual language (Fraunces/Inter/JetBrains Mono, the `--espresso`/`--crema`/`--copper` palette). This closes that gap.

**Scope.** Touches `app/login/page.tsx`, `app/admin/tables/page.tsx`, `app/admin/tables/CreateTableForm.tsx`, `app/admin/menu-items/page.tsx`, `app/admin/menu-items/CreateMenuItemForm.tsx`, `app/admin/menu-items/MenuItemRow.tsx`, and `app/globals.css` (new page-scoped class blocks only). One behavior addition: Menu Management rows gain an edit-toggle (read-only by default, Edit reveals inputs) and Archive gains a confirm step via the existing `ConfirmDialog`. No other logic, API routes, services, or domain rules change.

## Decisions

### 1. Foundations — reuse everything, invent nothing

- All styling stays in `globals.css` as plain page-scoped BEM classes, matching the rest of the codebase (no CSS Modules, no Tailwind, no new shared utility layer). New blocks are appended following the file's existing section-comment structure.
- Only existing design tokens are used: `--espresso` / `--crema` / `--paper` / `--copper` / `--copper-bright` / `--sage` / `--clay` / `--clay-faint` / `--danger`, and the three font vars (`--font-display` Fraunces italic, `--font-body` Inter, `--font-mono` JetBrains Mono). No new colors or fonts. Dark mode is free — the tokens already flip under `prefers-color-scheme: dark`.
- Existing conventions carry over: 44px minimum touch targets, copper `:focus-visible` outlines, `role="alert"` error text in `--danger`, and `@media (prefers-reduced-motion: reduce)` guards on any new animation.
- Existing `useState`/handler/`router.refresh()` logic in all three pages' components stays byte-identical except where Decision 4 below calls for a change.

### 2. Login — centered ticket-stub card

`app/login/page.tsx` renders `.login-page` (full-height flex-centered, `--crema` background) containing a `.login-card`: `--paper` background, `--clay-faint` border, `border-top: 3px solid var(--copper)` (echoes the ticket-stub / order-header motif used elsewhere), soft shadow (`box-shadow: 0 8px 24px var(--clay-faint)`, matching `.review-modal`), max-width ~360px.

Inside the card: a mono uppercase eyebrow ("Staff Access"), a Fraunces-italic title ("Welcome back"), a labelled password field styled like `.review-modal__name-input`, a full-width copper submit button styled like `.cart-summary__submit`, and the error line (`role="alert"`, `--danger`) below the button when present.

This page has no `StaffBar` (pre-auth, no session) and no dark header banner — the centered card is the whole page, deliberately lighter-weight than the admin pages below since it's a single-field screen.

### 3. Table Setup & Menu Management — shared admin chrome

Both pages adopt the same stacked structure the dashboard already uses (`StaffBar` strip, already global via `app/layout.tsx` → dark header banner → content on `--crema`):

- **`.admin-header`** — `--espresso` banner, `border-bottom: 3px solid var(--copper)`, mono eyebrow ("Admin") + Fraunces-italic page title. Mirrors `.staff-header`.
- **`.admin-panel`** — the create form (`CreateTableForm` / `CreateMenuItemForm`) in a `--paper` card: labelled inputs styled like `.review-modal__name-input`, a copper primary submit button, `role="alert"` error text. Menu Management's panel stays admin-only (`isAdmin` gate unchanged).
- **`.admin-empty`** — empty state shown when the list is empty ("No tables yet — add one above." / "No menu items yet — add one above.").

**Table Setup list** (`app/admin/tables/page.tsx`) → `.table-grid` of `.table-qr-card` cards (`--paper` background, `--clay-faint` border): "Table N" heading (Fraunces), centered QR image, and the order URL rendered as selectable mono text below it. Copy-to-clipboard is explicitly **not** added — it would require converting a server-rendered list item into a client component for one convenience button; out of scope for a styling pass.

**Menu Management list** (`app/admin/menu-items/page.tsx`, `MenuItemRow.tsx`) → `.menu-admin-row` cards, per Decision 4 below.

### 4. Menu Management rows — edit-toggle behavior change

`MenuItemRow` gains local `isEditing` state (`useState(false)`), defaulting to read-only for every row on mount and after any successful save:

- **Read-only state** (default, both roles): `.menu-admin-row` shows name · mono price · an availability badge, reusing the existing `.order-card__badge` / `.order-card__badge--paid` pill styling (copper "Available", muted "Sold out"). Admin rows additionally render an **Edit** button; staff rows (view-only, `editable=false`) render no controls, matching today's behavior.
- **Editing state** (admin only, entered via Edit): swaps in the existing styled name/price inputs and availability checkbox, plus **Save**, **Cancel**, and **Archive** buttons. Each row's `isEditing` is independent local state — no cross-row coordination, consistent with how the dashboard's per-order modals don't coordinate with each other either.
  - **Save** — existing `handleSave` logic (`PATCH /api/menu-items/:id`, then `router.refresh()`) is unchanged, with one addition: on success, also set `isEditing` to `false`. Without this, the row would stay in editing state after refresh, since `router.refresh()` re-renders with new server props but doesn't remount the component (no key change) or reset local state.
  - **Cancel** — resets `editName` / `editPrice` / `editAvailable` back to the row's current props and sets `isEditing` to `false`. No confirmation needed (non-destructive, discards only in-progress unsaved edits), matching how `.review-modal__back` requires no confirmation today.
  - **Archive** — routes through the existing `ConfirmDialog` component (`app/components/ConfirmDialog.tsx`, already used for order cancel/remove) instead of firing `handleArchive` directly on click: "Archive *{name}*? It'll be hidden from the menu." / confirm label "Archive", using the `confirm-dialog__confirm` danger styling. Follows the same `exiting`-state open/close pattern already established for the order-flow confirm dialogs. This is the one intentional UX fix bundled into this branch — today's Archive is a single irreversible-looking click with no confirmation step.

## Testing

Per `06b-engineering-decisions.md` §7 (Vitest, no new e2e path needed):

- Existing tests for these three pages/components query by role/label/text, not by className — the restyle itself should not require test changes; run the full suite to confirm.
- `MenuItemRow`: new test that Edit reveals the input controls (previously always visible, now gated), Cancel reverts uncommitted edits and returns to read-only without calling the API, and Archive opens `ConfirmDialog` and only calls `apiClient.del` after the dialog is confirmed (not on the initial Archive click) — using `fireEvent` per this repo's documented fake-timer/`user-event` hang (`BUILD_STATUS.md` gotchas log).
- Login: existing submit/error-state tests are unaffected by the markup/class change; no new test needed since no logic changed.

## Scope boundary — do NOT touch

Order flow (`app/order/**`), staff dashboard (`app/dashboard/**`), `StaffBar`/`StaffBarGate`, any API route, `lib/menuService.ts`, `lib/tableService.ts`, `lib/authGuard.ts`, or any domain invariant. No new npm dependencies. No copy-to-clipboard control on Table Setup (noted above as a deliberate hold). Menu Management's create form and validation rules are unchanged — only its visual presentation changes.

## Tracking

New Story 15 row in `BUILD_STATUS.md` (`Backlog → Building → Done`), and removal of this item from `07-epic-map.md`'s Backlog list once shipped. Work happens on a branch cut from `dev`, PR back into `dev` per the deployment pipeline in `CLAUDE.md`.
