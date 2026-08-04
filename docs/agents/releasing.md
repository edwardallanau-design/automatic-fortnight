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
- Restoring the database to an earlier point is a **Neon** operation, not a git one. It was drilled
  on 2026-08-04 and **it does not work the way you would assume** — read the next section before
  relying on it.

A tag is an honest rollback target for *code*. It says nothing about *data*.

## Database restore: what the 2026-08-04 drill actually found

Drilled against the live `kapeadri` project using throwaway Neon branches (production was never
touched; all branches deleted afterwards). Three findings, in order of how much they should worry you.

### 1. The restore window is 6 hours, not days

```bash
npx neonctl projects get <project-id> --org-id <org-id> --output json \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).history_retention_seconds))"
# 21600 = 6 hours   (Neon Free plan default)
```

**A bad migration on Friday evening that nobody notices until Saturday morning is unrecoverable.**
There is no earlier copy — Neon's history is the only backup this project has. Everything below is
irrelevant outside that 6-hour window.

### 2. A point-in-time restore can silently return a *different* time than requested

This is the dangerous one. Asking for a timestamp outside available history does **not** error:

```
requested:                   2026-08-04T00:50:00Z
parent_timestamp actually used: 2026-08-04T03:18:03Z    ← 2.5 hours later, reported as success
```

The branch is created, the CLI prints success, and the data is from the wrong moment. **Always verify
what you actually got** before trusting a restore:

```bash
npx neonctl branches get <new-branch-id> --project-id <id> --org-id <org> --output json \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const b=JSON.parse(d);console.log('parent_timestamp:',b.parent_timestamp)})"
```

If `parent_timestamp` isn't what you asked for, the restore did not do what you wanted — regardless
of what the CLI said.

### 3. A child branch has no history before its own creation

Restoring branch `X` to a timestamp before `X` existed silently yields `X`'s earliest state. Always
restore **from the branch that actually holds the history** (`production`), not from a copy.

### Running the drill

```bash
# 1. branch production at a chosen point (this is the restore)
npx neonctl branches create --project-id <id> --org-id <org> \
  --name drill-restore --parent production --timestamp <ISO8601>

# 2. VERIFY the timestamp you actually got (finding 2)
npx neonctl branches get <branch-id> --project-id <id> --org-id <org> --output json

# 3. compare against production: schema, row counts, credential hashes
#    (query both connection strings and diff — see deployment-audit.md §6)

# 4. clean up
npx neonctl branches delete drill-restore --project-id <id> --org-id <org>
```

Restoring for real means repeating step 1 and then repointing the client's `DATABASE_URL` at the
recovered branch (or promoting it to default), followed by a redeploy.

### What this means for release safety

Restore *works*, but the window is short and the tooling fails quietly. So the operational rule is
**avoid needing it**:

- Additive-only migrations (see `06b-engineering-decisions.md`) — never drop a column in the same
  release that stops using it.
- Prefer fix-forward over rollback for anything touching schema.
- If a destructive change is genuinely necessary, take a Neon branch as a manual restore point
  *immediately before deploying* and verify its `parent_timestamp`. That branch is your only
  safety net, and it expires in 6 hours unless you keep it.

## After releasing

- Record the promotion in `BUILD_STATUS.md` (what shipped, what was verified).
- Promoting to each client is a separate, deliberate decision — see `CLAUDE.md`. A tag existing does
  not mean every client gets it.
- Verify the client deploy actually ran rather than assuming: `● Ready Production ~1m`, and check the
  build log if anything looks off (`docs/agents/deployment-audit.md` §7).
