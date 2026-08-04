# Backlog

**The single live backlog.** Every schedulable piece of work — feature, fix, or chore — is one `B-<n>` row here. Pick from the lowest-numbered tier down, preferring `Ready` rows. Consolidated 2026-08-04 from the epic map's backlog section, `ISSUES.md`'s open rows, and `BUILD_STATUS.md`'s product-mode reconcile list, cross-referenced against the competitive survey (`docs/research/2026-08-04-digital-menu-competitive-feature-survey.md`).

**How this file relates to the others (one source of truth per job):**

- **Rows stay short.** Detail and provenance live at each row's links (epic-map history entries, `ISSUE-<N>` rows, specs, the survey).
- **`ISSUES.md`** stays the defect record (repro, root cause, resolution — mandated by `CLAUDE.md`). An open issue gets a row here only when it's scheduled work; fixing it still moves its `ISSUES.md` row to Resolved.
- **`BUILD_STATUS.md`** stays the story board. Starting a row: set its Status to `Building` here and log the story there. Shipping a row: **delete it here** — `BUILD_STATUS.md` is the historical record; this file holds only what's left to do.
- **New ideas land here** (a row in the right tier, or Parked) — never in `07-epic-map.md`, whose backlog section is frozen history as of 2026-08-04.

**Size:** S (≤1 session) · M (one feature branch, a few sessions) · L (multi-plan). **Status:** `Ready` · `Needs design` · `Trigger-gated` · `Building`.

---

## Tier 0 — security & data-loss hygiene (owed first, per the Product-mode declaration in `BUILD_STATUS.md`)

| ID | Item | Size | Status | Next step | Detail |
|---|---|---|---|---|---|
| B-01 | Rate limiting/lockout on `POST /api/auth/login` + rotate the internal pipeline's weak seed credentials (both Production and Preview env scopes) | S | Ready | implement | `ISSUE-12` |
| B-02 | Verify Neon backup/restore actually works — tested, not assumed | S | Ready | run a restore drill against a scratch DB | reconcile item 1 |
| B-03 | Hand kapeadri login credentials to the client, then rotate the bootstrap values | S | Ready | user action + redeploy | `BUILD_STATUS.md` → Client instances checklist |
| B-27 | Propagate `vercel.json`'s build gate beyond `dev` — promote `dev → main`, then `main → client/kapeadri` (which also catches the client up; it sits a release behind at `2a56c51`). **Vercel evaluates `ignoreCommand` against the branch being built, so only `dev` is protected right now**: a push to `main` or to `client/kapeadri` still builds into the client's project and runs migrate+seed against its live DB, exactly as before the fix. Verify with the §3 loop in `docs/agents/deployment-audit.md` (currently: `dev` gated, `main` NO GATE, `client/kapeadri` NO GATE). Deliberately deferred 2026-08-04 — user picks the timing, since promoting rebuilds a live restaurant's instance | S | Ready | `git checkout main && git merge dev && git push`, then `git checkout client/kapeadri && git merge main && git push` — at a time the pilot isn't mid-service | `ISSUE-35` · `2026-08-04-retire-preprod-environment-design.md` |

## Tier 1 — build now

| ID | Item | Size | Status | Next step | Detail |
|---|---|---|---|---|---|
| B-04 | New-order sound alert on the staff dashboard (opt-in toggle, chime on new Pending, optional repeat-until-acknowledged) | S | Ready | short grill → implement | epic-map entry · survey §4.3 |
| B-05 | Modifier groups + free-text order notes | L | Needs design | `/grill-with-docs` — touches `INV-3` snapshot (stop-rule area); do B-06 first or alongside | epic-map entry · survey §4.1 |
| B-06 | Fix `ISSUE-26` — modal Escape closes every stacked dialog, not just the topmost | S | Ready | implement (prerequisite for B-05's picker UI) | `ISSUE-26` |

## Tier 2 — next

| ID | Item | Size | Status | Next step | Detail |
|---|---|---|---|---|---|
| B-07 | Item photos & descriptions (photos optional per item; allergen/dietary tags folded in as a later option) | M | Needs design | grill-lite → implement; reuse ADR-005 Blob path | epic-map entry · survey §4.2 |
| B-08 | Honest presentation of unverified online payment — treat a typed reference as cash-equivalent, not near-paid | S | Ready | implement (presentation-layer) | epic-map entry · survey §5 |
| B-09 | Code-hygiene batch: `ISSUE-23` (`createBranch` `$transaction` wrap) · `ISSUE-20` (lint back to zero) · `ISSUE-21` (partial unique index + seed upsert; additive migration) | S | Ready | implement | `ISSUES.md` |
| B-10 | Observability on the client instance — basic metrics/error visibility so scale decisions are signal-triggered | M | Needs design | decide tooling → implement | reconcile item 2 |

## Tier 3 — trigger-gated (build when the trigger fires, not before)

| ID | Item | Trigger | Size | Detail |
|---|---|---|---|---|
| B-11 | Round ordering / active-order session (resume by re-scan + link back to order + preserve cart — one design) | Pilot shows reorder friction or lost-ticket complaints | M | epic-map merged entry · survey §3 |
| B-12 | Thermal/ESC-POS printing via a local print bridge | Staff report browser-print pain at kapeadri | L | epic-map entry · survey §5 |
| B-13 | Order history & reporting — top sellers, revenue, time-to-confirm; needs an RBAC decision (owner-only vs staff) | Owner asks for numbers | M | epic-map entry |
| B-14 | Richer fulfillment lifecycle (`Preparing`/`Served`) | Pilot `OrderEvent` data shows the need — decide from data, not speculation | M | epic-map entry · reconcile item 6 |
| B-15 | Verified payment gateway, incl. webhook auto-confirm on the existing payment state machine | Honor-system reference shows real friction or abuse | L | epic-map entry · reconcile item 6 |
| B-16 | Per-person attribution — named PINs / per-user accounts (ADR-006's trigger; also unlocks real password rotation, retiring `ISSUE-6`/`ISSUE-11`'s accepted seed-rotation model) | An attribution dispute, or password-sharing pain | L | reconcile item 6 · `ISSUE-6`/`ISSUE-11` |
| B-17 | Order-ahead / takeaway channel (+ dine-in-vs-takeaway splash) — requires amending `01`'s non-goal first | Core dine-in loop validated by the pilot month | L | epic-map entries (two) |
| B-18 | Multi-language menu | Client confirms their clientele needs it | M | epic-map entry · survey |
| B-19 | Discounts / promotions | Post-validation client pull | M | epic-map entry |
| B-20 | Per-environment DB isolation for `dev` (and feature previews) vs `main` | Before adding collaborators, or the first shared-DB near-miss | M | pipeline spec's Backlog note · `2026-08-04-retire-preprod-environment-design.md` |

## Tier 4 — docs/process chores (from the product-mode reconcile list)

| ID | Item | Size | Detail |
|---|---|---|---|
| B-21 | `04-architecture.md`: record repository layout, containerization scope, env data lifecycle — honestly noting the shared-DB and whole-branch-merge deviations | S | reconcile item 3 |
| B-22 | `06b` §7 test section to operational depth (location/naming, seam pattern, fixtures, one exemplar) | S | reconcile item 4 |
| B-23 | Seed `08-ui-conventions.md` from the café-ticket visual language | M | reconcile item 5 |
| B-24 | `BUILD_STATUS.md` off-epic ledger (a line per unplanned change) | S | reconcile item 7 |
| B-25 | `CLAUDE.md` restructure toward the playbook template (no-secrets-in-commits rule, workflow-agnostic phrasing) | S | reconcile item 8 |

Reconcile item 6 (an "Ideas — unsorted" tier + park rule) is **satisfied by this file** — its three named residents are B-14, B-15, and B-16.

## Parked — no trigger, batch opportunistically

| ID | Item | Size | Detail |
|---|---|---|---|
| B-26 | UX polish batch: per-item +/− stepper on the customer menu · customer-name headline on `/order/[id]` · distinct branch-tag styling on `OrderCard` | S | epic-map entries (three) |

## Not doing — decided; don't re-litigate without new evidence

- **Geolocation gating on order submission** — rejected-unless-evidence 2026-08-04 (epic-map entry; no surveyed vendor ships it, zero observed abuse).
- **Multi-tenant SaaS** — superseded by per-client dedicated instances (`03-tenancy-model.md`, 2026-08-03 amendment).
- **End-of-day accounting / invoices** — rejected as POS territory; the narrowed per-order slip shipped as Story 22.
- **Accepted risks deliberately not scheduled:** `ISSUE-6`, `ISSUE-7`, `ISSUE-11` — each carries its own revisit condition in `ISSUES.md`; B-16 is the feature that would retire the first and last.
