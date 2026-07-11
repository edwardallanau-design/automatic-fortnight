# Customer Payment Choice — Design

**Date.** 2026-07-10
**Branch.** `feature/customer-payment-choice` (off `dev`)
**Status.** Approved for planning

## Summary

Adds a customer-facing payment-choice step to the order confirmation page (`/order/[id]`): the customer picks either **pay at counter** or **pay online**. Pay online presents an admin-managed list of payment methods (each with a QR image and/or account-info text), requires the customer to select one and enter a reference number, and records that choice. Staff still make the final Paid determination via the existing dashboard toggle — this feature only tells staff *which method the customer says they used*, it does not verify or process any payment.

This is **not in-app payment processing**: no money moves through the app, no transaction is verified. It amends the non-goal in `01-intent-and-constraints.md` from "no in-app payment" to "no payment processing/verification" — see §6.

## 1. Domain model changes

`paymentStatus` (`Unpaid | Paid`) is **unchanged** — `INV-8` and `INV-9` are untouched, staff/admin remain the only actors who transition it.

**Order — 4 new fields:**
- `paymentChoice`: `None | Counter | Online` (default `None`) — set at most once, immutable afterward (`INV-11`)
- `paymentMethodId`: nullable FK → `PaymentMethod`; set only when `paymentChoice = Online`
- `paymentMethodNameSnapshot`: nullable string — captured at the moment of selection, same pattern as `OrderItem.nameSnapshot` (`INV-3`): a later admin rename/archive of the method never rewrites this order's history
- `paymentReference`: nullable string — customer-entered, required only when `paymentChoice = Online`

**New entity `PaymentMethod`** (admin-managed, standalone aggregate, same archive-not-delete pattern as `MenuItem`):
- `name` (string)
- `active` (boolean, default `true`) — archived methods are hidden from the customer picker but remain valid FK targets for existing orders' history
- `qrImageUrl` (nullable string — Vercel Blob URL)
- `accountInfo` (nullable string — e.g. an account/wallet number as plain text)
- Admin fills at least one of `qrImageUrl`/`accountInfo`; both may be set.

**New invariants (additive to `02-domain-model.md`):**
- `INV-11` — `paymentChoice` transitions `None → Counter` or `None → Online` exactly once. Attempting to set it when it's already non-`None`, or when the order's `fulfillmentStatus = Cancelled`, is rejected (`409`).
- `INV-12` — Setting `paymentChoice = Online` requires a non-empty `paymentReference` and a `paymentMethodId` referencing an `active` `PaymentMethod` at the time of the request; both fields are set atomically in the same request as `paymentChoice`.

## 2. Customer-facing flow (`/order/[id]`)

**Gate condition.** The mandatory payment picker is shown in place of the ticket when **both**:
- the order's table is a real customer table (`table.number !== 0` — table `0` is the existing "Counter" convention for staff-assisted/walk-in orders, `lib/tableDisplay.ts`), **and**
- `paymentChoice === 'None'`

Staff-assisted orders (table `0`) and any order that has already made a choice skip straight to the existing ticket view.

**Picker UI:**
- **"Pay at counter"** → `POST /api/orders/:id/payment-choice/counter` (no body) → sets `paymentChoice = Counter` → ticket renders with a note ("You chose to pay at the counter").
- **"Pay online"** → renders active `PaymentMethod`s as tiles (QR image if present, else/also `accountInfo` text) → customer selects one → a required reference-number text input appears below the selected tile → **Submit** → `POST /api/orders/:id/payment-choice/online` `{paymentMethodId, reference}` → sets `paymentChoice = Online` + snapshot + reference → ticket renders showing the chosen method name and reference back to the customer.

Both endpoints are unauthenticated (same pattern as the existing customer-facing `DELETE /api/orders/:id` cancel route).

## 3. Staff dashboard changes

`PendingOrdersDashboard` / `OrderDetailModal` display payment-choice info alongside the existing Paid/Unpaid toggle (toggle behavior itself is unchanged):
- `paymentChoice = 'None'` → today's plain display, no change.
- `paymentChoice = 'Counter'` → "Awaiting payment · Counter"
- `paymentChoice = 'Online'` → "Awaiting payment · Online ({paymentMethodNameSnapshot}) · ref: {paymentReference}"

Once staff marks the order Paid, the payment-choice info remains visible (it's a record of what the customer declared, independent of `paymentStatus`).

## 4. Admin: Payment Methods management

New admin-only page `/admin/payment-methods`, following the same list/create/edit/archive pattern as `/admin/menu-items`:
- Create/edit a method: name, QR image upload, account-info text, active toggle.
- Archive (not hard-delete) — existing orders' `paymentMethodId` FK and `paymentMethodNameSnapshot` must remain valid/stable, mirroring why `MenuItem` is never hard-deleted (`02-domain-model.md`).
- Linked from `StaffBar`'s admin-only nav section, alongside Table Setup / Menu Management / Settings.

**New integration: Vercel Blob** for QR image storage (see ADR-005 below). No file-storage integration exists in this codebase today.

## 5. API surface

Follows `05-api-conventions.md` (flat `{error, message}` envelope, verb sub-resources under the resource, no new error classes — existing `ValidationError` (400) / `ConflictError` (409) / `NotFoundError` (404) cover every case):

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/orders/:id/payment-choice/counter` | none (customer) | `INV-11`; 409 if already chosen or order Cancelled |
| `POST /api/orders/:id/payment-choice/online` | none (customer) | body `{paymentMethodId, reference}`; 409 if reference empty or method missing/inactive; 409 if already chosen or Cancelled (`INV-12`) |
| `GET /api/payment-methods` | none (customer) | returns only `active` methods, for the picker |
| `GET /api/admin/payment-methods` | `requireApiRole('admin')` | list all (active + archived) |
| `POST /api/admin/payment-methods` | `requireApiRole('admin')` | create |
| `PATCH /api/admin/payment-methods/:id` | `requireApiRole('admin')` | edit name/accountInfo/active/qrImageUrl |
| Blob upload (client-upload flow or a dedicated upload route) | `requireApiRole('admin')` | stores the QR image in Vercel Blob, returns URL to attach to a `PaymentMethod` |

## 6. Non-goal amendment (`01-intent-and-constraints.md`)

Change:
> "No in-app payment — customer orders, gets a number, pays staff at the counter/table"

To:
> "No payment *processing* or verification in-app — the customer may declare a payment method (counter, or a self-reported online reference), but the app never handles money or confirms a transaction actually occurred; staff always make the final Paid determination."

This resolves the backlog note in `07-epic-map.md`'s "Payment integration" placeholder, which flagged this non-goal as needing formal revisiting before this feature shipped.

## 7. New ADR (`04-architecture.md`)

**ADR-005: Vercel Blob for payment-method QR images**
- **Context.** Admin needs to upload a small number of rarely-changing QR code images for payment methods. No file-storage integration exists in this codebase today (`04-architecture.md` currently states "Integrations: None").
- **Decision.** Use Vercel Blob (already same-vendor as the hosting platform) — admin uploads store the image in Blob, `PaymentMethod.qrImageUrl` stores the returned URL.
- **Alternatives rejected.** Base64-in-Postgres — avoids a new integration, but bloats rows and has no CDN delivery for what is user-facing image content on the customer ordering path.
- **Assumption that makes this right.** Small number of images (one per payment method, single venue), infrequent writes (admin-only), Vercel-native so no new vendor relationship.
- **What would invalidate it.** Multi-tenant support requiring per-venue asset isolation at a scale where Blob's flat namespace becomes unwieldy — reassess then.

## Out of scope (explicitly not building)

- Any real payment gateway integration or transaction verification.
- Editing/canceling a payment choice once made (`INV-11` — locked).
- Payment-method image editing beyond re-upload (no cropping/validation of QR content).
- Any change to `paymentStatus`, `INV-8`, or `INV-9` — staff/admin remain the sole actors who mark an order Paid.
