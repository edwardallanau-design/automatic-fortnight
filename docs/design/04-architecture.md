# Architecture & ADRs

**Architecture overview.**

Single Next.js application (React, Node.js runtime) deployed on Vercel — one codebase serves both the customer-facing menu/ordering UI and the staff/owner dashboard, gated by route + role.

```
Client (browser, mobile-first)
   │
   ▼
Next.js route handlers (API routes)     ← boundary layer: request parsing, auth check, response shaping
   │
   ▼
Service modules (order service, menu service, auth service)   ← logic layer: business rules, invariants from 02-domain-model.md
   │
   ▼
Prisma ORM                               ← persistence layer: queries only, no business rules
   │
   ▼
Postgres (Neon)
```

- **Boundary** = Next.js API route handlers. Own request/response shape and auth gating only.
- **Logic** = plain service modules (`orderService`, `menuService`, `authService`). Own all invariants from Artifact 02.
- **Persistence** = Prisma repository-style functions per entity. Own queries only, no branching business logic.
- Staff dashboard polls `GET /api/orders?status=pending` every 3–4s (see ADR-001) instead of holding a live connection.

**Cross-cutting.**
- **Auth.** Two shared credential sets — one for Staff, one for Owner/Admin (see ADR-003). Session via signed cookie (e.g. `next-auth` credentials provider or a minimal custom JWT-in-cookie). All authority checks live in one place (route middleware / a single `requireRole()` guard) — never inline per-handler.
- **Errors & logging.** Governed by `06a-engineering-principles.md` (P2, P3) + this system's concrete shapes in `06b-engineering-decisions.md`.
- **Config.** Environment variables: `DATABASE_URL` (Neon connection string), auth secret, deployed via Vercel project env settings — never committed.
- **Integrations.** Vercel Blob for payment-method QR image storage (ADR-005). No payment gateway, no delivery/logistics integration (explicit non-goals, Artifact 01).

---

**ADR-001: Real-time order delivery via polling, not WebSockets**
- **Context.** Staff dashboard needs new orders visible within seconds (Artifact 01 NFR). Hosting target is Vercel, whose serverless functions are stateless/short-lived and don't natively host persistent WebSocket connections.
- **Decision.** Staff dashboard polls `GET /api/orders?status=pending` every 3–4 seconds.
- **Alternatives rejected.** WebSockets (needs a separate always-on socket server — real infra weight for this scale). Managed realtime service (Pusher/Ably) — adds a third-party dependency and cost not justified at ~20 concurrent orders.
- **Assumption that makes this right.** Order volume and concurrency stay in the tens, not hundreds, and a few-seconds delay is acceptable per the stated NFR.
- **What would invalidate it.** Staff report the delay is disruptive in practice, or a second venue pushes concurrency/latency requirements up — then reassess a managed push-based service.

**ADR-002: Single Next.js application, not separate frontend/backend**
- **Context.** One small team (solo + agent), one deploy target (Vercel), no requirement for independent scaling of UI vs. API at this stage.
- **Decision.** Customer UI, staff/owner dashboard, and API routes all live in one Next.js app.
- **Alternatives rejected.** Separate SPA + API service — adds deployment and CORS complexity with no present benefit.
- **Assumption that makes this right.** Traffic and team size stay small enough that a monolith deploy is simpler to operate than split services.
- **What would invalidate it.** The API needs to serve a second client (e.g. a native app) or needs independent scaling from the UI.

**ADR-003: Shared role-based credentials, not per-user staff accounts**
- **Context.** No requirement for per-employee audit trails; only two behavioral roles exist (Staff, Owner/Admin).
- **Decision.** Two shared logins: one Staff credential, one Owner/Admin credential. Role is attached to the session, not to an individual user identity.
- **Alternatives rejected.** Per-employee accounts with a role field — more infrastructure (user management, invites, resets) for a requirement that doesn't exist yet.
- **Assumption that makes this right.** The restaurant doesn't need to know *which* staff member confirmed/paid an order — only that a staff-or-above session did.
- **What would invalidate it.** A need emerges for per-employee accountability (e.g. tracking which staff member handled an order) — then this becomes real user accounts with roles, a bigger but still additive change.

**ADR-004: Postgres (Neon) + Prisma**
- **Context.** Domain is small, relational, with clear entities and foreign keys (Order → Table, OrderItem → MenuItem). No need for document flexibility or specialized query patterns.
- **Decision.** Postgres hosted on Neon; Prisma as the ORM/query layer.
- **Alternatives rejected.** A NoSQL store — the domain is inherently relational (orders reference tables and menu items with real foreign-key integrity needs); schemaless flexibility isn't a requirement here.
- **Assumption that makes this right.** Data volume stays small (tens of tables/items, hundreds of orders/day) — well within Postgres/Neon's comfortable range without tuning.
- **What would invalidate it.** None expected at this scale; revisit only if data volume or query patterns change substantially post-validation.

**ADR-005: Vercel Blob for payment-method QR images**
- **Context.** Admin needs to upload a small number of rarely-changing QR code images for payment methods. No file-storage integration exists in this codebase (this file's "Integrations" line previously stated "None").
- **Decision.** Use Vercel Blob — admin uploads store the image in Blob, `PaymentMethod.qrImageUrl` stores the returned URL.
- **Alternatives rejected.** Base64-in-Postgres — avoids a new integration, but bloats rows and has no CDN delivery for customer-facing image content.
- **Assumption that makes this right.** Small number of images (one per payment method, single venue), infrequent writes (admin-only), Vercel-native so no new vendor relationship.
- **What would invalidate it.** Multi-tenant support requiring per-venue asset isolation at a scale where Blob's flat namespace becomes unwieldy — reassess then.
