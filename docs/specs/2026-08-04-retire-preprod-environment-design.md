# Retiring `preprod` — the three-environment pipeline

**Date:** 2026-08-04 · **Status:** Decided, in effect
**Amends:** `docs/superpowers/specs/2026-07-08-dev-preprod-prod-pipeline-design.md` (frozen archive per `CLAUDE.md`, not edited directly — this doc supersedes its `preprod` stage) and `docs/specs/2026-08-03-client-branch-pipeline-amendment-design.md` (whose diagrams show `dev → preprod → main`).
**Related:** `docs/design/03-tenancy-model.md` · `docs/agents/client-instance-provisioning.md` · `ISSUE-35`.

## What changed

The `preprod` branch, its Vercel alias, and the `dev → preprod → main` promotion step are **retired**. The pipeline is now:

```
feature/* --PR, squash merge--> dev --direct merge--> main (vendor's pristine reference instance)
                                                        |
                                             merge main -> client/<name>   (manual, per release, per client)
                                                        |
                                             client/<name> (the client's real production)
```

- **`dev`** — integration and testing. Feature branches still branch off `dev` and squash-merge back into it.
- **`main`** — the pristine reference state of the app, and the vendor's own demo instance (`automatic-fortnight`). It is *not* where any real customer traffic lands.
- **`client/<name>`** — the actual production environments. Each real client's live service.

## Why

**`preprod` had stopped earning its keep.** It was introduced when `main` was the only production target and a staging gate was the sole protection before real traffic. Once the first pilot client moved onto its own dedicated branch + Vercel project + Neon database (2026-08-03), `main` itself became a non-customer-facing environment — so the pipeline had *two* consecutive non-production gates before the only branch that reaches a real restaurant. `preprod` was the redundant one.

**It was never a real environment anyway.** Vercel has exactly two tiers per project: Production (one branch) and Preview (everything else). Only `main` was Production in `automatic-fortnight`; `preprod` and `dev` were both just named Preview branches, sharing one env-var set and — per the 2026-07-08 design's accepted gap — *one shared Neon database*. So `preprod` provided neither config isolation nor data isolation from `dev`. It bought exactly one thing: a human checkpoint.

**That checkpoint has moved, not vanished.** This is the load-bearing point. `main` now inherits the "final check before a real client sees it" role that `preprod` held. The safety margin in the new shape comes from `main → client/<name>` being a deliberate manual merge — the decision point that `03-tenancy-model.md` calls the entire reason the client branch exists. **If that step is ever automated, the pipeline loses its last gate silently**, because nothing between a `dev` merge and a live restaurant would then involve a human.

## Consequences

- One fewer promotion per release: `dev → main`, then `main → client/<name>` per client.
- Branch protection and review expectations that applied at `preprod` now apply at `main`.
- The `automatic-fortnight` Vercel project keeps deploying `main` as its Production. It remains useful as a demo/sales instance and as a place to smoke-test a release *outside* any client's live service — which matters more now, not less, since it is the only such place left.

## Also fixed in the same pass: client-instance build isolation (`ISSUE-35`)

Removing `preprod` surfaced a more serious latent defect worth recording here, because it constrains how this pipeline may evolve.

`vercel git connect` subscribes a Vercel project to **every branch in the repo** — the Production Branch setting only decides which branch is *labelled* Production. So every internal branch push was triggering Preview builds in the pilot client's project. Since `vercel-build` runs `prisma migrate deploy && tsx prisma/seed.ts`, and a client instance points both its Production and Preview scopes at its single Neon database, **internal branch pushes were running migrations and the seed against a live client's production data.** Two such builds really ran; the client DB was verified intact afterward (see `ISSUE-35` for the full blast-radius check).

Fix: an `ignoreCommand` in `vercel.json` that gates builds on branch/project agreement — the internal project skips `client/*`, and a client project builds only `client/$VERCEL_PROJECT_NAME`. It is deliberately generic rather than naming `kapeadri`, so future clients inherit it.

**Standing constraint this implies:** deploy-trigger isolation is *not* automatic from the branch-per-tenant model. Adding a client gets you database isolation for free but build isolation only because of this gate. Any change to `vercel.json`, to the build command, or to how client projects connect to Git must preserve it.

**Known limitation:** the gate lives in the repo, so it only protects a client instance once `vercel.json` has reached that client's branch — from the next `main → client/<name>` promotion onward.

## What would invalidate this

- **A second client, or a team.** With more than one client branch or more than one person merging, `main` doing double duty as both "pristine reference" and "the thing every client is cut from" may warrant a real staging environment again — but per-environment *databases* (`B-20`) would be the prerequisite for that to mean anything, since the missing isolation was always the DB, not the branch.
- **Automating `main → client/<name>`.** As above: that step is the pipeline's last human gate. Automating it requires replacing the gate with something else (staged rollout, feature flags, per-client release approval), not simply removing it.
