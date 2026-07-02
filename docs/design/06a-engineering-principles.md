# Engineering Principles

**The universal quality contract. Stack-neutral, mode-neutral, reused verbatim across every system you build.**

This is the reusable core of the playbook's **artifact 6 (Engineering Standards)**. It pairs with `engineering-decisions.template.md` — the per-system decision form where you record *this* system's tenancy strategy, error-envelope shape, exception taxonomy, auth model, and stack. Together those two files *are* artifact 6. This file never changes between projects. The decisions file is filled fresh for each one.

CLAUDE.md points the agent at both. The agent obeys these principles on every story without being re-told, and conforms to the decisions file for the choices this file deliberately leaves open.

---

## Why these are stated the way they are

A standard an agent cannot mechanically check is not a standard — it is an essay. So every principle below is written as an **invariant about ownership, boundaries, and contracts**, because those are the things that stay both *portable across stacks* and *binary to check*. "The HTTP layer contains no business logic" is enforceable in Spring, Express, Go, or Django without naming a framework. "Use good structure" is not enforceable anywhere.

Each principle has four parts:

- **Invariant** — the rule, framed so it holds in any language.
- **Check** — what a reviewer (human or agent) mechanically looks for to pass or fail it. This is the enforceable form. Use it as a review checklist.
- **Illustration** — one or two concrete instantiations, **marked swappable**. These are examples, not the rule. Replace them with your stack's equivalent.
- **Dial** — whether this is a **Floor** (never relaxes, holds in every build) or **Scales** (tightens toward production, relaxes toward Learning/POC).

### The dial and the three modes

Floor principles apply identically in Learning, POC, and Product builds — they are the non-negotiable base. Scaling principles relax toward the Learning/POC end and tighten toward production. One override sits above the dial: **in Learning mode, whatever you are there to learn gets Full rigor regardless of its dial**, because that subsystem is the one-way door of that build. Everything else collapses to the floor.

---

## P1 — Layered ownership (Separation of Concerns)

**Invariant.** Each layer owns exactly one kind of work and does not perform another layer's. The boundary layer (HTTP, CLI, message handler) owns transport only. The logic layer owns business rules only. The persistence layer owns storage only. Work does not migrate across these lines.

**Check.** Open any boundary-layer unit (controller, handler, route). Does it contain branching business logic, validation rules, or direct persistence calls? → violation. Open any persistence unit. Does it contain business decisions? → violation. Business logic lives in exactly one layer and the others delegate to it.

**Illustration** *(swap per stack).* Spring: `@RestController` parses the request and calls a service; the service holds the rules; the repository holds queries. Express: the route handler validates shape and calls a service module; no `if (user.role === ...)` business branching in the handler. Same shape in Go (handler → service → store) or Django (view → service → manager).

**Dial.** **Floor.** A two-file toy still separates transport from logic, because collapsing them is what makes code unmaintainable at *any* size. This one never relaxes.

---

## P2 — The exception contract

**Invariant.** Infrastructure failures are caught and translated into meaningful domain errors at exactly **one** boundary — the layer that owns business meaning. Errors are logged at exactly **one** place. Lower layers never catch-log-and-rethrow. Raw infrastructure exceptions never reach the caller of a public operation, and never reach the client.

**Check.** Search for catch blocks that log and then rethrow → violation (the error will be logged twice). Search for the same error logged in more than one layer → violation. Confirm a single translation point converts infrastructure exceptions (DB, IO, network) into domain errors. Confirm no raw stack trace, SQL, or internal exception type is returned to the client.

**Illustration** *(swap per stack).* Spring: the service catches `DataIntegrityViolationException` and throws a concrete domain exception; a single `@RestControllerAdvice` logs once and maps to a response. Node: a repository rejects with the driver error; a service maps it to a typed `DomainError`; one error-handling middleware logs and responds. Go: the store returns a wrapped error; the service translates with `errors.Is`; one top-level handler logs and writes the response.

**Dial.** **Scales.** *Full:* a formal exception hierarchy with category parents and a dedicated global handler. *MVP/POC:* translate at the boundary and route everything through one catch-all handler — no elaborate taxonomy needed. *Floor within it:* never log the same error twice, and never leak infrastructure detail to the client. That part holds at every scale.

---

## P3 — The logging contract

**Invariant.** Every log event has exactly one owner. Business outcomes are logged once, at the layer that owns the outcome (success and rejection). Failures are logged once, by the single error handler. Secrets, credentials, tokens, raw payloads, and personal data are never logged — reference entities by ID.

**Check.** Is any business outcome logged in two layers? → violation. Does logic-layer code log at error severity for something that is actually an exception the handler will see? → violation (double logging). Grep the diff for anything that could emit a password, token, key, full request body, or PII into a log line → violation, no exceptions.

**Illustration** *(swap per stack).* The logic layer emits one info line on success with the entity ID and operation, one warning on a rejected business rule. The error handler emits one error line with type and code. The transport layer attaches request-scoped context (trace ID, user ID) once, via a filter/middleware — leaf code never re-attaches it.

**Dial.** **Scales.** *Full:* structured JSON, request-scoped context fields injected by infrastructure, per-field discipline. *MVP/POC:* a line on success, a line on failure, in the right place, plain format is fine. *Floor within it:* never log secrets or PII. That is absolute in every mode, including a throwaway.

---

## P4 — Fail fast

**Invariant.** Inputs and preconditions are validated at the earliest boundary that can see them, and rejected immediately. Code never proceeds on known-bad state in the hope of handling it later. There is no silent accumulation of failures.

**Check.** Trace an invalid input through the system. Is it rejected at the first layer that could detect it, or does it travel deep before failing? → if deep, violation. Look for code that swallows a bad result and continues → violation. A precondition that must hold is asserted before the work, not discovered during it.

**Illustration** *(swap per stack).* Validate request shape at the transport edge; validate business preconditions as the first act of the logic-layer method, throwing before any side effect. Never `try { ... } catch { /* ignore */ }` around something that changes state.

**Dial.** **Floor.** Proceeding on bad state is a bug at every scale. A learning build that swallows errors teaches you nothing except how to debug silently corrupted state. Never relaxes.

---

## P5 — Contract consistency at the boundary

**Invariant.** A single, documented contract governs the public surface: method semantics, status/result codes, success-response shape, and error-response shape. Success responses share **one** shape used everywhere. Errors share **one** shape used everywhere. The specific shapes are a per-system decision; the *existence of a single consistent contract* is the invariant.

**Check.** Do two endpoints return success in two different envelope structures? → violation. Do errors come back in more than one shape? → violation. Is the same logical operation expressed with inconsistent verbs or status codes across the surface? → violation. (The *content* of the contract — which codes, which envelope — is checked against `engineering-decisions.template.md`, not here.)

**Illustration** *(swap per stack).* REST: create returns the created resource with a created-status; fetch-missing returns not-found; delete is idempotent; collections return an empty list, never a not-found. The exact envelope (`{ data }` vs bare DTO) and pagination shape are recorded once in the decisions file and never vary after. The same discipline applies to a GraphQL schema or an RPC interface — pick the conventions once, obey them everywhere.

**Dial.** **Scales.** *Full:* a complete documented contract table, a dedicated pagination type, a formal error envelope. *MVP/POC:* choose one success shape and one error shape and use them without exception. *Floor within it:* consistency itself. Two shapes for the same kind of thing is never acceptable, even in a POC — inconsistency is what makes a surface unlearnable.

---

## P6 — One typed gateway for crossing a boundary

**Invariant.** All calls that cross a process boundary — client to API, service to external system — pass through a single typed wrapper. Leaf code never makes raw, ad-hoc cross-boundary calls. The wrapper returns a typed result and surfaces failures as one typed error.

**Check.** Grep leaf code (components, individual modules) for raw cross-boundary calls — a bare `fetch`, a direct HTTP client instantiation, an inline SDK call. → violation. Every such call should route through the one wrapper. Is error handling for these calls duplicated in many places instead of centralized in the wrapper? → violation.

**Illustration** *(swap per stack).* Frontend: every request goes through one `apiClient`/`apiFetch` that returns typed data and throws one typed error; components never call `fetch` directly; auth/refresh is handled in the wrapper, not re-handled per call. Backend calling a third party: one client module wraps the SDK, translates its errors, and is the only place that knows the SDK exists.

**Dial.** **Scales.** *Full:* typed wrapper with error translation, ret/refresh handling, shared response types. *MVP/POC:* still one wrapper function — even a thin one — so there is a single chokepoint to change later. *Floor within it:* no raw calls scattered in leaves. One chokepoint is cheap to maintain even in a toy and saves a rewrite the moment the boundary changes.

---

## P7 — Type discipline at boundaries

**Invariant.** Boundaries are typed. No untyped escape hatches (`any`, untyped maps masquerading as DTOs, stringly-typed payloads) at the edges of a unit. Shared types are defined once and referenced, never re-declared inline at each use.

**Check.** Grep for the language's untyped escape hatch at boundary code → violation. Find a response/request shape defined inline in a leaf instead of imported from a shared types location → violation. The contract's data shapes exist in exactly one place.

**Illustration** *(swap per stack).* TypeScript: no `any` in lib or component boundaries; response types live in a shared `types/` location, imported where needed. Go: typed structs at every boundary, not `map[string]interface{}`. Python: typed models/dataclasses at the edges, not bare dicts.

**Dial.** **Mostly floor, relaxes slightly.** *Full:* exhaustively typed throughout, shared type registry. *MVP/POC:* internal looseness is tolerable, but **no `any` at the boundary** holds — that is where untyped data corrupts everything downstream. The boundary rule does not relax; internal exhaustiveness can.

---

## P8 — Test ownership: one concern, one layer

**Invariant.** Each concern is tested exactly once, at the layer that owns it. No concern is verified twice across layers. Tests anchor to acceptance criteria and domain rules, not to a coverage number. The ownership split: business and domain rules → logic-layer unit tests; contract and boundary behaviour (status codes, authorization, isolation) → integration tests; cross-boundary call shape → the wrapper's own unit tests; complete user-visible flow → one happy-path end-to-end test.

**Check.** Is the same rule (e.g. an authorization boundary) tested in both integration and end-to-end? → duplication violation; it belongs to integration only, and the end-to-end test covers the happy path. Does a changed logic-layer method have no corresponding unit test? → violation; a behaviour change with no test change is incomplete. Are tests written to chase coverage on trivial code rather than to guard an acceptance criterion? → violation of intent.

**Illustration** *(swap per stack).* Business rule "cannot enroll past capacity" → one logic-layer unit test. "Returns 403 for the wrong role" → one integration test, not repeated in the UI test. "User can complete signup" → one end-to-end happy-path test that does not re-assert the role matrix. The wrapper's URL/method/body shape → tested at the wrapper, not through the UI.

**Dial.** **Scales — the most.** *Full:* the complete four-layer split, end-to-end happy path per story, integration covering the boundary matrix. *MVP/POC:* test the domain logic that matters and one happy path; skip the exhaustive matrix. *Learning:* test the thing you are learning thoroughly (it is the point) and little else. *Floor within it:* never test the same concern in two layers — duplicated tests are worse than missing ones, because they make every change cost twice.

---

## P9 — SOLID and DRY, with restraint

**Invariant.** Apply structural principles (single responsibility, depend on abstractions, extract duplication) **where they reduce the cost of change, and stop there**. An abstraction, interface, or pattern appears only to relieve a friction that already exists in the code — never preemptively, never to demonstrate knowledge of it. The simplest thing that satisfies the requirement is the correct thing.

**Check.** Find an interface with a single implementation and no seam that anything needs → over-abstraction; advisory. Find a pattern (factory, strategy, observer) introduced where a direct call or a conditional was clearer → over-engineering; advisory. Find genuinely duplicated *logic* (not merely similar-looking code) that should be one place → DRY violation. When a pattern *is* used, is it named and justified? → if not, it cannot be audited.

**Illustration** *(swap per stack).* Write the direct version first. When a second and third caller force the same construction logic, *then* extract a factory — and say why in a comment or the change description. Do not introduce a strategy interface for a branch that has one case. Restraint is the rule; the pattern is earned by pain that already exists.

**Dial.** **Floor — and it leans *harder* toward restraint as builds get smaller.** A POC or learning build should be *more* aggressive about cutting abstraction, not less. Premature structure is the most common way these principles get misapplied. The restraint never relaxes; if anything it intensifies at small scale.

---

## P10 — Surgical changes

**Invariant.** Every changed line traces directly to the current unit of work. Adjacent code is not improved, reformatted, or refactored as a side effect. Pre-existing dead code is mentioned, not deleted. Existing style is matched even where you would do it differently. Only the imports, variables, and functions that *your own change* made unused are removed.

**Check.** Read the diff. Does every hunk trace to the story/task? → if a hunk is unrelated cleanup, violation. Is there reformatting of untouched code, or a drive-by refactor? → violation. Were pre-existing unused symbols deleted? → violation (mention them instead). Does new code match the surrounding style, or impose a different one? → if it diverges, violation.

**Illustration** *(swap per stack).* You are adding a field. The diff touches the entity, the DTO, the mapping, the test — and nothing else. You notice an unrelated dead method nearby; you note it in the change description and leave it. You would have named a nearby variable differently; you match what is there.

**Dial.** **Floor.** This is what makes a diff reviewable and a change auditable at every scale. Scope discipline is not a production luxury — it is what lets you (or an agent) understand any change in isolation. Never relaxes.

---

## Enforcement

These principles are only worth the file they are written in if something checks them. That something is the **review gate** — the step where a reviewer (you, reading the diff, or a review agent) runs each **Check** above against the change before it is accepted. The Checks are written to be a literal checklist for that gate.

This is the same verification step the playbook places between *build* and *ship*: a story is not done because the code runs. It is done when it runs, its tests pass against the acceptance criteria, its scope is surgical, and it passes the Checks for every principle that applies at this build's dial setting.

A reusable standard plus a review gate that enforces it is what makes "the agent writes the code and I can still maintain it" true instead of hopeful. Without the gate, this file is documentation. With it, it is a contract.

---

## How this file is used per system

1. Keep this file as-is. It does not change between projects.
2. Fill `engineering-decisions.template.md` for the new system — the choices this file leaves open (the contract's actual codes and envelope, the exception taxonomy, tenancy, auth model, stack).
3. Point CLAUDE.md at both: *"all code conforms to engineering-principles.md and engineering-decisions.md; apply the dial setting for this build's mode; name and justify any pattern used."*
4. Set the dial once for the build, from its declared mode (artifact 1): Production → Full; MVP/POC → collapsed; Learning → floor everywhere except the subsystem being learned, which is Full.
5. Run every story through the review gate against the Checks.

The principles are ambient — loaded once via CLAUDE.md, obeyed on every story, never restated in a per-story prompt. You restate one only when a specific story overrides it.
