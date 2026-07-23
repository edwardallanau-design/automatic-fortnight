# Domain Docs

How the engineering skills should consume this repo's domain documentation.

Layout: **single-context**. But the docs are not at the default paths — this project keeps a numbered
"context package" under `docs/design/`, which predates these skills and is wired into `CLAUDE.md`'s
operating loop. There is no root `CONTEXT.md` and no `docs/adr/` directory, and none should be created:
they would split the source of truth.

## Before exploring, read these

Read the ones relevant to the area you're about to work in — not all of them, every time.

| Skill expects | Read this instead | Contents |
|---|---|---|
| `CONTEXT.md` (glossary, entities) | `docs/design/02-domain-model.md` | Entities, invariants (`INV-N`), state machines |
| `docs/adr/` | `docs/design/04-architecture.md` | ADRs inline as `**ADR-NNN: title**` blocks, after the architecture overview |
| — | `docs/design/01-intent-and-constraints.md` | Mode, hypothesis, kill criteria, explicit non-goals |
| — | `docs/design/03-tenancy-model.md` | Tenancy strategy (branches, ordering points) |
| — | `docs/design/05-api-conventions.md` | Route shapes, the error envelope, status codes |
| — | `docs/design/06a-engineering-principles.md` | Universal principles — never edited |
| — | `docs/design/06b-engineering-decisions.md` | This system's stack and contract choices |
| — | `docs/design/07-epic-map.md` | Epics and numbered stories |

Unlike the skills' default posture, these files **do** exist and are not optional background. An
invariant in `02-domain-model.md` or an ADR in `04-architecture.md` is binding on your output.

## Use the domain model's vocabulary

When your output names a domain concept — an issue title, a refactor proposal, a hypothesis, a test
name — use the term as defined in `docs/design/02-domain-model.md`. Don't drift to synonyms.

If the concept you need isn't there yet, that's a signal: either you're inventing language the project
doesn't use (reconsider), or there's a real gap (note it for `/domain-modeling`).

## Where `/domain-modeling` writes

Into the existing files, not new ones:

- A **new or sharpened term** → the entity/glossary section of `docs/design/02-domain-model.md`.
- A **new decision** → a new `**ADR-NNN: title**` block appended to the ADR section of
  `docs/design/04-architecture.md`, continuing the existing numbering.

## Flag conflicts — don't silently override

`CLAUDE.md` makes these stop rules, so this is stricter than "surface it explicitly":

- **Invariants and state machines** in `02-domain-model.md` are one-way doors. Ask before touching one.
- **Tenancy strategy** in `03-tenancy-model.md`. Ask before changing it.
- **ADRs** in `04-architecture.md`. Never silently contradict one — propose a *new* ADR that supersedes
  it, and get agreement first.

Phrase a conflict you've found like this, then stop and wait:

> _Contradicts ADR-003 (shared role-based credentials) — but worth reopening because…_
