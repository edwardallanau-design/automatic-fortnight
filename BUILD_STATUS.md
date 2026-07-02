# Build Status

**Board.** `Backlog → Building → Done`, WIP limit of **one** story at a time (per playbook Section 0). Update this file as stories move.

**Lifecycle stage.** FOUNDATION complete → **MVP** (in progress) → VALIDATE → SCALE

---

## Per-system checklist

- [x] Foundation: artifacts 1–4 at production depth, 5–7 at MVP depth
- [x] Validation hypothesis + kill criteria written into artifact #1
- [x] CLAUDE.md seeded
- [x] MVP epic broken into agent-ready stories
- [ ] Walking skeleton (= the MVP) deployed end-to-end to production
- [ ] Validation gate reached and decided: go / pivot / kill
- [ ] If go: scale path begun, signal-driven

**Open risk.** No pilot restaurant confirmed yet — the kill criteria in `01-intent-and-constraints.md` are unmeasurable without one. Resolve before/alongside the build.

---

## MVP epic: Digital Ordering Core Loop

Recommended build order: 1 → 2 → 3 → 4 → 5 → 7 → 8 → 6 (see `07-epic-map.md` for the dependency rationale).

| # | Story | Status | Notes |
|---|---|---|---|
| 1 | Staff/Admin login | Building | |
| 2 | Table setup & QR identification | Backlog | |
| 3 | Menu management (Admin) | Backlog | |
| 4 | Customer menu view | Backlog | |
| 5 | Cart & order submission | Backlog | |
| 7 | Staff dashboard: view Pending orders (polling) | Backlog | |
| 8 | Staff confirms order and marks payment | Backlog | |
| 6 | Customer edits/cancels a Pending order | Backlog | |

Status values: `Backlog` · `Building` · `Blocked` · `Done`

---

## Deployment

- [ ] Vercel project created and linked
- [ ] Neon Postgres database provisioned, `DATABASE_URL` set
- [ ] Skeleton deployed to production (first successful deploy, even before all stories are done)

## Validation gate (fill in once the pilot is live)

- **Pilot restaurant:** `<name, TBD>`
- **Measurement window start:** `<date>`
- **Measurement window end (1 month later):** `<date>`
- **Result:** `<% of orders via digital menu>` → **Decision:** `<Go / Pivot / Kill>`

## Gotchas log

*(grows as real build surprises show up — empty for now.)*
