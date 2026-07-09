# StaffBar Redesign & Back-Links as Buttons — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: cross-cutting (global staff/admin chrome + customer/staff order-header navigation) · Raised during brainstorming for the "Real UI/UX for Login, Table Setup, Menu Management" backlog item (`docs/superpowers/specs/2026-07-09-admin-pages-uiux-design.md`), split out as its own story since it touches a different bounded context (global chrome, not admin-page content). Post-epic, user-directed.

**Motivation.** Two related, but separable, complaints surfaced while brainstorming Story 15:

1. The global `StaffBar` (`app/components/StaffBar.tsx`) — a session/nav strip rendered above every page via `app/layout.tsx` — looks like an afterthought: a flat translucent-`--clay-faint` strip, a bare `▴`/`▾` glyph button, and a small text pill (`▴ Staff`) when collapsed. The underlying need for the collapse/hide capability is real (staff want the dashboard to read as a clean ordinary ordering surface, not chrome-heavy), so the fix is to redesign both states properly, not remove the mechanic.
2. The customer-facing "← Menu" link (the only remaining usage of `.order-header__back` — see the correction in Decision 3 below) is a plain text link sitting inside a dark header banner — inconsistent with the app's one other header-banner action, `.staff-header__new-order`, which is a filled button.

**Scope.** Touches `app/components/StaffBar.tsx`, `app/components/StaffBar.test.tsx`, and `app/globals.css` (StaffBar's existing `.staff-strip`/`.staff-bar*` block, replaced; `.order-header__back` restyled in place — a single call site, per Decision 3's correction). Does **not** touch `StaffBarGate.tsx` (session-gating logic is unchanged — only what renders when a session exists), any API route, or any invariant.

## Decisions

### 1. Expanded state — integrated dark toolbar

Validated via the visual companion (`.superpowers/brainstorm/1557-1783567565/content/staffbar-options.html`) against a light-strip alternative. `.staff-strip` becomes `--espresso` background / `--crema` text, sitting flush (no gap, no border) above whatever dark header banner the current page renders (`.staff-header` / `.admin-header` / `.order-header`) — reading as one continuous two-tier chrome block: a slim mono session/nav line above the page's own Fraunces-italic title banner.

- Role: `--sage` dot + mono uppercase role label (unchanged content, restyled).
- Nav links (Dashboard / Menu Management / Table Setup, shown/hidden per the existing `pathname`/`role` logic — unchanged): `--crema` at reduced opacity, `--copper-bright` on hover/focus, same `·` separators.
- Log out: visually set apart at the far right via a warm accent color distinct from the nav links' copper hover (approximated in the mockup as `#e8a05a`; exact token to be confirmed against `--danger`/`--copper-bright` during implementation) so it doesn't read as "just another nav link."
- No change to which links appear on which page (`showDashboardLink`/`showMenuManagementLink`/`showTableSetupLink` logic untouched).

### 2. Collapsed state — hairline + animated arrow tab

Also validated via the companion (`staffbar-collapsed-v2.html`), iterated twice on direct feedback:

- The full-width `▴ Staff` pill is replaced with: a 3px `--copper` hairline strip at the very top of the page (near-zero vertical footprint), plus a small `--espresso`-background tab in the top-right corner showing **only a `▾` glyph** — no "Staff" text, since the arrow alone communicates "something collapsible is here" once staff learn the pattern once.
- The tab **bounces** (`translateY` loop, ~1.4s) rather than using a subtler breathing-pulse — chosen explicitly over the pulse because it needs to be *noticeable*, not just present, so staff don't forget the bar is hidden and lose access to Dashboard/Log out.
- Per this codebase's existing convention (every other animation in `globals.css` — cart toast, order card arrival, the dashboard's live-order pulse — is wrapped in `@media (prefers-reduced-motion: reduce)`), the bounce falls back to a static (non-animated) tab under that media query.
- Clicking the tab (or the hairline) restores the full expanded bar; the underlying `collapsed` boolean + `localStorage` persistence (`COLLAPSED_STORAGE_KEY = 'staffBarCollapsed'`) is unchanged from today's implementation — only its visual representation changes in both states.
- Exact tab position (corner offset, size) and the precise bounce easing/distance are implementation details to finalize against the real page — the companion mockup used representative, not final, values.

### 3. Back-link → button (1 instance — corrected from this spec's original "5 usages" claim)

**Correction (post-implementation, caught in the final whole-branch review):** this spec originally claimed `.order-header__back` had 5 call sites (the customer "← Menu" link plus 4 staff "← Dashboard" links). That was already stale at spec-writing time — Story 14 (`BUILD_STATUS.md`) had already replaced all 4 staff "← Dashboard" arrow-links with the global `StaffBar`'s nav links before this spec was written. Only **one** real usage exists: the customer-facing "← Menu" link on `app/order/[id]/page.tsx`.

`.order-header__back` is restyled to mirror `.staff-header__new-order`: filled `--copper-bright` background, `--espresso` text, 8px border-radius, 44px min-height, `font-weight: 700`, hover → `--copper`, active → `scale(0.97)`, focus-visible → copper outline. This is a CSS-only change to the one call site:

- `app/order/[id]/page.tsx` — customer "← Menu"

No `href`/text/conditional-rendering logic changes — this is a pure class-level restyle of the one call site.

## Testing

Per `06b-engineering-decisions.md` §7:

- `StaffBar.test.tsx`: existing collapse/expand and localStorage-persistence tests should still pass unchanged (same boolean state, same storage key, only markup/class differs) — verify rather than assume, since the collapsed branch's JSX structure changes (hairline + tab replaces the pill button).
- New: collapsed state's tab is present and clicking it (or the hairline) expands the bar — same interaction contract as today's `▴ Staff` button, just relocated.
- The customer "← Menu" link's test (`app/order/[id]/page.test.tsx`) queries by role/text/href, not class — should be unaffected by the visual change; run the full suite to confirm.

## Scope boundary — do NOT touch

`StaffBarGate.tsx`'s session-gating logic, `lib/authGuard.ts`, any API route, any page's link-visibility logic (`showDashboardLink` etc.), and Story 15's three admin pages (tracked separately in `docs/superpowers/specs/2026-07-09-admin-pages-uiux-design.md`). Exact pixel values for the collapsed tab's position/size and the bounce animation's distance/easing are left to implementation, not pinned by this spec.

## Tracking

New Story 16 row in `BUILD_STATUS.md` (`Backlog → Building → Done`), landing on the same branch as Story 15 per the scope-bundling decision made during brainstorming.
