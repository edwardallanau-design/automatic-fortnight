# Auditing deployment state against documented intent

How to check what the Vercel/Neon/Git fleet is *actually* doing, rather than what the docs say it
does. Written from the 2026-08-04 audit that retired `preprod` and uncovered `ISSUE-35` — every
command below was really run, in roughly this order.

**Run this before**: changing deployment config, provisioning or decommissioning a client, editing
`vercel.json` or `vercel-build`, or any time an alias/deployment appears that you can't explain.
Not on a schedule — there's no cron for this, and no standing chore to forget.

**Why it exists.** `ISSUE-35` — internal branch pushes running migrations and the seed against a
live client's production database — was not found by reading documentation. Every doc described the
intended shape correctly; the *live wiring* differed, and nothing in the repo pointed at the
difference. The only thing that surfaced it was enumerating real infrastructure and noticing an
alias (`kapeadri-git-preprod-…`) that had no business existing. Docs record intent; this runbook
checks reality.

## 0. The mental model that makes the rest make sense

Two facts about Vercel cause most of the surprises here:

1. **A Vercel project is bound to a *repository*, not a branch.** `vercel git connect` subscribes it
   to every branch. The **Production Branch** setting only decides which branch is *labelled*
   Production — it does not scope what gets built. Every other branch still builds, as a Preview.
2. **A "Preview" build is not harmless in this project.** `vercel-build` runs
   `prisma migrate deploy && tsx prisma/seed.ts`, so any build writes to whatever database its env
   scope points at. On a client instance both scopes point at the *same, only* database (`ISSUE-11`).

Combined: an unguarded branch push mutates production data. That is the shape of `ISSUE-35`, and the
reason the audit below leads with wiring rather than with code.

## 1. Enumerate what exists

```bash
npx vercel project ls                       # every project on the account
npx neonctl projects list --org-id <org-id> # every database
git branch -a --format='%(refname:short) %(upstream:short)'
```

`neonctl` **hangs on an interactive org prompt** without `--org-id`. Get it once from
`npx neonctl me`, then pass it on every call.

Expected today: two internal (`automatic-fortnight` project ↔ `digitalmenu` DB) plus one per client
(`kapeadri` ↔ `kapeadri`). Long-lived branches are `dev`, `main`, and one `client/<name>` each —
anything else long-lived is either a stale feature branch or something to explain.

## 2. Check branch → project wiring (where `ISSUE-35` was hiding)

The highest-value check, because it's the one no document can tell you:

```bash
npx vercel alias ls
```

Read this for aliases that **shouldn't exist**. `kapeadri-git-preprod-…` was the whole tell: a
`preprod`-named alias inside a project that should only ever build `client/kapeadri`. An alias named
after an internal branch, inside a client project, means that project is building internal branches.

Then confirm per project which branch produced which deployment, and its target:

```bash
npx vercel ls <project>                                     # target column: Production vs Preview
npx vercel ls <project> --meta githubCommitRef=<branch>     # deployments from one branch
npx vercel inspect <deployment-url> | grep -iE "target|created|name"
```

Want: in a client project, `client/<name>` → Production and **nothing else building at all**. In
`automatic-fortnight`, `main` → Production, `dev`/`feature/*` → Preview, no `client/*` at all.

## 3. Check the build gate is present and correct

The gate lives in `vercel.json` (`ignoreCommand`) — see `ISSUE-35` and
`docs/specs/2026-08-04-retire-preprod-environment-design.md` for why it's there.

**Vercel evaluates it against the branch being built, not centrally.** So a branch is protected only
once the file has *reached* it. Check every long-lived branch, not just the one you're on:

```bash
for b in dev main client/kapeadri; do
  printf '%-20s ' "$b"
  git show "origin/$b:vercel.json" | grep -q ignoreCommand && echo "gated" || echo "NO GATE"
done
```

Then evaluate the logic itself across project × branch combinations, rather than eyeballing the
shell:

```bash
CMD=$(node -e "console.log(require('./vercel.json').ignoreCommand)")
for combo in automatic-fortnight:dev automatic-fortnight:main automatic-fortnight:client/kapeadri \
             kapeadri:client/kapeadri kapeadri:dev kapeadri:main kapeadri:client/other; do
  P=${combo%%:*}; B=${combo#*:}
  VERCEL_PROJECT_NAME=$P VERCEL_GIT_COMMIT_REF=$B bash -c "$CMD" >/dev/null 2>&1
  [ $? -eq 1 ] && R=BUILD || R=skip
  printf '%-20s %-18s %s\n' "$P" "$B" "$R"
done
```

Want: internal project BUILDs everything **except** `client/*`; a client project BUILDs **only**
`client/<its own name>` — including skipping *other* clients' branches.

**Run both checks, and treat the first as the real one.** The truth-table proves the logic; the
presence loop proves it is *deployed*. They disagree whenever the gate is committed but not yet
promoted, which is the normal state right after a fix lands on `dev` — on 2026-08-04 the table read
perfectly while `main` and `client/kapeadri` both reported `NO GATE`, meaning a push to either would
still have built into the client project. A green truth table on `dev` says nothing about branches
`dev` hasn't reached yet.

Two traps in that command:
- **Exit codes are inverted: `exit 1` = build, `exit 0` = skip** (it mirrors `git diff --quiet`).
  Backwards means every deploy silently stops instead of erroring.
- It matches `client/$VERCEL_PROJECT_NAME`, so **project `foo` must pair with branch `client/foo`**
  exactly. A mismatch means that client never builds and nothing announces it.

## 4. Check env-var scopes

```bash
npx vercel env ls          # for the linked project
```

Scopes must be **Production *and* Preview** for `DATABASE_URL`, `AUTH_SECRET`, `SEED_*`
(`ISSUE-11`): the seed runs on every build in either scope, so a half-set variable means the next
build reseeds with a stale value. On a client project both scopes intentionally point at the same
single database — which is exactly why step 3's gate is load-bearing rather than tidy.

To inspect a project other than the linked one without disturbing the repo's own link, link a
throwaway directory instead:

```bash
mkdir -p "$TMPDIR/af-inspect" && cd "$TMPDIR/af-inspect"
npx vercel link --yes --project <name> && npx vercel env ls
```

## 5. Check the repo's own Vercel link

```bash
cat .vercel/project.json
```

Should be `automatic-fortnight`. It was found pointing at **`kapeadri`** during this audit, meaning
any bare `vercel` command from the repo root targeted the pilot client's production project. Fix:

```bash
npx vercel link --project automatic-fortnight --yes
```

Do client-specific CLI work with an explicit `--project` flag or from a separate directory.

## 6. Verify a client database is intact (read-only)

After any suspected stray build. Pass the connection string inline — **never** edit `.env.local`,
which points at local Docker and is easy to leave aimed at a client DB:

```bash
CS=$(npx neonctl connection-string --project-id <proj-id> --org-id <org-id>)
node -e "
const {Client}=require('pg');const c=new Client({connectionString:process.argv[1]});
c.connect().then(async()=>{
  console.table((await c.query('SELECT role, \"branchId\", LEFT(\"passwordHash\",12) h FROM \"Credential\" ORDER BY role;')).rows);
  console.table((await c.query('SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3;')).rows);
  for (const t of ['Order','MenuItem','Branch'])
    console.log(t, (await c.query('SELECT COUNT(*)::int n FROM \"'+t+'\";')).rows[0].n);
  await c.end();
}).catch(e=>{console.error('ERR',e.message);process.exit(1)});
" "$CS"
```

Want: exactly two `Credential` rows (`admin` with null `branchId`, `staff` on a branch), migrations
no newer than the instance's provisioning date, and row counts matching the client's real usage.

## 7. Proving a gate actually works

Local evaluation (step 3) proves the *logic*; it does not prove Vercel honours it. Only a real push
does. Push to `dev`, then:

```bash
npx vercel ls automatic-fortnight | head -3     # want: ● Ready, ~1m
npx vercel ls <client-project>    | head -3     # want: Canceled, ~3s
```

**A skipped build appears as `Canceled`, not as an absent deployment** — Vercel still records it and
still lists it. **Duration is what distinguishes them: ~3s skipped vs ~1m built.** A `Canceled` entry
that took 57s is a real build that was cancelled, which is a different thing entirely.

Then re-run step 6 and compare **`passwordHash` prefixes before and after**. This is the decisive
check: bcrypt generates a fresh salt on every run, so if the seed had executed the hashes would
necessarily differ. Identical hashes prove it did not.

Verified this way on 2026-08-04: `dev` push → `● Ready 57s` on `automatic-fortnight`,
`Canceled 3s` on `kapeadri`, client DB migration timestamp and both hashes byte-identical.

## What this audit cannot tell you

- **Whether a client branch is behind `main`.** Nothing above surfaces drift; use
  `git log --oneline origin/main..origin/client/<name>`. `client/kapeadri` was a release behind at
  the time of this audit, which no Vercel-side check would have revealed.
- **Whether the Production Branch setting is right.** It's dashboard-only and the API silently
  ignores writes to it (see `client-instance-provisioning.md` §4). Infer it from step 2's `target`
  column instead of trusting the dashboard.
- **Anything about a project whose build never ran.** A gate mismatch (§3's naming coupling) produces
  *silence*, not an error — no deployment, no alias, no log. If a client seems not to be updating,
  check the gate before assuming Git or Vercel is broken.
