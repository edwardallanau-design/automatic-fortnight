# Order Customer Name — Design

**Date:** 2026-07-07
**Status:** Approved by user (brainstorming session)

## Problem

Orders are identified only by `orderNumber` and table. Staff have no way to know *who* at a table placed an order, and customers have no way to label their order. We want customers to optionally attach a name to each order at submission time.

## Decisions made during brainstorming

1. **Name is captured only at submission** (in the order review modal). There is no editable name field in the menu header, and no post-submission rename — the name is immutable once the order is created. This mirrors the domain's existing snapshot philosophy (cf. `priceSnapshot`).
2. **Optional, with a nudge.** Submission never blocks on the name. The input is prominent with helper text encouraging the customer to fill it in.
3. **Prefilled within a session.** The last-entered name is remembered per table in `sessionStorage` and pre-fills the modal on the next order from the same browser session.
4. **Displayed on all three surfaces:** staff pending-orders dashboard, customer order ticket page, and the menu header (display-only).

## Out of scope

- Splash screen on QR scan (noted future improvement).
- Renaming an order after submission (customer, staff, or admin).
- Any guest/customer entity or per-guest order grouping (rejected as YAGNI — revisit only if bill-splitting or loyalty lands on the roadmap).

## Data model

- `Order.customerName String?` — additive Prisma migration, nullable, no default, no backfill. Existing orders have `null`.
- The value is either a non-empty trimmed string or `null` — never `""`. Coercion happens in the service layer.
- Doc update: add `customerName (optional)` to the Order entity line in `docs/design/02-domain-model.md`. No invariant or state-machine changes.

## Service layer (`lib/orderService.ts`)

- `createOrder(tableId, items, customerName?)` — new optional third parameter.
- Trims the value; empty/whitespace-only becomes `null` before persisting.
- No changes to `listOrders`, `confirmOrder`, `cancelOrder`, etc. — the column flows through existing `include`/return shapes automatically.

## API (`app/api/orders/route.ts`)

- `POST /api/orders` body gains optional `customerName`.
- Validation (existing inline style): if present, must be a string; after trimming, max **50 characters**, else `ValidationError`. Absent/blank is fine.
- `GET` endpoints unchanged — Prisma returns the new column on existing queries.

## UI

### Order review modal (`app/order/OrderReviewModal.tsx`)
- Text input above the Confirm button. Label: "Name for this order". Helper text: "Add a name so we can find you". `maxLength={50}`. Optional.
- Name state lives in `Cart.tsx` and is passed down; submitted with the `POST /api/orders` payload.

### Session persistence (`app/order/Cart.tsx`)
- On successful submission, save the (trimmed, non-empty) name to `sessionStorage` under `orderName:${tableId}` — same per-table keying as the existing `cart:${tableId}`.
- On mount, read that key to seed the name state (prefill). Storage failures are silently ignored, matching the cart's existing behavior.

### Menu header (`app/order/page.tsx`)
- Display-only. The header title becomes a small client component: renders "Table {n}" and appends " · {name}" when `orderName:${tableId}` exists in sessionStorage. Not editable.

### Order ticket (`app/order/[id]/OrderTicket.tsx`)
- Shows the customer name beneath the order number when present; renders nothing name-related when `null`.

### Staff dashboard (`app/dashboard/PendingOrdersDashboard.tsx`)
- Order card shows the name alongside the existing `Table {n}` / `#{orderNumber}` row when present.

## Error handling

- Blank/missing name: never an error.
- Over-limit name: prevented client-side via `maxLength`, rejected server-side via `ValidationError` (defense in both layers, per existing pattern).
- sessionStorage read/write failures: silently ignored (existing cart pattern).

## Testing (Vitest, colocated per repo convention)

- **Service:** name persisted trimmed; empty/whitespace → `null`; omitted → `null`.
- **Route:** valid name passes through; >50 chars (post-trim) → 400; non-string → 400; absent → 201.
- **Components:** modal renders the input and submits its value; prefill seeds from sessionStorage; ticket/dashboard/header show the name when present and omit it when absent.

## Process notes

- Log this feature as a story in `BUILD_STATUS.md` when implementation starts (user-directed feature, not from the current epic map).
