-- CreateEnum
CREATE TYPE "OrderEventAction" AS ENUM ('created', 'confirmed', 'unconfirmed', 'cancelled', 'marked_paid', 'marked_unpaid', 'payment_choice_set', 'item_added', 'item_removed', 'item_quantity_changed');

-- CreateEnum
CREATE TYPE "OrderEventActorRole" AS ENUM ('customer', 'staff', 'admin');

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" "OrderEventAction" NOT NULL,
    "actorRole" "OrderEventActorRole" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" SERIAL NOT NULL,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
