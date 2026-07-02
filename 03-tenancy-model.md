# Tenancy & Isolation Model

**Strategy.** Single-tenant. One restaurant, one deployment, one database — no shared schema, no tenant-scoping column, no per-request tenant resolution.

**Rationale.** Multi-tenancy is an explicit non-goal (Artifact 01). Building tenant isolation now would be speculative production-grade cost against a possibility that doesn't yet exist as a requirement.

**What would invalidate this.** A second venue/client signs on. At that point this file is rewritten as a real isolation-strategy decision (shared-schema+RLS vs. schema-per-tenant vs. db-per-tenant) — treated as a fresh one-way-door decision, not a patch on top of single-tenant code.
