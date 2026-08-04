# Releasing: versioning, tagging, and rolling back

How a release is cut, how to tell what a client is running, and what to do when a release is bad.
Started at `v1.0.0` (2026-08-04), the first version serving a live pilot client.

**Related:** `CLAUDE.md`'s pipeline section · `docs/agents/deployment-audit.md` (verifying wiring) ·
`docs/agents/client-instance-provisioning.md` (standing up a client).

## Scheme

**SemVer, tagged on `main`.** `main` is the release point — the pristine state every client branch is
cut from — so that is where tags live. Never tag `dev` (unreleased) or a `client/*` branch (a
client's copy of a release, not the release itself).

- **MAJOR** — a breaking change to how the system is operated or a migration that can't be rolled
  back cleanly.
- **MINOR** — new capability for staff/customers (a new ordering flow, a new admin surface).
- **PATCH** — fixes and docs with no behaviour change for the client.

`v1.0.0` was cut when the pilot went into real service. Pre-`1.0.0` there were no tags; commits before
it are reachable only by SHA.

Keep `package.json`'s `version` in step with the tag. It is not used at runtime, but a mismatch makes
the repo lie about itself.

## Cutting a release

Tag **after** `dev → main` lands, before promoting to any client:

```bash
git checkout main && git pull origin main
git tag -a vX.Y.Z -m "vX.Y.Z — <one line>

<what changed, why it matters to a client>
Schema baseline: <latest migration dir name>."
git push origin vX.Y.Z
```

**Use `-a` (annotated), not a lightweight tag.** A lightweight tag is a bare pointer with no message,
author, or date; annotated tags are real objects carrying release metadata — which is the entire
point of tagging a release.

**Record the schema baseline in the message.** It is what makes the rollback rules below decidable
later, and it cannot be reconstructed cheaply after the fact.

## What is a given client running?

```bash
git fetch origin --tags
git describe --tags origin/client/kapeadri     # -> v1.0.0
git describe --tags origin/main                # -> what the newest release is
```

`v1.0.0-3-gabc1234` means "3 commits past v1.0.0" — that client is on an untagged state, i.e. it
received a promotion that was never tagged, or has drifted. Both are worth explaining.

To see what a client is missing:

```bash
git log --oneline origin/client/kapeadri..origin/main
```

## Rolling back

**Read this before rolling anything back.** There are two mechanisms and they are not
interchangeable.

### 1. Vercel rollback — for "the client's site is broken right now"

Re-points production at a **previous build** in seconds. No git operation, no rebuild — and crucially
**no `prisma migrate deploy` re-run**, because nothing is built.

```bash
npx vercel ls <client-project>                  # find a prior ● Ready Production deployment
npx vercel rollback <deployment-url>
npx vercel rollback status <client-project>     # confirm it landed
```

This is the **first response to a live incident**, ahead of anything involving git. It changes only
which build serves traffic.

Caveat: it does not change the git branch. The next push to `client/<name>` redeploys the broken code
unless the underlying cause is fixed first.

### 2. Git revert to a tag — for "this release was wrong, undo it properly"

```bash
git checkout client/<name>
git revert <bad-commit>      # or: git merge vX.Y.Z after reverting forward
git push origin client/<name>
```

**The migration constraint that governs all of this:** `vercel-build` runs `prisma migrate deploy`,
and Prisma migrations are **forward-only** — this project generates no down-migrations. So:

- **Safe** to roll code back across a tag boundary when **no migration landed between the two
  versions**. Compare the schema baselines in the two tag messages; if identical, the code rollback
  is clean.
- **Not safe** when a migration did land. The old code's Prisma client expects a schema the database
  no longer has, which fails in worse ways than the bug being escaped. In that case the real recovery
  is Vercel rollback (above) to stop the bleeding, then a **fix-forward** patch release — not a code
  rollback.
- Restoring the database to an earlier point is a **Neon** operation, not a git one, and this
  project's restore path is **untested** (`B-02`). Do not assume it works until that drill is run.

A tag is an honest rollback target for *code*. It says nothing about *data*.

## After releasing

- Record the promotion in `BUILD_STATUS.md` (what shipped, what was verified).
- Promoting to each client is a separate, deliberate decision — see `CLAUDE.md`. A tag existing does
  not mean every client gets it.
- Verify the client deploy actually ran rather than assuming: `● Ready Production ~1m`, and check the
  build log if anything looks off (`docs/agents/deployment-audit.md` §7).
