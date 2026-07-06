# Issues & Bugs

Log every bug or unexpected behaviour here — while building, during manual testing, or reported from the pilot. Don't skip logging something just because the fix was quick; the record matters more than the fix itself.

**Format per entry:** `ID`, one-line summary, where it was found (story #), severity, status.

---

## Open

| ID | Summary | Found in | Severity | Status |
|---|---|---|---|---|
| ISSUE-5 | Staff Dashboard's "Menu Management" nav link points to `/admin/menu`, but the actual route is `/admin/menu-items` — clicking it 404s | Story 7 planning, noticed while wiring `PendingOrdersDashboard` into `app/dashboard/page.tsx` | Major | Open |
| ISSUE-6 | Docker entrypoint re-runs the seed on every boot, re-applying the `.env.docker` staff/admin passwords each restart — a password rotated directly in the DB is silently reverted on the next `docker compose up` | Dockerization, background commit security review of `cdb6e6b` | Minor | Won't fix now — intended declarative-credentials behavior for the single-tenant MVP; the seed is idempotent so it's safe, and the footgun is documented in `docker/entrypoint.sh`. Revisit if per-user accounts or DB-side password management are added. |
| ISSUE-7 | App/DB secrets (`AUTH_SECRET`, `SEED_*`, `POSTGRES_PASSWORD`) are passed to containers as plaintext env vars via `env_file: .env.docker` | Dockerization, background commit security review of `7e548f3` | Minor | Won't fix now — standard Compose mechanism for a local "deploy-later" stack; `.env.docker` is gitignored and uncommitted (verified), so nothing leaks to the repo. **Harden before any real deployment**: move to Docker secrets / a secrets manager and rotate `AUTH_SECRET`. |
| ISSUE-8 | In the **production build**, every API error's `error` code comes back empty (`{"error":"","message":"..."}`) instead of a short code like `CONFLICT`/`NOT_FOUND`/`VALIDATION`, violating the `05-api-conventions.md` error envelope | Story 6, live Docker smoke test (`DELETE /api/orders/:id/items/:id` on the last item; also reproduced on `POST /api/orders` empty-cart 400 and a 404) | Major | Open — codebase-wide & pre-existing (not caused by Story 6). Root cause: `codeFor()` in `lib/handleApiError.ts` derives the code from `error.name` (= `this.constructor.name` in `lib/errors.ts`), and Next.js SWC production minification mangles class names to empty/garbage. HTTP **statuses are correct** because `statusFor()` uses `instanceof` (survives minification) — only the code string breaks. Invisible to unit tests, which run unminified. No current AC depends on it (spec mandates clients key on status+message), so Story 6 is functionally unaffected. **Fix:** give each `DomainError` subclass an explicit stable `code`/wire-name property (or map via `instanceof` like `statusFor` does) instead of relying on a minifiable `constructor.name`. |

Severity: `Critical` (blocks core loop / data integrity) · `Major` (breaks a story's AC) · `Minor` (edge case, cosmetic)

---

## Resolved

| ID | Summary | Found in | Root cause | Fix / commit |
|---|---|---|---|---|
| ISSUE-1 | API error codes had a redundant `_ERROR` suffix (`INVALID_CREDENTIAL_ERROR` instead of `INVALID_CREDENTIAL`), contradicting `05-api-conventions.md`'s own example | Story 1, task review | `codeFor()` in `lib/handleApiError.ts` converted the exception class name to SCREAMING_SNAKE without stripping the trailing "Error" | Stripped the suffix in `codeFor()`; commit `f08afba` |
| ISSUE-2 | Design spec and a test fixture still said `VALIDATION_ERROR` after ISSUE-1's fix changed the real runtime output to `VALIDATION` | Story 1, final whole-branch review | ISSUE-1's fix wasn't propagated to the design doc's error table or `lib/apiClient.test.ts`'s hand-written mock fixture | Updated both to `VALIDATION`; commit `18adc0b` |
| ISSUE-3 | `verifySession` didn't validate the JWT's `role` claim was actually `'staff'`/`'admin'` — an unrecognized value would silently pass any `requireRole()` check instead of being rejected | Story 1, final whole-branch review | `ROLE_RANK[unknownRole]` evaluates to `undefined`, and `undefined < ROLE_RANK[minRole]` is `false`, so the guard's rejection condition never triggered | Added an `isRole()` type guard so `verifySession` returns `null` for any non-staff/admin role claim (fail closed); commit `18adc0b` |
| ISSUE-4 | Two Postgres instances (a Docker container + a pre-existing native Windows service) both listened on port 5432; `localhost` resolved ambiguously between them, causing "migration ran but seed data isn't there" confusion | Story 1, Task 2 build | Docker's port mapping bound successfully alongside an already-running native Postgres service with no conflict error; IPv6/IPv4 resolution order picked one nondeterministically | Removed the Docker container, standardized on the native Postgres service, pinned `DATABASE_URL` to `127.0.0.1` instead of `localhost` in `.env.local` | 

---

## Template for a new entry

```
### ISSUE-<N>: <one-line summary>
- **Found in.** Story <#> / manual testing / pilot report
- **Severity.** Critical / Major / Minor
- **Repro.** <steps or conditions that trigger it>
- **Expected vs actual.** <what should happen> vs <what happens>
- **Root cause.** <once known>
- **Fix.** <what changed, or link to the commit>
- **Status.** Open / Investigating / Fixed / Won't fix (and why)
```
