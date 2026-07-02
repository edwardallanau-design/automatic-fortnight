# Digital Menu & Ordering — CLAUDE.md

**Operating loop.** Pull the next story from `07-epic-map.md` → load the context-package docs it references → implement the one vertical slice → verify against its acceptance criteria → stop.

**Context-package index.**
- Intent & constraints (mode, hypothesis, kill criteria) → `01-intent-and-constraints.md`
- Domain model (entities, invariants, state machines) → `02-domain-model.md`
- Tenancy → `03-tenancy-model.md`
- Architecture & ADRs → `04-architecture.md`
- API conventions → `05-api-conventions.md`
- Engineering principles (universal, never edited) → `06a-engineering-principles.md`
- Engineering decisions (this system's stack/contract choices) → `06b-engineering-decisions.md`
- Epic map & stories → `07-epic-map.md`

**Stop rules (ask before doing).**
- Touching anything in `02-domain-model.md`'s invariants or state machines — these are one-way doors.
- Changing the tenancy strategy in `03-tenancy-model.md`.
- Any schema migration that changes existing columns/types (additive migrations are fine to proceed with).
- Anything irreversible: deleting data, force-pushing, dropping tables.
- Deviating from an ADR in `04-architecture.md` — propose a new ADR instead of silently contradicting one.

**Definition of done.** Tests pass (per `06b` §7 test stack) · story's acceptance criteria met · scope boundary respected (no out-of-scope files touched) · code conforms to `06a-engineering-principles.md` + `06b-engineering-decisions.md`.

**Gotchas.** *(grows as the build surfaces real traps — empty for now.)*
