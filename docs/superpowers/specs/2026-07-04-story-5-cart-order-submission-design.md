# Story 5 — Cart & Order Submission — Design

**Context anchor.** Epic: Digital Ordering Core Loop · Bounded context: Ordering (Order aggregate) · Follows `02-domain-model.md` (`INV-1`, `INV-2`, `INV-3`, `INV-7`), `05-api-conventions.md`, `06b-engineering-decisions.md`.

## Architecture

`app/order/page.tsx` stays a server component exactly as it is today from Story 4: it fetches the `Table` via `getTableOrThrow`, handles the missing/invalid table id error paths unchanged. It additionally fetches menu items via `listMenuItems()` (already does this) and renders a new client component, `app/order/Cart.tsx` (`"use client"`), passing `table` and `items` as props. All cart state — added lines, quantities, submit, confirmation — lives inside `Cart.tsx`. No routing change; the customer stays on `/order?table=<id>` throughout, which leaves room for Story 6 (edit/cancel a Pending order) to extend the same confirmation view later.

## Data model (additive migration)

```prisma
enum FulfillmentStatus { Pending Confirmed Cancelled }
enum PaymentStatus { Unpaid Paid }

model Order {
  id                String            @id @default(uuid())
  orderNumber       Int               @unique @default(autoincrement())
  tableId           String
  table             Table             @relation(fields: [tableId], references: [id])
  fulfillmentStatus FulfillmentStatus @default(Pending)
  paymentStatus     PaymentStatus     @default(Unpaid)
  createdAt         DateTime          @default(now())
  confirmedAt       DateTime?
  items             OrderItem[]
}

model OrderItem {
  id            String   @id @default(uuid())
  orderId       String
  order         Order    @relation(fields: [orderId], references: [id])
  menuItemId    String
  menuItem      MenuItem @relation(fields: [menuItemId], references: [id])
  nameSnapshot  String
  priceSnapshot Decimal  @db.Decimal(10, 2)
  quantity      Int
}
```

Only adds new tables/columns — no changes to existing `Table`/`MenuItem` columns. This is additive per CLAUDE.md's migration stop-rule (no approval gate), though it does add the `Order`/`OrderItem` entities described in `02-domain-model.md`. `orderNumber` is a Postgres-native autoincrement, giving atomic, monotonic, human-readable numbers (`Order #47`) with no custom generation/collision logic.

## Service layer — `lib/orderService.ts`

`createOrder(tableId: string, items: { menuItemId: string; quantity: number }[]): Promise<Order & { items: OrderItem[] }>`

Validation order (all checks run before any write):
1. `items.length > 0`, else `ValidationError` (`INV-2` → `400`).
2. Every `quantity` is a positive integer, else `ValidationError` (`400`).
3. The table exists (`getTableOrThrow`), else `NotFoundError` (`INV-1` → `404`). Defensive — the page already validated this — but the service is a shared boundary and shouldn't trust callers blindly.
4. Load all referenced `MenuItem`s in one query. Any missing id → `NotFoundError` (`404`). Any with `available === false` → `ConflictError` (`INV-7` → `409`, code `MENU_ITEM_SOLD_OUT`, message names the item).

Once validation passes, the `Order` + all `OrderItem`s are created in a single `prisma.$transaction`, with each `OrderItem` snapshotting the `MenuItem`'s current `name`/`price` at creation time (`INV-3`, capturing them before any concurrent menu edit could apply).

## API — `POST /api/orders`

Unauthenticated (customer-facing route — no customer accounts by design, per `06b` §8).

- Request: `{ tableId: string, items: { menuItemId: string; quantity: number }[] }`
- `201`: `{ id, orderNumber, tableId, fulfillmentStatus, paymentStatus, items: [{ id, menuItemId, nameSnapshot, priceSnapshot, quantity }], createdAt }`
- Errors via the shared `handleApiError` envelope: `400` (empty cart / bad quantity), `404` (unknown table or menu item), `409` (`MENU_ITEM_SOLD_OUT`).

## Client cart component (`app/order/Cart.tsx`)

- Tapping an available menu item button adds a cart line at quantity 1 (or increments an existing line for that item).
- Each cart line renders name, quantity, and `+`/`-` steppers; `-` from quantity 1 removes the line entirely.
- "Submit order" button is disabled while the cart is empty.
- Submitting posts via `lib/apiClient.ts`'s `post()` to `/api/orders`. On `404`/`409`, the server's `message` is shown inline as an error and the cart is left intact so the customer can adjust (e.g. remove the now-sold-out item) and retry.
- On success (`201`), the component replaces its rendered content with a confirmation view: `Order #<orderNumber> confirmed`, an itemized list (name / qty / price snapshot), a total, and a short note to ask staff for changes. The menu/cart UI disappears — this is a client-side content swap, no navigation.
- Sold-out items remain `disabled` (Story 4 behavior, unchanged) and are excluded from being addable client-side — defense in depth; the server check in `orderService` is the authoritative guard per `INV-7`.

## Errors

All error mapping goes through the existing `DomainError` taxonomy and `handleApiError` — no new error-handling machinery. New error instances: reuse `ValidationError`, `NotFoundError`, `ConflictError` from `lib/errors.ts` (no new classes needed); `ConflictError`'s message names the sold-out item(s) so the client can show something actionable.

## Testing

- `lib/orderService.test.ts` (Vitest, mocks `prisma` following `menuService.test.ts`'s pattern): empty cart rejected; zero/negative/non-integer quantity rejected; unknown table → `NotFoundError`; unknown menu item → `NotFoundError`; sold-out item → `ConflictError`; happy path returns an `Order` with snapshotted `OrderItem`s and uses `$transaction`.
- `app/api/orders/route.test.ts` (Vitest, mocks `orderService`, following `menu-items/route.test.ts`'s pattern): `400`/`404`/`409`/`201` status mapping, no auth guard invoked (unauthenticated route).
- `app/order/Cart.test.tsx` (jsdom + Testing Library, pattern from Story 4's `page.test.tsx`): adding an item shows a cart line; steppers increment/decrement/remove at zero; submit disabled when cart is empty; successful submit renders the confirmation with the order number; a server error renders inline and leaves the cart intact for retry.

## Scope boundary

Does not touch: staff confirmation/payment actions (Story 8), menu management (Story 3), customer edit/cancel of a submitted order (Story 6 — the confirmation view here is read-only, no cancel/remove wiring yet), the staff dashboard (Story 7).
