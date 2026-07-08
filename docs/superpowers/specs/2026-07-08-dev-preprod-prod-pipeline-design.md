# Dev → Preprod → Prod Deployment Pipeline — Design

**Status.** Approved, ready for planning.
**Related.** `docs/superpowers/specs/2026-07-08-production-deployment-design.md` (first production deploy) · `03-tenancy-model.md` · `BUILD_STATUS.md`

## Context

Production deployment exists (`docs/superpowers/specs/2026-07-08-production-deployment-design.md`), but the only branches in use are `main` and short-lived feature branches — every merge to `main` goes straight to production with no intermediate staging step. This design adds a `dev` and `preprod` stage in front of production.

A second, related idea was raised alongside this: eventually different restaurant clients might run their own instance of this app. `03-tenancy-model.md` explicitly defers multi-tenancy design until a second real client exists, and per `CLAUDE.md`'s stop-rules, changing the tenancy strategy needs an explicit ask-first, not a silent decision. No second client is confirmed, and no pilot restaurant is confirmed yet either (`BUILD_STATUS.md`'s open risk). So this design does not build multi-client support — it only records the intended future shape so today's pipeline choices don't box it out.

## Scope

**In scope:**
- Three long-lived branches: `dev`, `preprod`, `main` (production, unchanged).
- Stable Vercel-assigned domains for `dev` and `preprod` (not ephemeral per-commit preview links).
- A promotion workflow: feature branches PR into `dev`; `dev`→`preprod` and `preprod`→`main` are direct merges (no PR).

**Explicitly out of scope (deliberately deferred, not silently dropped):**
- **Per-environment database isolation.** `dev`, `preprod`, and ad-hoc feature-branch previews all continue sharing the single production Neon database, exactly as today. The better long-term shape — a Neon branch per environment (`production`/`preprod`/`dev`), wired via Vercel's per-branch-scoped environment variables — was discussed and deliberately not built this round. **Backlog:** revisit before `preprod` is trusted as a realistic pre-release check, since a shared DB means `preprod` testing can be polluted by `dev` activity and vice versa, and either can still touch real production data.
- **Multi-client / multi-tenant support.** Confirmed direction (not designed or built here): one shared codebase, N deployments — each future client gets its own Vercel project + Neon database, all tracking `main`, differentiated only by environment variables/branding, with no code divergence between clients. This requires no changes to `03-tenancy-model.md` (each instance stays single-tenant) and no code changes today. Actual design work for this is deferred until a second real client exists, per `03-tenancy-model.md`'s own stated trigger.
- Branch protection rules on `dev`/`preprod`/`main` (a GitHub admin/dashboard setting, not something to script here).
- Any CI (GitHub Actions or similar) — Vercel's existing GitHub integration already auto-builds every pushed branch; nothing new is needed for this scope.

## Design

### 1. Branches and stable URLs

Three long-lived branches, each with a fixed Vercel domain assignment (Project Settings → Domains → Add → "Assign to a Git branch"):

| Branch | Purpose | Domain |
|---|---|---|
| `main` | Production | `automatic-fortnight-lyart.vercel.app` (existing, unchanged) |
| `preprod` | Final check before release | `automatic-fortnight-preprod.vercel.app` |
| `dev` | Integration branch for in-progress work | `automatic-fortnight-dev.vercel.app` |

Feature branches keep Vercel's normal ephemeral per-commit preview link — unaffected by this change.

**Correction (verified during execution):** Vercel Hobby's "Add Domain" dialog offers only Production/Preview, with no explicit "assign to Git branch" picker. Despite that, assigning a domain from a specific branch's deployment page does pin it to that branch — verified empirically by pushing a marker file to `dev` only and confirming it 404s on the `preprod` URL. Also: all non-Production deployments are behind Vercel's Deployment Protection (SSO wall) by default; this was disabled project-wide for Preview so `dev`/`preprod` are publicly viewable, matching production's access model. Vercel also auto-generates a permanent, unambiguous per-branch alias for every branch (`automatic-fortnight-git-<branch>-edwardallanau-designs-projects.vercel.app`) with no setup required — a safe fallback reference if the custom domains are ever reassigned by mistake.

### 2. Environment variables and build config

No new environment-variable scoping is needed this round, since `dev`/`preprod` share the existing Preview-scoped `DATABASE_URL`/`AUTH_SECRET`/`SEED_*` values that already apply to any non-production branch. Vercel's "Production Branch" project setting stays `main`. `vercel.json`'s `buildCommand` (from the first production deployment) applies to every branch's build the same way, so `dev`/`preprod` builds run the same `vercel-build` pipeline (migrate + seed + build) as production.

### 3. Promotion workflow

```
feature/* --PR, code review--> dev --direct merge, no PR--> preprod --direct merge, no PR--> main (prod)
```

- New work branches off `dev` and PRs back into `dev` (retargeted from `main`).
- Promoting `dev` → `preprod`: `git checkout preprod && git merge dev && git push`. No PR — `dev`'s code already went through review when it landed there.
- Promoting `preprod` → `main`: `git checkout main && git merge preprod && git push` once the `preprod` URL has been manually checked. This merge to `main` is the actual production release moment — Vercel's existing Production deploy fires automatically.

### 4. Multi-client (recorded, not built)

When a second real client is confirmed: create a new Vercel project + new Neon database, both tracking `main` (the same commit history every other instance runs), and differentiate only by environment variables (branding, `DATABASE_URL`, credentials). No fork, no per-client branch, no code divergence. `03-tenancy-model.md` is rewritten at that point as its own one-way-door decision if and when actual per-client isolation needs (beyond "separate deployment") surface — this design does not preempt that.
