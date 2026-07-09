-- CreateTable
CREATE TABLE "VenueSettings" (
    "id" TEXT NOT NULL,
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueSettings_pkey" PRIMARY KEY ("id")
);
