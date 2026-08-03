# Provisioning a client instance (Vercel + Neon), start to finish

How a new client gets their own dedicated instance. Written from the actual `kapeadri` pilot run on
2026-08-03 — every command below was really executed, in this order. Follow it rather than
rediscovering it; two steps in here cost real debugging time the first time round.

**Design context (read if you're changing the shape, not just following it):**
`docs/design/03-tenancy-model.md` (branch-per-tenant + db-per-tenant) and
`docs/specs/2026-08-03-client-branch-pipeline-amendment-design.md` (why a client branch instead of
tracking `main`). This file is the *mechanics*; those are the *decisions*.

## The one thing to know up front

**Almost all of this is CLI/API automatable — but exactly two steps cannot be, and both are silent
traps.** Budget a human for these:

| Step | Why it needs a human |
|---|---|
| **Creating the Neon project** | The account's plan caps project count (`npx neonctl me` showed `Projects Limit: 0` on the Hobby account — it was already at its cap). Nothing to script around; someone creates it in the Neon console, or frees/upgrades a slot. |
| **Setting Vercel's Production Branch** | Genuinely dashboard-only. `vercel git connect` always defaults it to `main`; `vercel project update` has no flag; `PATCH /v9/projects/{id}` rejects the property (`should NOT have additional property`); `POST /v9/projects/{id}/link` accepts it in the body and then **silently ignores it** (returns success, value unchanged). |

Everything else below runs headless.

## 0. Prerequisites

```bash
npx vercel login          # device flow, opens a browser
npx neonctl me            # device flow, opens a browser; also shows the Projects Limit
```

`neonctl` prompts interactively for an org unless you pass `--org-id`. Get it once from the prompt
output or `npx neonctl me`, then pass it on every call or commands will hang waiting for input.

## 1. Branch

```bash
git checkout main && git pull origin main
git checkout -b client/<name>
git push -u origin client/<name>
```

Branch off `main`, never off `dev` — a client only ever receives code that already went through
`dev → preprod → main`. If `main` is behind, promote it *first* (see CLAUDE.md's pipeline section);
don't branch a client off unreleased work.

## 2. Neon database

Create the project in the Neon console (see the table above), then everything else is CLI:

```bash
npx neonctl projects list --org-id <org-id>                       # find the new project id
npx neonctl connection-string --project-id <proj-id> --org-id <org-id>
```

Apply schema + seed against it. Pass the URL inline — do **not** edit `.env.local`, which points at
local Docker and is easy to leave pointing at a client DB by accident:

```bash
DATABASE_URL="<conn-string>" npx prisma migrate deploy

DATABASE_URL="<conn-string>" \
  SEED_STAFF_PASSWORD="<generated>" \
  SEED_ADMIN_PASSWORD="<generated>" \
  npx tsx prisma/seed.ts
```

Generate real credentials, never placeholders (this is what makes `ISSUE-12` not apply to a client
instance):

```bash
node -e "const c=require('crypto');const g=n=>c.randomBytes(n).toString('base64url');
console.log('AUTH_SECRET='+g(32));
console.log('SEED_STAFF_PASSWORD='+g(12));
console.log('SEED_ADMIN_PASSWORD='+g(12));"
```

Verify you seeded the *right* database before moving on — the seed prints success either way, and
`dotenvx` auto-injects `.env.local`, so a mistake here silently targets the shared internal DB:

```bash
node -e "
const {Client}=require('pg');const c=new Client({connectionString:'<conn-string>'});
c.connect().then(async()=>{console.log((await c.query('SELECT role, \"branchId\" FROM \"Credential\";')).rows);await c.end()});"
```

Expect exactly two rows: `admin` (`branchId: null`) and `staff` (Main branch).

## 3. Vercel project

```bash
npx vercel project add <name>
npx vercel link --project <name> --yes        # writes .vercel/ + appends to .env.local, both gitignored
```

Environment variables — each needs **both** Production and Preview scopes (`ISSUE-11`: the seed runs
on every build in either scope, so a half-set variable means the next Preview build reseeds the DB
with a stale value):

```bash
for scope in production preview; do
  echo "<conn-string>"  | npx vercel env add DATABASE_URL        $scope
  echo "<auth-secret>"  | npx vercel env add AUTH_SECRET         $scope
  echo "<staff-pw>"     | npx vercel env add SEED_STAFF_PASSWORD $scope
  echo "<admin-pw>"     | npx vercel env add SEED_ADMIN_PASSWORD $scope
done
```

Blob store (for menu/QR image uploads, ADR-005). This one call creates it, links it to the project,
**and** sets `BLOB_READ_WRITE_TOKEN` across all three scopes — no separate `env add` needed:

```bash
npx vercel blob create-store <name> --access public --yes
```

**Must be `--access public`, not `--access private`.** `lib/blobStorage.ts` calls `put(..., { access:
'public' })` unconditionally (matching ADR-005 and the shared `digitalmenu` store dev/preprod/main
already use) — a store created `--access private` rejects every upload with `BlobError: Cannot use
public access on a private store`, and access can't be changed after creation (`create-store`/
`delete-store` only; no update path). This bit the `kapeadri` pilot: its store was created private,
QR uploads 500'd, `ISSUE-34`. Fix for an already-provisioned instance is `delete-store` (safe once
`list-stores`/`get-store` confirms 0 blobs) then re-run `create-store` with `--access public`.

Connect Git, then fix the two settings that are wrong by default:

```bash
npx vercel git connect https://github.com/<org>/<repo>.git --yes

npx vercel project update <name> --framework nextjs     # ← see the trap below; do not skip
npx vercel project protection disable <name> --sso      # so real customers/staff can reach the app
```

### Trap: Framework Preset defaults to "Other" and 404s the entire app

A project created via `vercel project add` does **not** auto-detect Next.js (one imported through the
dashboard's Git flow does). With preset `Other`, Vercel serves the project as static output and never
routes requests through the Next.js runtime — so **every route 404s**, including `/` on the
deployment's own URL.

The build log gives you nothing: `vercel-build` runs in full, migrations apply, the seed runs, Next
prints its complete route table, "Build Completed", status `● Ready`. It all looks perfect. Fix is
the `--framework nextjs` line above, then redeploy.

**Diagnostic rule:** a 404 on `/` from the deployment's *own* URL is a project-settings problem,
never an alias or DNS problem. Check Framework Preset first. (On the pilot run this was misdiagnosed
as an alias-ownership issue and a whole false root cause was built around `vercel domains ls` not
listing the alias — it never lists auto-generated `.vercel.app` aliases, so its absence proves
nothing. The alias was working the entire time.)

### Function region — match it to the database

A new project defaults to `iad1` (Washington DC). If the Neon project is in
`aws-ap-southeast-1`, every query then crosses the Pacific twice. No CLI flag; use the API:

```bash
TOKEN=$(node -e "console.log(require('<vercel-cli-config>/auth.json').token)")
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"serverlessFunctionRegion":"sin1"}' \
  "https://api.vercel.com/v9/projects/<project-id>?teamId=<team-id>"
```

The CLI's own token lives in its config dir (`auth.json`) — on Windows,
`%APPDATA%\xdg.data\com.vercel.cli\`. Use it for anything the CLI can't express; it's the same token
the CLI itself sends.

## 4. Production Branch (dashboard — do this BEFORE the next `main` push)

**Vercel → project → Settings → Git → Production Branch → `client/<name>`**

Until this is set, the defaults are exactly inverted from what branch-per-tenant needs: a push to
`main` deploys to the **client's production**, while pushes to `client/<name>` only make Previews.
On the pilot run this really happened (`production | git:main` in the deployment list) and was
harmless only because both branches were on the same commit at that moment.

Verify it flipped, rather than trusting the dashboard:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v6/deployments?projectId=<id>&teamId=<team>&limit=5" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{JSON.parse(d).deployments.forEach(x=>
console.log(String(x.target||'preview').padEnd(10),'|','git:'+(x.meta&&x.meta.githubCommitRef),'|',x.state))});"
```

Want: `client/<name>` → `production`, `main` → `preview`.

## 5. Deploy and verify

```bash
npx vercel --prod --yes    # CLI upload; bypasses the git trigger entirely
```

Note that a CLI `--prod` deploy proves nothing about branch tracking — it uploads local files
directly. To test the *real* path, push to `client/<name>` and confirm the resulting deployment's
target is `production` (previous step's command).

Smoke-check the live instance:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<project>.vercel.app/login"          # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<project>.vercel.app/api/auth/login" \
  -H "Content-Type: application/json" -d '{"password":"<admin-pw>"}'                    # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<project>.vercel.app/api/auth/login" \
  -H "Content-Type: application/json" -d '{"password":"wrong"}'                         # 401
```

Both `<project>.vercel.app` and `<project>-<org>.vercel.app` are auto-created and both work.

## 6. Ongoing: releasing to the client

```bash
git checkout client/<name>
git merge main
git push origin client/<name>      # this is the client's production deploy
```

Run it as an explicit step alongside each `preprod → main` promotion. It is deliberately manual —
that decision point is the entire reason the client branch exists, so resist automating it away. A
client branch **never** merges back into `main`.

## Passwords, afterwards

- **Staff/branch passwords** are rotatable in-app at `/admin/branches`, and the seed will never
  overwrite them (`prisma/seed.ts` upserts the branch credential with `update: {}`).
- **The admin password is not changeable in-app.** The seed re-hashes it from `SEED_ADMIN_PASSWORD`
  on *every* deploy, so rotation = change the Vercel env var (both scopes) and redeploy. A direct
  SQL/DB change works until the next deploy, then silently reverts — `ISSUE-6`/`ISSUE-11`.
- Both must stay distinct. Login is password-only and compares the submitted password against every
  credential row, first bcrypt match winning — identical passwords misroute logins (`INV-15`,
  `ISSUE-22`). The in-app branch rotation checks for collisions; **the seed path does not.**
