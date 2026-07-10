# Payment Choice UX Revision — Design

**Date.** 2026-07-10
**Branch.** `feature/customer-payment-choice` (continuation of Story 19)
**Status.** Approved for planning

## Summary

Story 19 (customer payment choice) shipped functionally correct but visually minimal. Manual smoke-testing surfaced a real gap and three UX requests:

1. **Gap:** the admin "Add payment method" form has no QR image field — QR upload only exists via Edit after creation.
2. Customer-facing "pay online" screen should use the full screen with large, tappable cards instead of a cramped list of small radio buttons.
3. Each payment-method card should read like a profile card: QR code as the hero image, method name as a caption, account number below.
4. The staff dashboard's payment-choice display is a tiny muted line that's easy to miss — it needs to visually "pop," especially the reference number staff cross-check against their own banking/wallet app.

Resolved via the brainstorming visual-companion tool (two screens, both decisions confirmed by the project owner): QR-first card layout, and an accent-bordered (not callout-box-with-copy-button) treatment for the dashboard.

## 1. Admin: Create Payment Method form

**File:** `app/admin/payment-methods/CreatePaymentMethodForm.tsx`

Add a QR image upload field to the creation form (currently create only accepts `name`/`accountInfo`; QR upload was Edit-only). Field order top to bottom: **Name → Account number (optional) → QR image (optional)**.

Implementation: reuse the same `toBase64(file): Promise<string>` helper and `qrImage` field name already used in `PaymentMethodRow.tsx`'s edit mode. On submit, if a QR file was selected, `POST /api/payment-methods` first (name + accountInfo, as today), then immediately `PATCH /api/payment-methods/:id` with `{qrImage}` using the returned id — two calls, since the create route doesn't accept `qrImage` (this mirrors the existing route contract from Story 19 rather than changing it; adding `qrImage` to the POST body would require duplicating `uploadQrImage`-orchestration logic into the POST route for no real benefit over two sequential calls the client already knows how to make).

**Also fixed while touching this area:** `PaymentMethodRow.tsx`'s view mode (not editing) currently shows the QR thumbnail but never `accountInfo` — that text is only visible after clicking Edit. Add an `accountInfo` display line to view mode, next to/below the name, whenever it's set.

## 2. Customer picker (`PaymentChoicePicker.tsx`) — "pay online" screen

**Layout:** full width (drop the `max-width: 480px` constraint inherited from `.payment-choice`'s ticket-matching width — this screen gets its own wider container), single column, enlarged cards. Confirmed via visual companion: not a grid — QR codes need to stay large enough to scan/read comfortably, and this app is mobile-first.

**Card content, top to bottom (confirmed: QR-first):**
1. QR image, if the method has one — large, centered, the visual hero of the card
2. Method name — caption-style, below the QR (or as the only header line, if there's no QR)
3. Account number, if set — smaller, muted, below the name

**Selection interaction:** tapping anywhere on the card selects it — no visible radio input. Selected state shown via a highlighted border (and background tint) on the whole card. This replaces the current `<input type="radio">`-per-tile implementation; the underlying `selectedMethodId` state doesn't change, only the markup/interaction (the whole card becomes the clickable target, styled to look pressed/selected rather than exposing a native radio circle).

**Reference number + Submit:** stay below the full card list as a shared area (not inline-per-card) — confirmed via the interaction-model question. This is the existing structure from Story 19, just re-skinned; no new state machine for per-card expand/collapse.

**Graceful degradation, explicitly confirmed by the design:** a method with no QR image (only `accountInfo`) renders as a smaller card with just the name + account number — no broken/empty QR placeholder box.

## 3. Staff dashboard (`OrderDetailModal.tsx`)

Replace `.order-detail-modal__payment-note`'s current tiny muted mono line with a colored left-border accent callout: larger, bold text for the reference number, a smaller bold label line above it for the method (`Awaiting payment · Online (GCash)` / `Paid · Online (GCash)` / `Awaiting payment · Counter`, same text logic as today — only the visual treatment changes). No copy-to-clipboard button (considered, explicitly declined in favor of simplicity).

## Out of scope for this revision

- No change to the underlying data model, API routes, `orderService`, or `paymentMethodService` — this is presentation-layer only.
- No change to `INV-11`/`INV-12`, the gate condition, or the trust boundary around `paymentStatus` — all untouched.
- Vercel Blob store reconfiguration (private → public) is a deployment/dashboard task on the project owner's side, not a code change, and is not part of this spec.
- Inline-per-card reference-input expansion — explicitly declined in favor of the simpler shared-area-below-the-list model.
- Copy-to-clipboard for the reference number — explicitly declined for now.
