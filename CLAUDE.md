# Digital Menu & Ordering — CLAUDE.md

**Operating loop.** Pick the next item from `BACKLOG.md` (lowest tier first, prefer `Ready`) → mark it `Building` there and log the story in `BUILD_STATUS.md` → load the context-package docs it references → design an implementation plan for that one vertical slice → implement the plan → verify against its acceptance criteria → mark it `Done` in `BUILD_STATUS.md` and delete its `BACKLOG.md` row (or mark it `Blocked` with a note if stuck) → stop. (The original MVP epic's story specs live in `07-epic-map.md` — all shipped; that file is now reference/history.)

**Context-package index.**

- Intent & constraints (mode: Product, committed pilot client, adoption-as-iteration-signal) → `01-intent-and-constraints.md`
- Domain model (entities, invariants, state machines) → `02-domain-model.md`
- Tenancy → `03-tenancy-model.md`
- Architecture & ADRs → `04-architecture.md`
- API conventions → `05-api-conventions.md`
- Engineering principles (universal, never edited) → `06a-engineering-principles.md`
- Engineering decisions (this system's stack/contract choices) → `06b-engineering-decisions.md`
- Epic map & stories (MVP epic history; backlog section frozen) → `07-epic-map.md`
- **Live backlog — pick all new work here** → `BACKLOG.md`
- Build status / story board → `BUILD_STATUS.md`
- Bug / issue tracker → `ISSUES.md`

**Maintaining BUILD_STATUS.md.** This file is not optional bookkeeping — it is how session 40 knows what session 1 already built. Update it in the same turn as the code change, not after the fact:

- Story status changes the moment work starts/stops (`Backlog → Building → Done`, or `Blocked` with a one-line reason).
- Checklist boxes and the deployment section get checked off as they become true.
- The gotchas log gets a line whenever something non-obvious in this codebase costs real debugging time.

**Maintaining ISSUES.md.** Any bug or unexpected behaviour found — whether you caused it, found it while building something else, or the user reports it — gets logged before or alongside the fix, not skipped because it was quick to fix. Closed issues stay in the file (moved to a Resolved section), not deleted — they're a record of what already bit this project once.

**Maintaining BACKLOG.md.** The single live backlog: every schedulable feature/fix/chore is one tiered `B-<n>` row, and it is the only place to pick next work from. New ideas get a row there (right tier, or Parked) — never new entries in `07-epic-map.md`'s frozen backlog section. A shipped row is deleted, not archived — `BUILD_STATUS.md` is the record. Bugs still get their `ISSUES.md` row first; an issue also appears in `BACKLOG.md` only when it becomes scheduled work, referenced by its `ISSUE-<N>` id.

**Deployment pipeline.** Two internal long-lived branches, each with a stable Vercel domain on the `automatic-fortnight` project, publicly viewable (Deployment Protection is disabled for Preview):
- `main` (pristine reference state + the vendor's own demo instance — **not** where real customer traffic lands) → `https://automatic-fortnight-lyart.vercel.app/`
- `dev` (integration branch for in-progress work) → `https://automatic-fortnight-dev.vercel.app/`

**Real production is `client/<name>`, not `main`.** `preprod` was retired on 2026-08-04 — see `docs/specs/2026-08-04-retire-preprod-environment-design.md`. Since each client runs on its own branch/project/database, `main` is now itself a non-customer-facing environment, and the "final check before a real restaurant sees it" role sits at `main` and at the manual `main → client/<name>` merge. **Do not automate that merge** — it is the pipeline's last human gate.

New work branches off `dev` and merges back into `dev` (not `main`) — **every merge into `dev` is a squash merge**, no exceptions, but *how* it lands (GitHub PR squash-merged via `gh`, or a local `git merge --squash`) is a per-merge choice — ask which before merging. Either way, the result is one commit on `dev` with a Conventional Commits title (`fix: ...`, `feat: ...`, `chore: ...`) summarizing the change, not every intermediate task/review-fixup commit from the branch. Local-squash recipe: `git checkout dev && git merge --squash <branch>` → one commit → `git push origin dev`. Deleting the feature branch (local + remote) after merge is also a per-merge choice — ask before deleting, don't do it automatically. Promoting `dev` → `main` is a direct merge and push, no PR required — the code was already reviewed when it landed on `dev`.

`dev`, `main`, and feature-branch previews all share the single internal Neon database (`digitalmenu`); per-environment DB isolation is a known, deliberately deferred gap (`B-20`). Don't treat data on `dev` as disposable-and-isolated; it's the same database `main` reads from. Client databases are entirely separate and unaffected. This shared DB also means concurrent deploys across branches can transiently fail on a Postgres advisory-lock timeout in `prisma migrate deploy` (`Error: P1002`) — the fix is just to redeploy once the colliding build finishes, not a real bug.

**Client instances (separate from the two branches above).** Each real client runs their own dedicated Vercel project + Neon database + long-lived `client/<name>` branch — no shared database, no shared deployment. These are the actual production environments. First one: `client/kapeadri` (pilot, provisioned 2026-08-03). A client branch is cut from `main`, **never** from `dev`, and **never merges back into `main`**. Releasing to a client is an explicit `git checkout client/<name> && git merge main && git push` run as an extra step alongside each promotion to `main` — deliberately manual, because that decision point (does this client get this release, today, mid-service?) is the whole reason the branch exists. Decisions: `03-tenancy-model.md` + `docs/specs/2026-08-03-client-branch-pipeline-amendment-design.md`. **Step-by-step provisioning runbook (real commands, and the two steps that can't be automated): `docs/agents/client-instance-provisioning.md` — read it before provisioning any new client instance.**

**Before changing any deployment config, audit the live wiring — don't trust these docs alone: `docs/agents/deployment-audit.md`.** That runbook exists because `ISSUE-35` was invisible to every document in this repo (they all described the intended shape correctly) and was only found by enumerating real Vercel/Neon state. Run it before editing `vercel.json`/`vercel-build`, provisioning or decommissioning a client, or whenever a deployment or alias appears that you can't explain.

**Build isolation between instances is not automatic (`ISSUE-35`).** `vercel git connect` subscribes a project to *every* branch in the repo — the Production Branch setting only picks which branch is *labelled* Production. Because `vercel-build` runs `prisma migrate deploy && tsx prisma/seed.ts`, and a client instance points both its Production and Preview env scopes at its single database, an unguarded internal-branch push runs migrations and the seed against a **live client's production data** (this really happened, twice). The guard is the `ignoreCommand` in `vercel.json`: the internal project skips `client/*`, and a client project builds only `client/$VERCEL_PROJECT_NAME`. Preserve it in any change to `vercel.json`, the build command, or how client projects connect to Git.

**Stop rules (ask before doing).**

- Touching anything in `02-domain-model.md`'s invariants or state machines — these are one-way doors.
- Changing the tenancy strategy in `03-tenancy-model.md`.
- Any schema migration that changes existing columns/types (additive migrations are fine to proceed with).
- Anything irreversible: deleting data, force-pushing, dropping tables.
- Deviating from an ADR in `04-architecture.md` — propose a new ADR instead of silently contradicting one.

**Definition of done.** Tests pass (per `06b` §7 test stack) · story's acceptance criteria met · scope boundary respected (no out-of-scope files touched) · code conforms to `06a-engineering-principles.md` + `06b-engineering-decisions.md`.

**Gotchas.** _(grows as the build surfaces real traps — empty for now.)_

## Agent skills

### Issue tracker

Local markdown, not GitHub Issues — bugs in `ISSUES.md`, specs in `docs/specs/`, plans in `docs/plans/` (authored via `/to-spec` → `/to-tickets` → `/implement` as of 2026-07-25; everything under `docs/superpowers/` is a frozen pre-2026-07-25 archive — link targets only, never add/edit there). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, written as a bold prefix in the `Status` column of `ISSUES.md`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context, but housed in the numbered `docs/design/` context package — no root `CONTEXT.md`, no `docs/adr/`. See `docs/agents/domain.md`.

### Client instance provisioning

Standing up a new client's dedicated Vercel project + Neon database + `client/<name>` branch, headless via CLI/API. Includes the two steps that genuinely can't be automated (creating the Neon project; setting Vercel's Production Branch) and the Framework-Preset trap that silently 404s the whole app despite a clean build log. See `docs/agents/client-instance-provisioning.md`.

### Releasing

SemVer tags on `main` (started at `v1.0.0`, 2026-08-04 — the first version in real service with the pilot). How to cut a release, how to tell what a client is running (`git describe --tags origin/client/<name>`), and the two rollback mechanisms — Vercel's instant build rollback for a live incident vs. a git revert — plus the forward-only-migration constraint that decides which one is safe. See `docs/agents/releasing.md`.

### Deployment audit

Checking what the Vercel/Neon/Git fleet is *actually* doing versus what these docs claim — branch→project wiring, build gates, env scopes, the repo's own Vercel link, and a read-only client-DB integrity check. Trigger-based, not scheduled: run it before changing deployment config, before provisioning/decommissioning a client, or when an unexplained deployment or alias shows up. Exists because `ISSUE-35` was invisible to documentation and only surfaced by enumerating live infrastructure. See `docs/agents/deployment-audit.md`.
