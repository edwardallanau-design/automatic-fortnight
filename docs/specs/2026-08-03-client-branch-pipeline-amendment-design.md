# Client-branch deployment pipeline — amendment to the dev/preprod/prod design

**Date:** 2026-08-03 · **Status:** Decided, in effect — **except the `preprod` stage, retired 2026-08-04**

> **Partially superseded.** The client-branch decisions below (branch-per-tenant, db-per-tenant, manual `main → client/<name>` promotion, never merging back) all still hold. Only the *internal* pipeline shown in this doc's diagram has changed: `preprod` was retired, so it now reads `dev → main`, and every "alongside each `preprod → main` promotion" below means "alongside each promotion to `main`". See `docs/specs/2026-08-04-retire-preprod-environment-design.md`.

**Amends:** `docs/superpowers/specs/2026-07-08-dev-preprod-prod-pipeline-design.md` §4 ("Multi-client (recorded, not built)") — that file is a frozen archive per `CLAUDE.md` and is not edited directly; this doc supersedes its §4 for the multi-client shape.
**Related:** `docs/design/03-tenancy-model.md` (rewritten 2026-08-03, same trigger) · `BUILD_STATUS.md`.

## What changed

The 2026-07-08 pipeline design recorded a not-yet-built plan for a second client: a new Vercel project + new Neon database, both tracking `main` directly, with "no fork, no per-client branch, no code divergence." When the first real pilot client (`kapeadri`) actually needed deploying, that plan was reconsidered and changed: **each client instance tracks its own long-lived branch (`client/<name>`), not `main` directly.** The database-per-tenant half of the original plan is unchanged and now actually built.

## Why

A dedicated client instance is a real restaurant's live service, not another internal pre-prod check. Wiring its Vercel project straight to `main` means every `preprod → main` promotion (the vendor's own release moment) simultaneously redeploys a specific paying client mid-service, with no space for a deliberate "does this specific client actually want this today" decision. A branch boundary creates that decision point; direct-`main` tracking does not.

## The shape

```
feature/* --PR, code review--> dev --direct merge, no PR--> preprod --direct merge, no PR--> main (prod, vendor's own instance)
                                                                                                |
                                                                                     merge main -> client/<name>
                                                                                     (manual, every promotion to main)
                                                                                                |
                                                                                     client/<name> (client's dedicated instance)
```

- **`main → client/<name>`** is a plain `git merge` (no PR — same rationale as `dev→preprod`/`preprod→main`: the code already went through review to reach `main`), done as an explicit extra step alongside every `preprod → main` promotion. Not a separate schedule, not automatic — a human decides each time whether this client should get this release now.
- **`client/<name>` never merges back into `main`.** Anything built or fixed against a client's real usage that turns out to be broadly useful gets re-implemented against `main`'s own state (a fresh PR off `dev`), not cherry-picked backward. This keeps `main`'s history free of client-specific detours.
- **Database isolation is unchanged from the original 2026-07-08 plan**: each client gets its own Vercel project and its own Neon database, differentiated by environment variables (branding, `DATABASE_URL`, `AUTH_SECRET`, `SEED_*` credentials). No shared schema, no tenant column.
- The internal `dev`/`preprod`/`main` pipeline is otherwise **unaffected** — this only adds a branch (and a manual promotion step) downstream of `main`, once per client.

## Accepted cost

A client branch can silently drift behind `main` if the `main → client/<name>` step is skipped on some promotions. Mitigated by making it a checklist line on every `preprod → main` promotion rather than a separately-scheduled task with its own cadence to forget — but this is a real, accepted risk, not a solved one. Revisit if client-branch count grows past a handful (see `03-tenancy-model.md`'s invalidation note) — at that point manual per-branch promotion likely needs to become tooling-assisted (a release train, or scripted fan-out) rather than a human doing it once per client per release.
