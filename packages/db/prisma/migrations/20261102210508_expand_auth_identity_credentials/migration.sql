/*
  Warnings:

  - A unique constraint covering the columns `[legacyId]` on the table `AuthIdentity` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "app"."AuthIdentityStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "app"."AuthIdentity" ADD COLUMN     "credentialUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "legacyStudentId" INTEGER,
ADD COLUMN     "registeredAt" TIMESTAMP(3),
ADD COLUMN     "status" "app"."AuthIdentityStatus";

-- AlterTable
ALTER TABLE "app"."BotGrant" ADD COLUMN     "botAuthIdentityId" INTEGER,
ADD COLUMN     "grantedByAuthIdentityId" INTEGER,
ADD COLUMN     "revokedByAuthIdentityId" INTEGER;

-- CreateTable
CREATE TABLE "app"."AuthIdentityRole" (
    "authIdentityId" INTEGER NOT NULL,
    "role" "app"."AuthRole" NOT NULL,

    CONSTRAINT "AuthIdentityRole_pkey" PRIMARY KEY ("authIdentityId","role")
);

-- CreateTable
CREATE TABLE "app"."AuthIdentityCapability" (
    "authIdentityId" INTEGER NOT NULL,
    "capability" "app"."Capability" NOT NULL,

    CONSTRAINT "AuthIdentityCapability_pkey" PRIMARY KEY ("authIdentityId","capability")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_legacyId_key" ON "app"."AuthIdentity"("legacyId");

-- AddForeignKey
ALTER TABLE "app"."AuthIdentityRole" ADD CONSTRAINT "AuthIdentityRole_authIdentityId_fkey" FOREIGN KEY ("authIdentityId") REFERENCES "app"."AuthIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AuthIdentityCapability" ADD CONSTRAINT "AuthIdentityCapability_authIdentityId_fkey" FOREIGN KEY ("authIdentityId") REFERENCES "app"."AuthIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BotGrant" ADD CONSTRAINT "BotGrant_botAuthIdentityId_fkey" FOREIGN KEY ("botAuthIdentityId") REFERENCES "app"."AuthIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BotGrant" ADD CONSTRAINT "BotGrant_grantedByAuthIdentityId_fkey" FOREIGN KEY ("grantedByAuthIdentityId") REFERENCES "app"."AuthIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BotGrant" ADD CONSTRAINT "BotGrant_revokedByAuthIdentityId_fkey" FOREIGN KEY ("revokedByAuthIdentityId") REFERENCES "app"."AuthIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
