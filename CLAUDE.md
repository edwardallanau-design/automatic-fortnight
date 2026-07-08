# Digital Menu & Ordering — CLAUDE.md

**Operating loop.** Pull the next story from `07-epic-map.md` → mark it `Building` in `BUILD_STATUS.md` → load the context-package docs it references → design an implementation plan for that one vertical slice → implement the plan → verify against its acceptance criteria → mark it `Done` in `BUILD_STATUS.md` (or `Blocked` with a note if stuck) → stop.

**Context-package index.**

- Intent & constraints (mode, hypothesis, kill criteria) → `01-intent-and-constraints.md`
- Domain model (entities, invariants, state machines) → `02-domain-model.md`
- Tenancy → `03-tenancy-model.md`
- Architecture & ADRs → `04-architecture.md`
- API conventions → `05-api-conventions.md`
- Engineering principles (universal, never edited) → `06a-engineering-principles.md`
- Engineering decisions (this system's stack/contract choices) → `06b-engineering-decisions.md`
- Epic map & stories → `07-epic-map.md`
- Build status / story board → `BUILD_STATUS.md`
- Bug / issue tracker → `ISSUES.md`

**Maintaining BUILD_STATUS.md.** This file is not optional bookkeeping — it is how session 40 knows what session 1 already built. Update it in the same turn as the code change, not after the fact:

- Story status changes the moment work starts/stops (`Backlog → Building → Done`, or `Blocked` with a one-line reason).
- Checklist boxes and the deployment section get checked off as they become true.
- The gotchas log gets a line whenever something non-obvious in this codebase costs real debugging time.

**Maintaining ISSUES.md.** Any bug or unexpected behaviour found — whether you caused it, found it while building something else, or the user reports it — gets logged before or alongside the fix, not skipped because it was quick to fix. Closed issues stay in the file (moved to a Resolved section), not deleted — they're a record of what already bit this project once.

**Deployment pipeline.** Three long-lived branches, each with a stable Vercel domain, publicly viewable (Deployment Protection is disabled for Preview):
- `main` (production) → `https://automatic-fortnight-lyart.vercel.app/`
- `preprod` (final check before release) → `https://automatic-fortnight-preprod.vercel.app/`
- `dev` (integration branch for in-progress work) → `https://automatic-fortnight-dev.vercel.app/`

New work branches off `dev` and PRs back into `dev` (not `main`). Promoting `dev` → `preprod` and `preprod` → `main` is a direct merge and push, no PR required — the code was already reviewed when it landed on `dev`. Design: `docs/superpowers/specs/2026-07-08-dev-preprod-prod-pipeline-design.md`.

`dev`, `preprod`, and feature-branch previews all share the single production Neon database (per-environment DB isolation is a known, deliberately deferred gap — see that spec's "Backlog" note). Don't treat data on `dev`/`preprod` as disposable-and-isolated; it's the same database production reads from. This also means concurrent deploys across branches can transiently fail on a Postgres advisory-lock timeout in `prisma migrate deploy` (`Error: P1002`) — the fix is just to redeploy once the colliding build finishes, not a real bug.

**Stop rules (ask before doing).**

- Touching anything in `02-domain-model.md`'s invariants or state machines — these are one-way doors.
- Changing the tenancy strategy in `03-tenancy-model.md`.
- Any schema migration that changes existing columns/types (additive migrations are fine to proceed with).
- Anything irreversible: deleting data, force-pushing, dropping tables.
- Deviating from an ADR in `04-architecture.md` — propose a new ADR instead of silently contradicting one.

**Definition of done.** Tests pass (per `06b` §7 test stack) · story's acceptance criteria met · scope boundary respected (no out-of-scope files touched) · code conforms to `06a-engineering-principles.md` + `06b-engineering-decisions.md`.

**Gotchas.** _(grows as the build surfaces real traps — empty for now.)_
