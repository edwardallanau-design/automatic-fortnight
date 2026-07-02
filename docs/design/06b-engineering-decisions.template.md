# Engineering Decisions — Per-System Template

**The per-system half of artifact 6. Filled fresh for each system. Records the concrete choices that `engineering-principles.md` deliberately leaves open.**

The principles file is the universal, stack-neutral contract — reused verbatim, never edited. This file is where a specific system's answers live: the actual status codes, the real error envelope, the exception taxonomy, the test stack. Every section below instantiates a principle. The principle says *"a single consistent error shape must exist"*; this file says *what that shape is* for this system.

Copy this to `engineering-decisions.md` in the new repo and fill it. CLAUDE.md points the agent at both files.

---

## How to use

- **Fill each section.** Each carries the principle it instantiates (e.g. *Instantiates P5*) so you can see what rule you are making concrete.
- **Collapse by mode.** The full-grade shape shown in every section is a worked example, **not the floor**. In MVP/POC/Learning builds, most sections collapse to a sentence: a flat error shape, no formal taxonomy, two roles instead of six. Fill the minimum the build needs. Set the dial from artifact 1's declared mode.
- **Decide fresh — do not copy a shape verbatim.** The shapes below illustrate the *form* of a good answer so a blank is fillable. They are deliberately generic. Make this system's actual decision; do not inherit another system's answer because it was convenient.
- **Do not copy the principles in here.** This file holds only what is *specific* to this system. The universal rules stay in the principles file.

---

## The boundary — what is decided here vs elsewhere

This file owns the **code contract only**: the concrete instantiations of the code-level principles. It does **not** own — and must not duplicate — decisions that have their own artifacts. For those it carries a pointer, so the agent has a complete index without two sources of truth:

| Concern | Owned by | Here |
|---|---|---|
| Code contract (exceptions, logging, API shape, gateway, tests, authz placement) | **This file** | decided |
| Tenancy / isolation strategy | `tenancy-model.md` (artifact 3) | pointer only |
| Architecture topology, module decomposition & boundary rules | `architecture.md` (artifact 4) | pointer only |
| Domain model, entities, invariants | `domain-model.md` (artifact 2) | pointer only |

If a decision below starts to describe tenancy or module architecture, stop — it belongs in that artifact, and this file just links to it.

---

## 1. Stack

**Decide.** Languages, frameworks, and key libraries per layer. Grounds the stack-neutral principles in this system's concrete tools.

- Backend: `<language + framework + ORM/data layer + DB>`
- Frontend: `<framework + language + UI layer>`
- Infra / deploy: `<containerization + hosting + CI>`

> **▸ Shape.** Name the concrete tools per layer — e.g. a JVM stack (language + web framework + ORM + relational DB), or a TypeScript stack (runtime + web framework + query layer + DB), or a Python stack. Infra: a container runtime + a host + a CI runner. The principles are stack-neutral; this is the one place you ground them in what you are actually building, so it is also the section most likely to differ in a Learning build that picks an unfamiliar stack on purpose.

---

## 2. Layer names — *Instantiates P1 (layered ownership)*

**Decide.** What P1's three layers are *called* in this system, and what each owns. P1 mandates the separation; this names the concrete layers.

- Boundary (transport): `<e.g. controller / handler / route>`
- Logic (business rules): `<e.g. service>`
- Persistence (storage): `<e.g. repository / store / DAO>`
- Cross-cutting location: `<where filters, events, exception types live>`

> **▸ Shape.** A common naming: boundary = `controller`/`handler`/`route`, logic = `service`, persistence = `repository`/`store`. Cross-cutting (filters, events, exception types, validation) lives in one shared location, never scattered. Pick the names your stack conventionally uses and apply them uniformly so every module looks the same.

---

## 3. Exception taxonomy — *Instantiates P2 (exception contract)*

**Decide.** The concrete exception hierarchy, the category→status mapping, the naming convention, and where the single handler lives. P2 mandates translate-at-one-boundary / log-at-one-place; this defines the actual types.

- Root type: `<abstract base, checked or unchecked>`
- Category parents → status: `<e.g. NotFound→404, Validation→400, Conflict→409, Forbidden→403>`
- Naming convention: `<e.g. {Entity}{Condition}>`
- Single handler location: `<where the one global handler lives>`

> **▸ Shape.** A typical full-grade form: one abstract root domain error; category parents each mapped to a status — not-found→404, invalid→400, conflict→409, forbidden→403; a naming convention like `{Entity}{Condition}` so the type name reads as the failure; one global handler that logs once and maps to the response.
>
> *Collapsed (MVP/POC):* one base error + a catch-all handler that maps by a small status field. No category tree until the surface grows.

---

## 4. Logging format — *Instantiates P3 (logging contract)*

**Decide.** The format, the request-scoped context fields injected by infrastructure, and the per-call fields. P3 mandates one-owner-per-event / never-log-secrets; this defines the shape.

- Format + transport: `<e.g. structured JSON via the logging framework>`
- Context fields (injected by filter/middleware, never by leaf code): `<e.g. trace_id, user_id, endpoint>`
- Per-call fields: `<success-side and handler-side>`
- Severity convention: `<success / rejection / failure ownership>`

> **▸ Shape.** Full-grade: structured (JSON) logs; request-scoped context (a trace/correlation id, the user id, the endpoint) injected once by a filter/middleware and never set in leaf code; per-call fields added at the logic layer (entity id, operation) and at the handler (error type, error code); the logic layer logs success and rejection, the handler owns failure logging. Never logged: passwords, tokens, keys, raw queries, full payloads, PII.
>
> *Collapsed (MVP/POC):* plain lines, one on success, one on failure, in the right layer. Never log secrets — that part does not collapse.

---

## 5. API contract — *Instantiates P5 (contract consistency)*

**Decide.** The method→status table, the one success shape, the one error shape, pagination, field naming, versioning. P5 mandates *a single consistent contract*; this is its content.

- Method → status table: `<create / replace / partial-update / fetch-one / fetch-collection / delete>`
- Success response shape: `<bare DTO? envelope? what exactly>`
- Error response shape: `<the one error envelope>`
- Pagination shape: `<the list-response type>`
- Field naming: `<camelCase / snake_case>`
- Versioning policy: `<none / path segment / header>`

> **▸ Shape.** A REST contract, full-grade:
> Method→status: create→201+body · full-replace→200+body · partial-update→200+body · fetch-one→200 or 404 · fetch-collection→200+array (never 404) · delete→204 always.
> Success: a bare resource DTO or a typed list/page object — pick one and use it everywhere; no mixing.
> Error: one envelope — e.g. `{ code, message, traceId, timestamp }` — used for every error.
> Pagination: one list-response type carrying items + page metadata. Field naming and versioning: pick one of each and hold it.
>
> *Collapsed (MVP/POC):* the method→status table still holds (cheap correctness); the error shape can be a flat `{ error, message }` and pagination can wait until a list is actually large.

---

## 6. Boundary gateway & shared types — *Instantiates P6 / P7*

**Decide.** The single typed wrapper for cross-boundary calls, where cross-cutting concerns sit, and where shared types live. P6 mandates one chokepoint with no raw calls in leaves; P7 mandates typed boundaries with shared types defined once.

- Outbound wrapper: `<name + location of the one client/fetch wrapper>`
- Typed error it throws: `<the one error type + its fields>`
- Cross-cutting handled in the wrapper (not per-call): `<e.g. auth refresh, retries>`
- Shared types location: `<the one place response/request shapes live>`

> **▸ Shape.** Full-grade: every outbound call routes through one typed client wrapper that returns typed data on success and throws one typed error (carrying code, message, correlation id, status) otherwise. Cross-cutting concerns (auth refresh, retries) live in the wrapper, handled once — never per call. Shared request/response types live in one location, imported where needed; no untyped escape hatches at the boundary.
>
> *Collapsed (MVP/POC):* still one wrapper function even if thin, still no raw calls in leaves. The single chokepoint is cheap and saves the rewrite when the boundary changes.

---

## 7. Test stack — *Instantiates P8 (one concern, one layer)*

**Decide.** The concrete tool for each layer of the ownership split. P8 mandates *each concern tested once at its owning layer*; this names the tools.

- Logic-layer unit (domain rules): `<tool>`
- Integration (contract / boundary / authz / isolation): `<tool>`
- Boundary-call unit (wrapper shape): `<tool>`
- End-to-end (one happy path / story): `<tool>`

> **▸ Shape.** Pick one tool per layer of the ownership split: a unit-test runner for logic-layer rules; an integration harness (real DB, e.g. via containers) for contract/boundary/authz/isolation; a component or wrapper test tool for the client boundary; an end-to-end driver for one happy path per story (auth step included, no re-testing of the authz matrix).
>
> *Collapsed (MVP/POC):* logic-layer unit tests on what matters + one happy-path end-to-end; skip the full boundary matrix. *Learning:* test the subsystem being learned thoroughly; little else.

---

## 8. Authorization placement & roles

**Decide.** *Where* authority checks live (the invariant: exactly one place, never inline in transport or logic) and *which* roles exist. The centralization is principle-shaped; the role set is per-system.

- Authority-check location: `<the single place all checks live>`
- Hard rule: no inline authority checks in transport or logic code — confirm.
- Role set: `<the roles, and their scope>`

> **▸ Shape.** Full-grade: all authority rules live in one place (a single security configuration), with no inline authority checks scattered in transport or logic code. Roles: a small set scoped appropriately — e.g. a platform-level admin plus a handful of tenant-scoped roles; record the permission detail in one matrix.
>
> *Collapsed (MVP/POC):* often two roles or none. Centralization still holds — wherever checks live, they live in one place, never scattered inline.

---

## 9. Pointers — decided in other artifacts, linked here

Do not fill these in; link them. They are owned elsewhere and duplicating them here creates a second source of truth.

- **Tenancy / isolation:** `<→ tenancy-model.md>` *(artifact 3)*
- **Architecture topology & module boundary rules:** `<→ architecture.md>` *(artifact 4)*
- **Domain model & invariants:** `<→ domain-model.md>` *(artifact 2)*

> **▸ Shape.** Link, don't restate. E.g. *Tenancy:* `<the strategy>` → see `tenancy-model.md`. *Module boundaries:* `<the cross-module reference rule>` → see `architecture.md`. These are decided in their own artifacts; this file only references them so the agent has one complete map with no second source of truth.

---

## Closing — why this split exists

The principles file and this file are deliberately separated because they change at different rates. The principles are a one-way door: written once, reused across every system, never edited. This file is re-decided every system. Keeping them apart is what lets you reuse the stable contract without dragging one system's specific answers into the next — the same stable-vs-volatile discipline the playbook applies everywhere else.

Filling this file is the act of producing artifact 6 for a system: principles taken as-is, decisions made fresh, dial set from the mode. Once it is filled and CLAUDE.md points at both, every story is built against a complete, consistent code contract without re-specifying it per prompt.
