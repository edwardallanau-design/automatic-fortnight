-- CreateEnum
CREATE TYPE "PaymentChoice" AS ENUM ('None', 'Counter', 'Online');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentChoice" "PaymentChoice" NOT NULL DEFAULT 'None',
ADD COLUMN     "paymentMethodId" TEXT,
ADD COLUMN     "paymentMethodNameSnapshot" TEXT,
ADD COLUMN     "paymentReference" TEXT;

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "qrImageUrl" TEXT,
    "accountInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
