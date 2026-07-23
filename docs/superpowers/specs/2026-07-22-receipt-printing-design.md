# Receipt printing — Design

**Date.** 2026-07-22
**Source.** User-directed, post-epic (matches the naming convention `BUILD_STATUS.md` uses for stories added after the MVP epic). Narrows an existing `07-epic-map.md` backlog entry ("End-of-day transaction printout / invoices / receipts for accounting") rather than building it as originally scoped — see Scope below.

## Problem

Staff/admin currently have no way to hand a customer (or keep for their own records) a physical printed copy of a paid order. Every piece of data a receipt needs — items, quantities, price snapshots, payment method/reference, order number, table — already exists and is rendered on-screen in the dashboard's `OrderDetailModal` (`app/dashboard/OrderDetailModal.tsx`), but there is no export/print path from it.

This was previously logged in `07-epic-map.md`'s backlog as **out of scope**: "reads as POS/bookkeeping-system territory... may have tax-compliant receipt-numbering requirements." That instinct is still correct for a *real accounting/invoicing system* — this design deliberately does not build that. It builds a much narrower feature: a plain printable slip for a single already-paid order, with no fiscal semantics.

## Scope

**In scope.**
- A "Print receipt" button in `OrderDetailModal`, available to Staff and Admin only.
- Enabled only once `paymentStatus = Paid` (visible but disabled, with a hint, while Unpaid). Gate is on `paymentStatus` alone — independent of `fulfillmentStatus`, matching the domain model's existing `INV-8` independence (so a Cancelled-but-Paid order is still printable; this is not a new rule, just not blocking on a second condition).
- A new presentational `Receipt` component rendering: Branch name, ordering point label, order number, customer name (if set), line items (qty × name-snapshot, per-line price), total (flat sum of `priceSnapshot × quantity`, no tax/service charge), and payment info (choice, method name, reference).
- Print-only CSS (`@media print`) that isolates the `Receipt` markup from the rest of the dashboard page when the browser's native print dialog (`window.print()`) is invoked.
- Canonical term: **"Receipt"**, used consistently in UI copy, component/prop names, and docs — not "Invoice" (an invoice implies a pre-payment bill; this is proof-of-payment by construction, since it's gated on Paid).

**Out of scope (explicit).**
- Any accounting/bookkeeping functionality: tax computation, sequential/fiscal receipt numbering, end-of-day totals/reporting. That remains the rejected, wider backlog item.
- Customer-facing printing. Staff/admin dashboard only — the customer flow stays unauthenticated-and-narrow per Story 18's existing direction (cancel-only self-service).
- Direct thermal/ESC-POS printer integration. Explicitly wanted for later, but real infrastructure (Vercel serverless can't hold a raw socket/USB connection to a till-side printer; needs a local bridge/agent) — deferred to the epic map's backlog, same "interim now, real integration later" pattern as Story 19's payment gateway.
- Persisting anything about the print action — no `printedAt`, no print counter, no audit trail. Purely a stateless client-side render + `window.print()` call. Reprinting is unlimited and untracked.
- New `Branch` fields (address/phone/tax id) — only the already-existing `Branch.name` appears.
- Any change to `02-domain-model.md`'s existing invariants, entities, or state machines. `Receipt` is documented as a new glossary term describing a *view* of an `Order`, not a new entity, aggregate, or persisted concept.

## Decisions

- **The Paid-gate is enforced client-side only, not written as a numbered invariant.** Every existing `INV-n` in `02-domain-model.md` is a backend-enforced data-consistency rule (checked in a service module, on a persisted state transition). This feature adds no API route and no persisted state, so there is nothing for the server to enforce — the button's `disabled` attribute *is* the entire enforcement. Recorded instead as a plain rule inside the new `Receipt` glossary entry, not inflated into the Invariants list.
- **New `Receipt` component, not an extension of `TicketCard`.** `TicketCard` (`app/order/[id]/TicketCard.tsx`) already renders near-identical markup (heading, items, total, payment note) but is purpose-built for the customer-voiced `/order/[id]` page ("Your ticket", "Contact staff to change your order..."). Branching its copy by caller would couple two different audiences (customer vs. staff-facing print output) into one component. A small new component is cheaper and clearer than parameterizing an existing one for a second, differently-voiced use case.
- **Print isolation via a global `@media print` stylesheet, not a separate print route.** The button lives inside the existing `OrderDetailModal` (per explicit direction — no new route). A `.receipt` class plus a `@media print { body * { visibility: hidden } .receipt, .receipt * { visibility: visible } ... }` block hides all other page chrome, including the rest of the modal, when the print dialog opens. Standard technique; needs no new page/route.
- **`Receipt` is rendered inside `OrderDetailModal` at all times (visually hidden on-screen via `display: none`), not conditionally mounted on click.** Keeps the component simple (no extra open/close state) and means `window.print()` can be called directly from the button's `onClick` with the receipt markup already present in the DOM.

## Data model

No schema changes. Every field `Receipt` needs already exists on `OrderCardOrder` (`app/dashboard/OrderCard.tsx`), which `OrderDetailModal` already receives as a prop: `branch.name`, `orderingPoint.label`, `orderNumber`, `customerName`, `items[].{nameSnapshot,priceSnapshot,quantity}`, `paymentChoice`, `paymentMethodNameSnapshot`, `paymentReference`, `paymentStatus`.

## Components & data flow

### `app/dashboard/Receipt.tsx` (new)

Presentational only, no state, no data fetching.

```ts
export function Receipt({
  branchName,
  orderingPointLabel,
  orderNumber,
  customerName,
  items,
  paymentChoice,
  paymentMethodNameSnapshot,
  paymentReference,
}: {
  branchName: string
  orderingPointLabel: string
  orderNumber: number
  customerName: string | null
  items: { id: string; nameSnapshot: string; priceSnapshot: string; quantity: number }[]
  paymentChoice: 'None' | 'Counter' | 'Online'
  paymentMethodNameSnapshot: string | null
  paymentReference: string | null
}) { /* ... */ }
```

Renders (all wrapped in a `receipt` class root):
- `branchName` as a heading line.
- `orderingPointLabel · #orderNumber`.
- `customerName`, if set.
- One line per item: `{quantity}x {nameSnapshot}` and its line price (`priceSnapshot × quantity`).
- A total line: sum of all line prices.
- A payment line: reuses the same wording pattern as `TicketCard`'s existing `formatPaymentChoiceNote` for method/reference (`Counter` → "Paid at the counter."; `Online` → "Paid online via {method}. Reference: {reference}."), prefixed with the literal word **PAID** since the gate guarantees `paymentStatus = Paid` whenever this is printed.

### `app/dashboard/OrderDetailModal.tsx` (modified)

- Renders `<Receipt ... />` unconditionally (data always available from `order`), hidden on-screen via CSS (`display: none` outside `@media print`).
- New button in the existing `.order-detail-modal__actions` row:
  - Label: "Print receipt"
  - `disabled={order.paymentStatus !== 'Paid'}`
  - `title="Available once paid"` when disabled (visible-but-disabled-with-a-hint, per the confirmed UX decision)
  - `onClick={() => window.print()}`
  - No new prop/callback needed from the parent (`PendingOrdersDashboard`) — `window.print()` is called directly, unlike every other action in this modal which goes through an `on*` callback prop, because there's no server round-trip or state change to coordinate.

### CSS — `app/globals.css`

- `.receipt { display: none; }` (hidden on-screen by default) plus its internal layout rules (reuses `--font-mono`/`--espresso` etc. tokens already used by `.ticket`/`.order-detail-modal` for visual consistency).
- One `@media print { ... }` block: hides everything under `body` except `.receipt` and its descendants, and resets `.receipt` to `display: block` with print-appropriate sizing (e.g. narrow max-width suited to a slip, not a full A4 page — though actual paper size depends entirely on whatever printer the browser dialog targets, which this design has no control over).

## Error handling

None. No new failure modes — `window.print()` is a synchronous browser API with no error path this app needs to handle (an unavailable/cancelled print dialog is the browser's own concern, not this app's).

## Testing

- `OrderDetailModal.test.tsx`: "Print receipt" is disabled with the hint title when `paymentStatus = 'Unpaid'`; enabled and calls `window.print()` (mocked) when `paymentStatus = 'Paid'`; still enabled on a `Paid` + `Cancelled`-equivalent combination (i.e., gate is Paid alone — though this repo's `OrderCardOrder.fulfillmentStatus` type today only has `'Pending' | 'Confirmed'`, so this is really just confirming the check reads `paymentStatus` and nothing else).
- `Receipt.test.tsx` (new, small): renders item lines + total correctly; renders the Counter/Online payment line text correctly; omits the customer-name line when `customerName` is `null`.
- No new Playwright/e2e script — mirrors the precedent set by the menu-categories plan: this only changes item presentation/export, not the MVP e2e path's mechanics (scan → order → confirm → pay).
- **Actual print output (paper layout, `@media print` rendering) is not unit-testable** — jsdom doesn't render print media queries meaningfully. Needs a manual browser print-preview check (Ctrl+P → Print Preview) after implementation, following this repo's existing convention for anything requiring real visual/browser confirmation (see `ISSUE-15`, Story 17's slider check, Story 21a's screenshot verification).

## Addendum (2026-07-22): page sizing

Real testing after the initial build surfaced that the printed/PDF output was a full Letter-sized page with the receipt tucked in the corner — not the compact slip a receipt should be. Two compounding causes, both fixed:

- **Paper width decided: 80mm** (the more common modern POS/receipt-printer width, chosen over 58mm for readability — also the width the eventual thermal/ESC-POS integration should target, per the backlog item in `07-epic-map.md`).
- **Root cause 1 — reserved layout height.** The original isolation technique (`body * { visibility: hidden }`) hides content but not layout space; the whole (irrelevant, invisible) dashboard's height was still counted toward the printed page. Fixed by having `Receipt` portal (`createPortal`) to a dedicated `<div id="receipt-print-root">` appended directly to `document.body`, so the print stylesheet can `display: none` everything else (`body > *:not(#receipt-print-root)`) — true removal from layout, not just invisibility.
- **Root cause 2 — `@page` flexible height isn't reliably honored.** `@page { size: 80mm auto }` (fixed width, content-driven height) is the semantically correct CSS Paged Media rule for a receipt, but Chromium's headless PDF export silently ignores the `auto` and falls back to a default Letter page — confirmed by grepping a Playwright-generated PDF's `/MediaBox` (`612 792`, i.e. Letter, before the fix). Fixed with a `beforeprint` listener (`useReceiptPageSize` in `OrderDetailModal.tsx`) that measures the receipt's actual rendered height and injects a concrete two-dimension `@page { size: 80mm <Nmm>; margin: 0 }` rule right before the print dialog opens, rather than relying on `auto`.
- Re-verified via the same PDF-`/MediaBox`-grep technique: `[0 0 227.04 150]` ≈ 80mm × 53mm (content-sized), not 612×792pt.

**Second follow-up, same day.** Real browser testing (not just headless Playwright) surfaced that the above fix itself paginated the receipt one line per page (a 20-page PDF for a single item). Root cause: `#receipt-print-root` was `display: none` outside `@media print`, and `useReceiptPageSize`'s `beforeprint` measurement raced against whether print styles had actually applied — when they hadn't yet, the still-`display:none` portal measured as 0px tall, producing a ~5mm page that everything overflowed onto subsequent pages. Fixed by never `display:none`-ing the portal: it's positioned off-screen instead (`position: fixed; left: -9999px`), which keeps it laid out (and therefore reliably measurable) at all times independent of print-style timing; `@media print` now only repositions it on-page (`position: static`) rather than toggling `display`. Re-verified: single-page PDF, same `227.04 × 150` `/MediaBox` as before.
