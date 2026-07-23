# Issue tracker: Local Markdown

Issues, specs, and plans for this repo live as markdown **in the repo**, not in GitHub Issues.

There *is* a GitHub remote (`edwardallanau-design/automatic-fortnight`), but the `gh` CLI is not
authenticated here and the project has never used GitHub Issues. The tracker of record is
`ISSUES.md`, whose upkeep is mandated by `CLAUDE.md`.

## Where each artifact lives

| Artifact | Location | Format |
|---|---|---|
| **Bug / issue** | `ISSUES.md` (repo root) | One row in the `## Open` or `## Resolved` table, id `ISSUE-<N>` |
| **Spec** (a.k.a. PRD / design doc) | `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md` | One file per feature |
| **Plan** (implementation tickets) | `docs/superpowers/plans/<YYYY-MM-DD>-<slug>.md` | One file per feature, numbered `Task N` sections |
| **Story board** | `BUILD_STATUS.md` (repo root) | Story status: `Backlog → Building → Done` / `Blocked` |
| **Epic/story backlog** | `docs/design/07-epic-map.md` | Numbered stories |
| **Wayfinder maps** | `.scratch/<effort>/` | Ephemeral working state only — see below |

The spec and plan filenames pair up: a spec's slug plus `-design` is the spec, without it is the plan.
Match the existing date-prefixed naming exactly; don't invent a new scheme.

## When a skill says "publish to the issue tracker"

- **A bug or unexpected behaviour** → append a row to the `## Open` table in `ISSUES.md` with the next
  free `ISSUE-<N>`. Never delete rows; resolving one means moving it to `## Resolved` with root cause
  and fix/commit filled in. `ISSUES.md` also carries a longer per-entry template at the bottom — use it
  when the one-row summary can't hold the detail.
- **A spec** → write `docs/superpowers/specs/<date>-<slug>-design.md`.
- **A set of implementation tickets** → write them as numbered `Task N` sections inside a single
  `docs/superpowers/plans/<date>-<slug>.md`, **not** as one file per ticket. This deviates from the
  skills' default "one file per ticket" rule; this repo's convention wins, because `CLAUDE.md`'s
  operating loop and every existing plan already assume one plan file per vertical slice.

Per `CLAUDE.md`, spec and plan docs are written, shown to the user, and committed only **after**
approval — not committed immediately.

## When a skill says "fetch the relevant ticket"

Read the referenced file or `ISSUE-<N>` row. The user will normally name the story number, the
`ISSUE-<N>` id, or the plan/spec path directly. If given only a story number, resolve it through
`BUILD_STATUS.md` → `docs/design/07-epic-map.md` → the matching plan file.

## Triage state

Triage roles are recorded in the `Status` column of the `ISSUES.md` table as a bold prefix, so the
existing prose rationale is preserved and the role stays greppable:

```
| ISSUE-31 | ... | ... | Minor | **ready-for-agent** — repro is deterministic, fix is scoped to one file |
```

See `triage-labels.md` for the role strings.

## PRs as a request surface

**Off.** Pull requests are not part of the triage queue. Work lands on `dev` as squash merges from
local branches (see `CLAUDE.md`'s deployment pipeline); external PRs are not a thing on this repo.

## Wayfinding operations

Used by `/wayfinder` for exploratory efforts whose shape isn't known yet. This is the **only** thing
that writes to `.scratch/`, and its output is ephemeral — a resolved effort's conclusions get promoted
into a spec, a plan, or an `ISSUES.md` row.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in
  the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a
  `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it
  lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed;
  first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a
  context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## Switching to GitHub Issues later

If this project ever adopts GitHub Issues, the change is: authenticate `gh`, create the five labels
from `triage-labels.md`, and rewrite this file from the skill's `issue-tracker-github.md` template.
`ISSUES.md` should stay as the historical record either way.
