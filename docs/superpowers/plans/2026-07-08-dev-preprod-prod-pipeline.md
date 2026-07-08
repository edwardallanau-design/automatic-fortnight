# Dev/Preprod/Prod Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `dev` and `preprod` as long-lived branches with stable Vercel-assigned domains, sitting upstream of the existing `main` production deploy, and document the new promotion workflow so future sessions follow it.

**Architecture:** No application code changes. Two new git branches cut from `main`, two Vercel domain assignments (owner-executed), and documentation of the promotion flow in `CLAUDE.md` (durable process convention) and `BUILD_STATUS.md` (environment URLs, matching how the existing Deployment section already records the production URL).

**Tech Stack:** Git / GitHub / Vercel (Hobby plan — branch-to-domain assignment, no Custom Environments feature).

## Global Constraints

- Per-environment database isolation (a Neon branch per environment) is explicitly **out of scope** — spec's deferred-items list. `dev`, `preprod`, and feature-branch previews continue sharing the single production Neon database exactly as today. No task in this plan may create a new Neon branch or change `DATABASE_URL` scoping.
- Multi-client/multi-tenant support is explicitly **out of scope** — spec's deferred-items list. No task in this plan may modify `03-tenancy-model.md` or add any tenant-scoping code.
- Promotion `dev`→`preprod` and `preprod`→`main` is a **direct merge, no PR** — spec Section 3. Feature branches PR into `dev` (not `main`) going forward.
- `main`'s Vercel "Production Branch" setting and its existing domain (`automatic-fortnight-lyart.vercel.app`) are unchanged.
- `vercel.json`'s `buildCommand` (`npm run vercel-build`) already applies to every branch's build — no build-config change needed for `dev`/`preprod` to run migrate+seed+build the same way production does.

---

## File Structure

| File | Change |
|---|---|
| `CLAUDE.md` | Add a **Deployment pipeline** section documenting the three branches, their URLs, and the promotion workflow — this is a durable process convention, the same category as the existing "Operating loop" and "Stop rules" sections. |
| `BUILD_STATUS.md` | Add an **Environments** subsection under the existing `## Deployment` heading, listing all three URLs — matches the existing pattern of recording the production URL there. |

No application code files change. No new branches' contents differ from `main` at creation time — they're pure git refs.

---

### Task 1: Create and push the `dev` and `preprod` branches

**Files:** none (git refs only).

**Interfaces:**
- Consumes: current `main` (must be up to date — this branch's own work should be merged/pushed to `main` first, or `dev`/`preprod` are cut from whatever `main` is at execution time).
- Produces: `dev` and `preprod` branches on `origin`, both initially identical to `main`, needed by Task 2 (Vercel domain assignment) and Task 3 (verification).

- [ ] **Step 1: Confirm `main` is current**

```bash
git fetch origin
git log --oneline origin/main -1
```

Note the commit SHA — this is what `dev` and `preprod` will start from.

- [ ] **Step 2: Create and push `dev`**

```bash
git checkout -b dev origin/main
git push -u origin dev
```

Expected: `git push` reports a new branch `dev` created on `origin`.

- [ ] **Step 3: Create and push `preprod`**

```bash
git checkout -b preprod origin/main
git push -u origin preprod
```

Expected: `git push` reports a new branch `preprod` created on `origin`.

- [ ] **Step 4: Verify both branches exist on GitHub and match `main`**

```bash
git log --oneline -1 origin/main
git log --oneline -1 origin/dev
git log --oneline -1 origin/preprod
```

Expected: all three commands print the same commit SHA.

No commit step here — this task only creates branches, it doesn't change file content. Proceed to Task 2.

---

### Task 2: Assign stable Vercel domains to `dev` and `preprod`

**Owner-executed** (Vercel dashboard — account-level action, no credentials available to Claude).

**Files:** none.

**Interfaces:**
- Consumes: the `dev`/`preprod` branches pushed in Task 1 (Vercel needs to see the branch exist before it can be assigned a domain — it will already have auto-deployed a normal preview for each once pushed).
- Produces: two stable, non-ephemeral URLs, needed by Task 3's verification.

- [ ] **Step 1:** In the Vercel dashboard, go to the project → Settings → Domains → Add.
- [ ] **Step 2 (corrected — see the design spec's Correction note; no "Assign to a Git Branch" picker exists on Hobby):** Add `automatic-fortnight-dev.vercel.app` (or the next available name if taken — Vercel's `*.vercel.app` subdomains are global, not per-project) from the `dev` branch's own deployment page (not the generic project-level Domains screen), choosing "Preview" as the environment. Assigning it from that specific deployment's page is what pins it to `dev` — verified empirically via a marker-file test.
- [ ] **Step 3:** Repeat Step 2 for `automatic-fortnight-preprod.vercel.app`, from the `preprod` branch's own deployment page.
- [ ] **Step 4:** If either desired subdomain name is already taken by another Vercel user, choose an available variant (e.g. append a short suffix) and note the actual URL used — it's needed verbatim in Task 3 and Task 4. If domain isolation is ever in doubt, Vercel's auto-generated per-branch alias (`automatic-fortnight-git-<branch>-edwardallanau-designs-projects.vercel.app`) is a guaranteed-correct fallback with no setup required.

---

### Task 3: Verify both environments build and are reachable

**Shared.** Claude drives the API-level checks via `curl`; the owner confirms the domain assignment took effect (DNS/edge propagation on `*.vercel.app` subdomains is typically near-instant but can take a few minutes).

**Files:** none.

**Interfaces:**
- Consumes: the two URLs from Task 2 (owner supplies the actual URLs used, in case Step 4 above required a variant name).
- Produces: pass/fail confirmation gating Task 4 (don't document a promotion workflow pointing at URLs that don't actually work).

- [ ] **Step 1 (Claude): verify the `dev` domain serves the app**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<dev-url>/
```

Expected: `200`.

- [ ] **Step 2 (Claude): verify the `preprod` domain serves the app**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<preprod-url>/
```

Expected: `200`.

- [ ] **Step 3 (Claude): confirm both are running the same build as production, not a stale one**

```bash
curl -i -s -X POST https://<dev-url>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"definitely-wrong"}'
curl -i -s -X POST https://<preprod-url>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"definitely-wrong"}'
```

Expected: both return `401` with the `{"error":"INVALID_CREDENTIAL",...}` envelope — proves the `vercel-build` pipeline (migrate + seed + build) ran successfully on both branches, the same way it did for production in the first deployment plan.

- [ ] **Step 4:** If either check fails, stop and diagnose from the Vercel build log before proceeding to Task 4 — do not document a workflow around a broken environment.

---

### Task 4: Document the pipeline in `CLAUDE.md` and `BUILD_STATUS.md`

**Files:**
- Modify: `CLAUDE.md`
- Modify: `BUILD_STATUS.md`

**Interfaces:**
- Consumes: a passing Task 3, and the actual URLs used (may differ from the plan's placeholder names per Task 2 Step 4).
- Produces: durable documentation future sessions read before touching branches — per `CLAUDE.md`'s own instruction that process conventions live there, not just in a one-off spec doc.

- [ ] **Step 1: Add a Deployment pipeline section to `CLAUDE.md`**

Insert this new section after the existing "Maintaining ISSUES.md" paragraph and before "Stop rules" (`CLAUDE.md` currently has, in order: Operating loop → Context-package index → Maintaining BUILD_STATUS.md → Maintaining ISSUES.md → Stop rules → Definition of done → Gotchas):

```markdown
**Deployment pipeline.** Three long-lived branches, each with a stable Vercel domain:
- `main` (production) → `automatic-fortnight-lyart.vercel.app`
- `preprod` (final check before release) → `<actual preprod URL from Task 2>`
- `dev` (integration branch for in-progress work) → `<actual dev URL from Task 2>`

New work branches off `dev` and PRs back into `dev` (not `main`). Promoting `dev` → `preprod` and `preprod` → `main` is a direct merge and push, no PR required — the code was already reviewed when it landed on `dev`. Design: `docs/superpowers/specs/2026-07-08-dev-preprod-prod-pipeline-design.md`.

`dev`, `preprod`, and feature-branch previews all share the single production Neon database (per-environment DB isolation is a known, deliberately deferred gap — see that spec's "Backlog" note). Don't treat data on `dev`/`preprod` as disposable-and-isolated; it's the same database production reads from.
```

- [ ] **Step 2: Add an Environments subsection to `BUILD_STATUS.md`**

Find the existing `## Deployment` section (it currently ends with the line starting "Live at `https://automatic-fortnight-lyart.vercel.app/`..."). Add immediately after that line:

```markdown

**Environments.**
- Production: `https://automatic-fortnight-lyart.vercel.app/` (branch `main`)
- Preprod: `https://<actual preprod URL from Task 2>/` (branch `preprod`)
- Dev: `https://<actual dev URL from Task 2>/` (branch `dev`)

Promotion workflow and rationale: `docs/superpowers/specs/2026-07-08-dev-preprod-prod-pipeline-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md BUILD_STATUS.md
git commit -m "Document dev/preprod/prod pipeline and promotion workflow"
```

---

## Self-Review Notes

- **Spec coverage:** branch creation + stable domains (Tasks 1–2) · build/reachability verification (Task 3) · promotion workflow documented durably (Task 4, split across `CLAUDE.md` for process convention and `BUILD_STATUS.md` for environment URLs, matching each file's existing established purpose). The spec's two deferred items (DB isolation, multi-client) are called out in Global Constraints as explicit non-goals for every task, and Task 4's `CLAUDE.md` text carries the DB-sharing caveat forward so it isn't silently forgotten once this plan is executed.
- **Placeholder scan:** the only bracketed values (`<dev-url>`, `<preprod-url>`, `<actual ... URL from Task 2>`) are runtime substitutions filled in from Task 2's real output, not unresolved plan content — Task 2 Step 4 explicitly anticipates the domain name might need to vary from the plan's suggested name.
- **Type/name consistency:** branch names (`dev`, `preprod`, `main`) and the `vercel-build` pipeline reference are used identically to the design spec and the earlier production-deployment plan.
