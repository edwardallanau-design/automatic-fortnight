# Multi-branch admin UX — Design (Plan 2 of 3)

**Date.** 2026-07-11
**Source.** Plan 2 of 3 for the multi-branch feature. Plan 1 (schema/migration/auth) is merged to `dev` (`07f6755`) and shipped zero new user-facing UI — every admin/staff screen still implicitly operates on the single "Main" branch via a temporary `resolveBranchId()` stopgap. This plan builds the admin UX the Plan 1 data model already supports. Parent design: `docs/superpowers/specs/2026-07-10-multi-branch-ordering-points-design.md` (covers all 3 plans; this doc only fills in the parts that design left as "implementation detail for the plan").

## Problem

An admin can't yet create a second branch, rename one, open/close it independently, or rotate its staff password — `lib/branchService.ts` only has three read-oriented functions (`getBranchOrThrow`, `getMainBranch`, `resolveBranchId`), no CRUD. And even once a second branch exists, two admin-facing routes (`POST /api/ordering-points`, `PATCH /api/menu-items/[id]/availability`) would still always operate on Main — they call `resolveBranchId(session)` with no way to say "no, this branch" for an admin session (which never carries its own `branchId`).

## Scope

**In scope.**
- `/admin/branches` — list branches, create (name + required password), rename, toggle `acceptingOrders`, rotate password (`INV-15`-checked, already defined in Plan 1).
- A branch selector (`?branch=<id>` URL param) on Table Setup and Menu Management, admin-only — staff pages are unaffected, already auto-scoped via session.
- `resolveBranchId` gains a second, optional parameter for an explicit request-supplied branch id, honored **only** for admin sessions.
- `lib/branchService.ts` grows real CRUD: `listBranches`, `createBranch`, `renameBranch`, `setBranchAcceptingOrders`, `setBranchPassword`.
- "Branches" nav link in the global `StaffBar`, admin-only, matching the existing link pattern.

**Out of scope.**
- Branch deletion. `INV-15`'s the only reason this needed a real decision (a deleted branch's credential would go orphaned via the existing `ON DELETE SET NULL` FK) — deferred rather than resolved now; closing/renaming a branch is the available alternative until there's a real need for deletion.
- Per-branch menus/pricing, per-person staff accounts, dashboard branch-tab filtering (Plan 3) — all unchanged from Plan 1's non-goals.
- Any change to `docs/design/02-domain-model.md`. Every invariant this plan needs (`INV-15`, the `Branch.acceptingOrders` state machine) was already defined in Plan 1's migration; this plan is UI/CRUD on top of already-decided invariants, not a new one-way door.

## The `resolveBranchId` change

Current signature (Plan 1): `resolveBranchId(session: { branchId?: string }): Promise<string>` — always resolves admin to Main, no override possible.

New signature: `resolveBranchId(session: { branchId?: string }, requestedBranchId?: string): Promise<string>`.

Logic:
- `session.branchId` present (staff) → **always** return it. `requestedBranchId` is ignored unconditionally — this isn't "prefer session," it's the same hard security boundary Plan 1 already established (staff can never act on another branch), and this plan must not weaken it by accident.
- `session.branchId` absent (admin) → return `requestedBranchId` if it names a real, existing branch; otherwise fall back to `getMainBranch()`, exactly as Plan 1's behavior today (so any caller that doesn't pass a selection — a stray API client, a not-yet-updated call site — keeps working unchanged).

This one change is what every other admin-facing branch selector in this plan builds on; no other route needs its own bespoke branch-resolution logic.

## Data model — `lib/branchService.ts` additions

```ts
listBranches(): Promise<Branch[]>

createBranch(name: string, password: string): Promise<Branch>
// - validates password against INV-15 (see below) before creating anything
// - creates the Branch
// - auto-creates its OrderingPoint{label: "Counter", isCounter: true}
// - creates its Credential{role: 'staff', branchId, passwordHash}

renameBranch(id: string, name: string): Promise<Branch>

setBranchAcceptingOrders(id: string, acceptingOrders: boolean): Promise<Branch>

setBranchPassword(id: string, password: string): Promise<void>
// - validates password against INV-15, excluding this branch's OWN current
//   credential from the collision scan (re-saving the same password isn't a
//   collision against itself)
// - updates the branch's existing Credential row's passwordHash
```

**`INV-15` enforcement** (defined in Plan 1, unimplemented until now): a private helper, e.g. `assertPasswordAvailable(password: string, excludeBranchId?: string)`, fetches every `Credential` row except the one belonging to `excludeBranchId` (if given) and runs `bcrypt.compare(password, row.passwordHash)` against each. Any match throws `ConflictError`. `createBranch` calls it with no exclusion (nothing to exclude yet); `setBranchPassword` calls it excluding the target branch's own credential.

## Components & data flow

### Admin UX

- **`/admin/branches`** (new) — server component, `requireRole('admin')`, `listBranches()`. One row per branch, following this app's established edit-toggle-row convention (Story 15/17): name (view, or an edit-toggle reveal to rename), an always-visible `acceptingOrders` slider reusing the existing `.slider-toggle` CSS (`VenueSettings`'s toggle, Plan 1's design system), and a password-rotation control (a reveal-to-edit password field + save, not a permanently-visible plaintext field). A create form at the top: name + password, both required, submits to `POST /api/branches`, shows the `INV-15` collision error inline on conflict.
- **Table Setup (`/admin/tables`)** — reads `?branch=` from `searchParams`; a new branch `<select>` (admin-only) navigates to `?branch=<id>` on change, defaulting to Main when absent. `CreateOrderingPointForm` gains a `branchId` prop (the page's resolved branch) and includes it in its `POST /api/ordering-points` body.
- **Menu Management (`/admin/menu-items`)** — same `?branch=` selector, admin-only; staff continue to see zero selector, forced silently to their own branch exactly as today. `MenuItemRow` gains a `branchId` prop, included in its `PATCH .../availability` body.
- **`StaffBar`** — new "Branches" link, `role === 'admin'` gated, same `showXLink` pattern as the existing five links.

### API

- `POST /api/branches` — admin-only. Body `{ name, password }`, both required non-empty strings. `409` (`ConflictError`) on `INV-15` collision. Returns the created `Branch`.
- `PATCH /api/branches/:id` — admin-only. Body may include any of `{ name, acceptingOrders, password }` (partial update, matching the existing `PATCH /api/menu-items/[id]` pattern). `409` on `INV-15` collision if `password` is included. `404` for an unknown id.
- No `GET /api/branches` route — every consumer (`/admin/branches`, the Table Setup/Menu Management selectors) is a server component reading `branchService` directly, matching the existing `VenueSettings` precedent (no `GET /api/venue-settings` either).
- `POST /api/ordering-points` — now reads `body.branchId` and calls `resolveBranchId(session, body.branchId)` instead of `resolveBranchId(session)`.
- `PATCH /api/menu-items/[id]/availability` — same change: reads `body.branchId`, passes it through.

## Error handling

- `INV-15` collision (create or rotate) → `ConflictError` (409), message: "This password is already in use by another branch or the admin login."
- Unknown `branchId` anywhere (a stale `?branch=` param, a bad `body.branchId`) → `NotFoundError` (404) via the existing `getBranchOrThrow`/`resolveBranchId` chain.
- Staff-supplied `requestedBranchId` is silently ignored (not a 403) — consistent with Plan 1's existing precedent for the same scenario, since there's nothing to reject, just nothing to honor.

## Testing

- `lib/branchService.test.ts` (extended) — `listBranches`, `createBranch` (including auto-created Counter ordering point + credential + `INV-15` rejection), `renameBranch`, `setBranchAcceptingOrders`, `setBranchPassword` (including self-exclusion from the collision scan).
- `lib/branchService.test.ts` — `resolveBranchId`'s new second-parameter behavior: staff session ignores `requestedBranchId` entirely even when supplied; admin session honors a valid one; admin session with an invalid/absent one falls back to Main exactly as before.
- `app/api/branches/route.test.ts` (new), `app/api/branches/[id]/route.test.ts` (new) — auth gating, validation, `INV-15` 409, 404 on unknown id.
- `app/api/ordering-points/route.test.ts`, `app/api/menu-items/[id]/availability/route.test.ts` (extended) — `body.branchId` is honored for admin, ignored for staff (staff's own session branch wins even if a different `body.branchId` is sent).
- `app/admin/branches/page.test.tsx` (new) — admin gating, renders branch rows, create form.
- `app/admin/tables/page.test.tsx`, `app/admin/menu-items/page.test.tsx` (extended) — selector renders for admin only, absent for staff; `?branch=` resolves the right branch's data.

## Rollout

- Fully additive to Plan 1's schema — no migration needed (`Branch`, `OrderingPoint`, `Credential.branchId`, `MenuItemSoldOut` already exist).
- Work branches off `dev`, PR/squash back into `dev`, per this project's pipeline convention.
- Given the size (new page + CRUD service + two modified pages + two modified routes), left to the `writing-plans` phase to sequence into tasks — likely: `branchService` CRUD first, then `/admin/branches` UI, then the two existing-page selectors + route changes.
