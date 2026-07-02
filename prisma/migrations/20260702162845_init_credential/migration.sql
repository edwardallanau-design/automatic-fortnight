-- CreateEnum
CREATE TYPE "Role" AS ENUM ('staff', 'admin');

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Credential_role_key" ON "Credential"("role");
