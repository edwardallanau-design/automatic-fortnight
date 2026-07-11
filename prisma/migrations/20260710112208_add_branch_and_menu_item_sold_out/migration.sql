-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemSoldOut" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItemSoldOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemSoldOut_menuItemId_branchId_key" ON "MenuItemSoldOut"("menuItemId", "branchId");

-- AddForeignKey
ALTER TABLE "MenuItemSoldOut" ADD CONSTRAINT "MenuItemSoldOut_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemSoldOut" ADD CONSTRAINT "MenuItemSoldOut_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
