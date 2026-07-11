# Admin UI branch-context redesign — Design

**Date.** 2026-07-11
**Source.** Follow-up UI/UX polish pass on Story 20 (multi-branch admin UX; Plans 1–3 shipped, marked Done in `BUILD_STATUS.md`). The epic map already flagged the dashboard's branch tab strip as a known gap (`docs/design/07-epic-map.md:118`); this design folds that in alongside three more issues raised in review: the Branches page row mixes inconsistent alignment idioms, the venue-wide vs. per-branch "accepting orders" toggle is duplicated across two pages, and the Menu Management/Table Setup branch `<select>` doesn't carry the app's paper/crema/copper palette (falls back to native OS chrome). All layout decisions below were validated interactively via the brainstorming visual companion; mockups persisted at `.superpowers/brainstorm/1620-1783743583/content/` (`header-layout.html`, `mobile-header.html`, `branch-row.html`, `branch-row-v2.html`, `branch-row-v3.html`).

## Problem

1. `StaffBar` (`app/components/StaffBar.tsx`) hides a nav link entirely when you're already on that page (lines 65-70), so there's no way to see which page you're on from the toolbar itself.
2. Branch selection is implemented three separate, inconsistent ways: a tab strip on Dashboard that reuses the exact CSS class of the Pending/Confirmed status tabs (`PendingOrdersDashboard.tsx:230-254`, `.order-rail__tabs--branch` only adds a margin), and a native-chrome `<select>` (`BranchSelector.tsx`) independently duplicated on Menu Management and Table Setup.
3. `BranchRow.tsx` (`/admin/branches`) mixes three alignment idioms in one card: a `space-between` header row, a standalone unaligned "Change password" button, and a separately-aligned password-edit row.
4. Two independent "accepting orders" booleans exist — a venue-wide singleton (`/admin/settings`, the page's only content) and a per-branch one (`BranchRow.tsx:101-113`) — with no visual distinction between "the whole venue is closed" and "this one branch is closed."
5. `BranchSelector`'s `<select>` (`.branch-selector__select`, `globals.css:2714-2717`) sets no background, so it falls back to the browser's native (typically white) dropdown chrome instead of the app's `--paper`/`--crema` surfaces.

## Scope

**In scope.**
- `StaffBar`: nav links always visible, current page gets an active style instead of being hidden; new branch button + popover; mobile behavior that pins role/branch/hamburger and tucks nav+logout behind the hamburger.
- A shared, session-persistent branch selection consumed by Dashboard, Menu Management, and Table Setup, replacing each page's independent picker.
- `/admin/branches` row layout: header row (name ↔ toggle ↔ chevron) + a chevron-collapsed actions row ("Change name" / "Change password", matching styling and behavior).
- Removing `/admin/settings`, its nav link, `AcceptingOrdersToggle`, and the write path in `lib/venueSettingsService.ts`.
- Amending `INV-10` in `docs/design/02-domain-model.md` — this is a domain-model invariant change, called out explicitly per this project's stop rules, and has user sign-off (see "Domain model change" below).
- Dashboard: drop the `order-rail__tabs--branch` strip; branch scoping comes from the header; "All branches" aggregate view stays, but only reachable from Dashboard.
- Menu Management / Table Setup: drop the inline `BranchSelector`; branch scoping comes from the header; no "All" option (always exactly one concrete branch).
- Hiding the branch button/popover entirely when a venue has one branch or fewer.
- A small related fix in `lib/branchService.ts`'s `resolveBranchId` fallback (see "Related fix" below).

**Out of scope.**
- Any change to `Branch`/`OrderingPoint`/`Credential` beyond `INV-10`'s wording.
- Payment Methods page — already global (`PaymentMethod` has no `branchId`), no changes needed.
- Dropping the `VenueSettings` table/column — stays in schema, unused, to avoid a destructive migration.
- Branch deletion (deferred since Plan 2).
- The `OrderCard` branch-tag CSS duplication noted in the epic map follow-up — unrelated cleanup, separate work.

## Domain model change — `INV-10`

This is a one-way-door item per this project's CLAUDE.md (touching `02-domain-model.md`'s invariants requires asking first) — confirmed with the user before writing this section.

**Current** (`docs/design/02-domain-model.md:48`): "A new Order may be created only while **both** `VenueSettings.acceptingOrders` (global) **and** the order's branch's `acceptingOrders` are true."

**New:** "A new Order may be created only while the order's branch's `acceptingOrders` is true."

Changes required:
- `docs/design/02-domain-model.md` — reword `INV-10` (line 48) to drop the global clause; add a one-line note under "Venue Settings" (line 11) and the `VenueSettings` entity (line 30) that the flag is now vestigial: kept in the schema, no longer read anywhere, not exposed in any UI.
- `lib/orderService.ts:19-20` — remove the `getVenueSettings()` call and its `if (!settings.acceptingOrders)` check; keep the branch-level check (line 30) unchanged.
- `app/order/page.tsx:43-47` — same: drop the `getVenueSettings()` call and the `!settings.acceptingOrders` half of the `||` condition; keep `!branch.acceptingOrders`.
- Delete (nothing else references them after the two edits above): `app/admin/settings/` (page, `AcceptingOrdersToggle.tsx`, both tests), `app/api/venue-settings/route.ts` (+ test), `lib/venueSettingsService.ts` (+ test).
- `VenueSettings` Prisma model is untouched — no migration. The row becomes inert; nothing reads or writes it after this change.

## StaffBar

**Nav visibility.** Replace the `showXLink` hide-when-active pattern (`StaffBar.tsx:65-70`, 80-139) with: every link always renders; the link matching `pathname` gets a `.staff-bar__action--active` style (underline in `--copper-bright`, matching the mockup) instead of `.staff-bar__action`. Settings link is removed entirely (page no longer exists).

**Branch button (desktop).** A copper button (`.staff-bar__branch`, mirrors `.staff-bar__logout`'s positioning) rendered between the nav links and Log out, showing the selected branch's name with a `▾` chevron. Clicking opens a popover (branch list, plus an "All branches" row prepended only when `pathname === '/dashboard'`). Selecting a branch closes the popover and updates the shared selection (see next section). Rendered only when `role === 'admin'` and there are 2+ branches.

**Mobile (`max-width: 480px`, matching the one existing breakpoint already in `globals.css:1558`).** Role badge, branch button, and a new hamburger toggle stay in the primary row. Nav links and Log out move into a `.staff-bar__panel` that's closed by default and opened by the hamburger — this is a new, component-local `navPanelOpen` boolean, independent of the existing `collapsed`/`staffBarCollapsed` state (which still fully hides the whole bar down to a re-expand arrow, unchanged). Above 480px, no hamburger renders and everything lays out inline as in the desktop mockup.

**Data flow.** `StaffBarGate.tsx` becomes async and, for `role === 'admin'` sessions, calls `listBranches()` and passes a new `branches` prop to `StaffBar` (mirrors the existing pattern in `dashboard/page.tsx`/`admin/branches/page.tsx` — no new query pattern, just relocating an existing one into the gate). Staff sessions pass `branches={[]}`, exactly as `dashboard/page.tsx` does today, so the branch button never renders for staff.

## Shared branch context

Only engaged when `branches.length > 1` — single-branch venues never render the button (see "Single-branch venues" below) and nav links carry no `?branch=` at all, relying entirely on `resolveBranchId`'s fallback.

`StaffBar` owns a `selectedBranchId` client state, valued as either a concrete branch id or the literal `'all'` (the latter only meaningful on Dashboard):
- **Resolve order**, on mount and whenever `pathname` changes: (1) `?branch=` in the current URL, if present; (2) the value saved in `localStorage.getItem('selectedBranchId')`, if present and valid for the current page (`'all'` is only valid on `/dashboard` — a saved `'all'` is treated as absent on Menu Management/Table Setup); (3) page-appropriate default — `'all'` on `/dashboard`, the first branch by name (matching `listBranches`' `orderBy: { name: 'asc' }`) on Menu Management/Table Setup.
- **Sync, not just on click:** whenever the resolved value differs from the current URL's `?branch=` — including right after step (3) above resolves a default on first load — `StaffBar` calls `router.replace(`${pathname}?branch=${id}`)` so the URL, the header button's label, and the page's rendered scope never disagree. This makes "on selection" and "on mount-time default resolution" the same code path, not two.
- **Persist:** every resolved/selected value is written to `localStorage.setItem('selectedBranchId', id)`.
- **Nav links:** `StaffBar`'s Dashboard / Menu Management / Table Setup links append `?branch=${effectiveBranchId}`, where `effectiveBranchId` substitutes the first branch by name whenever `selectedBranchId === 'all'` (since `'all'` isn't valid on the two non-Dashboard routes) — so clicking from Dashboard's aggregate view into Menu Management lands on a concrete branch instead of carrying over an invalid value.

No backend change needed for this part — `resolveBranchId(session, requestedBranchId)` (`lib/branchService.ts:22-32`) already accepts an optional requested id and already enforces that staff sessions ignore it; all three pages already call it exactly this way. This was evaluated against two other approaches (cookie + server action; URL-only with no persistence) — this hybrid was chosen to reuse the existing `resolveBranchId`/`?branch=` plumbing from Story 20 Plan 2 with no new backend surface, while still surviving a page reload or new tab via the `localStorage` fallback.

## `/admin/branches` row (`BranchRow.tsx`)

Per the validated mockup (`branch-row-v3.html`):
- Header row (`.branch-row__header`, unchanged structurally): name on the left (or its rename input, unchanged), then on the right — the existing `.slider-toggle` immediately followed by a new chevron button (`.branch-row__expand`, 24×24, bordered).
- Chevron toggles a new `expanded` boolean (component-local, default `false`, independent per row — same "each row is independent" precedent the password-toggle already has today).
- When expanded: an actions row (`.branch-row__actions`, replaces today's standalone `.branch-row__password-toggle`) with two equal-weight pill buttons: **"Change name"** (renamed from "Rename" — same `renaming` state and `handleSaveName` logic, just relabeled and moved out of the header row into this row) and **"Change password"** (same `changingPassword` state/`handleSavePassword` logic as today).
- Clicking either reveals its own edit row below the actions row (dashed top divider, input + save button) — "Change name"'s edit row is new (today's rename input lives inline in the header; it moves here to match "Change password"'s existing pattern exactly), "Change password"'s edit row is the existing `.branch-row__password-form` relocated under the new divider style.

## Dashboard (`PendingOrdersDashboard.tsx`)

- Remove the `order-rail__tabs--branch` block (lines 230-254) and its `activeBranch` local state (line 35) and its setter calls.
- `activeBranch` is now derived from `StaffBar`'s shared selection via the `?branch=` search param (read with `useSearchParams`), defaulting to `'all'` when absent (preserves today's default aggregate view on first admin login).
- `branchFiltered`, `showBranchTag`, and the client-side fetch-all-then-filter behavior of `fetchTabs()` are unchanged — only the source of `activeBranch` changes, from local tab-click state to the header's selection.

## Menu Management / Table Setup

- Remove the `<BranchSelector .../>` render (`app/admin/menu-items/page.tsx:29-31`, `app/admin/tables/page.tsx:41`) and the `BranchSelector` component itself (no other consumer).
- `resolveBranchId(session, isAdmin ? requestedBranchId : undefined)` calls are unchanged — `requestedBranchId` now arrives via the header-managed `?branch=` param instead of a page-local `<select>`, but the server-side resolution logic doesn't change at all.
- `.branch-selector`/`.branch-selector__select` CSS (`globals.css:2707-2717`) is removed along with the component.

## Related fix — `resolveBranchId` fallback

`getMainBranch()` (`lib/branchService.ts:14-20`) hardcodes `where: { name: 'Main' }` as the fallback when no `requestedBranchId` is given. Today this is masked because `BranchSelector` is always rendered (even for one branch) and its `value` is always the server-resolved id, so the fallback rarely gets exercised past first load. Hiding the branch button for single-branch venues (this design) makes the fallback the *only* path for those venues — a venue that renames its sole branch away from "Main" would then hit `NotFoundError` on every page load with no way to recover via the UI (no picker to work around it). Fix: change the fallback in `resolveBranchId` to `listBranches()`'s first result (ordered by name, matching `listBranches`' existing `orderBy: { name: 'asc' }`) instead of the hardcoded name lookup. `getMainBranch()` itself is left as-is (still used by test setup elsewhere is fine) but `resolveBranchId`'s fallback branch stops calling it.

## Single-branch venues

`StaffBar` doesn't render the branch button/popover when `branches.length <= 1`. Dashboard, Menu Management, and Table Setup are unaffected beyond this — they already resolve to the sole branch via `resolveBranchId`'s fallback (see above fix).

## Testing

- `app/components/StaffBar.test.tsx` (extended) — active-link styling replaces hidden-link assertions; branch button renders only for admin with 2+ branches; popover shows "All branches" only on `/dashboard`; mobile panel toggle.
- `app/components/StaffBarGate.test.tsx` (extended) — passes `branches` for admin, `[]` for staff.
- `lib/orderService.test.ts`, `app/order/page.test.tsx` (extended) — order creation no longer blocked by `VenueSettings.acceptingOrders`; still blocked by `branch.acceptingOrders`.
- `lib/branchService.test.ts` (extended) — `resolveBranchId`'s new fallback (first branch by name, not hardcoded "Main").
- `app/admin/branches/BranchRow.test.tsx` (extended) — chevron expand/collapse, "Change name" label + behavior parity with "Change password."
- `app/dashboard/PendingOrdersDashboard.test.tsx` (extended) — branch scoping driven by `?branch=` instead of internal tab state; tab strip no longer renders.
- `app/admin/menu-items/page.test.tsx`, `app/admin/tables/page.test.tsx` (extended) — no `BranchSelector` render; `?branch=` still resolves correctly.
- Removed: `app/admin/settings/page.test.tsx`, `app/admin/settings/AcceptingOrdersToggle.test.tsx`, `app/api/venue-settings/route.test.ts`, `lib/venueSettingsService.test.ts`.

## Rollout

- No migration — `VenueSettings` table stays in schema, unused.
- Work branches off `dev`, merges back per this project's pipeline convention (squash merge, ask which method before merging).
- Given the size (StaffBar rewrite + shared context + 3 page changes + BranchRow layout + domain-model/orderService change + settings-page removal), left to the `writing-plans` phase to sequence — likely: `INV-10`/`orderService`/settings-page removal first (self-contained, no UI dependency), then `BranchRow` layout, then `StaffBar` + shared context (the two are coupled), then Dashboard/Menu Management/Table Setup consuming it last.
