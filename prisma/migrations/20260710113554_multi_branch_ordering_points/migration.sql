-- Seed the Main branch with a fixed id so every later statement in this file
-- (and prisma/seed.ts going forward, see the next plan's Task 10) can reference
-- it deterministically.
INSERT INTO "Branch" ("id", "name", "acceptingOrders", "createdAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Main', true, now());

-- Rename Table -> OrderingPoint, replacing the numeric "number" with a free-text
-- "label" scoped to a branch. This is a rename, not a drop/recreate, so every
-- row's id is preserved -- existing printed QR codes (/order?table=<id>) keep
-- working unchanged.
ALTER TABLE "Table" RENAME TO "OrderingPoint";
ALTER TABLE "OrderingPoint" RENAME CONSTRAINT "Table_pkey" TO "OrderingPoint_pkey";

ALTER TABLE "OrderingPoint" ADD COLUMN "branchId" TEXT;
ALTER TABLE "OrderingPoint" ADD COLUMN "label" TEXT;
ALTER TABLE "OrderingPoint" ADD COLUMN "isCounter" BOOLEAN NOT NULL DEFAULT false;

-- number=0 was the existing "Counter" convention (see lib/tableDisplay.ts) --
-- carry that forward as an explicit isCounter flag instead of a magic number.
UPDATE "OrderingPoint"
SET
  "branchId" = '00000000-0000-0000-0000-000000000001',
  "label" = CASE WHEN "number" = 0 THEN 'Counter' ELSE 'Table ' || "number"::text END,
  "isCounter" = ("number" = 0);

ALTER TABLE "OrderingPoint" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "OrderingPoint" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "OrderingPoint" DROP COLUMN "number";

ALTER TABLE "OrderingPoint" ADD CONSTRAINT "OrderingPoint_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderingPoint" ADD CONSTRAINT "OrderingPoint_branchId_label_key"
  UNIQUE ("branchId", "label");

-- Order: rename tableId -> orderingPointId. Postgres foreign key constraints
-- survive a column rename, so Order_tableId_fkey stays intact functionally --
-- we rename it too purely so its name matches what Prisma would generate fresh.
ALTER TABLE "Order" RENAME COLUMN "tableId" TO "orderingPointId";
ALTER TABLE "Order" RENAME CONSTRAINT "Order_tableId_fkey" TO "Order_orderingPointId_fkey";

ALTER TABLE "Order" ADD COLUMN "branchId" TEXT;
UPDATE "Order" SET "branchId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Order" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Credential: one Admin row (branchId stays null) plus one row per branch going
-- forward, instead of exactly one row per role. The existing staff row's
-- password hash is untouched -- it becomes Main's branch password unchanged.
DROP INDEX "Credential_role_key";
ALTER TABLE "Credential" ADD COLUMN "branchId" TEXT;
UPDATE "Credential" SET "branchId" = '00000000-0000-0000-0000-000000000001' WHERE "role" = 'staff';
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_branchId_key" UNIQUE ("branchId");
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MenuItem: sold-out becomes a per-branch fact (MenuItemSoldOut, added in the
-- previous migration) instead of a single global flag. Backfill Main's rows
-- from every currently-sold-out item, then drop the old column.
INSERT INTO "MenuItemSoldOut" ("id", "menuItemId", "branchId", "createdAt")
SELECT gen_random_uuid(), "id", '00000000-0000-0000-0000-000000000001', now()
FROM "MenuItem"
WHERE "available" = false;

ALTER TABLE "MenuItem" DROP COLUMN "available";
