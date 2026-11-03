/*
  Warnings:

  - You are about to drop the column `legacyAuthUserId` on the `AuthIdentity` table. All the data in the column will be lost.
  - You are about to drop the column `botAuthUserId` on the `BotGrant` table. All the data in the column will be lost.
  - You are about to drop the column `grantedByAuthUserId` on the `BotGrant` table. All the data in the column will be lost.
  - You are about to drop the column `revokedByAuthUserId` on the `BotGrant` table. All the data in the column will be lost.
  - You are about to drop the `AuthUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuthUserCapability` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuthUserRole` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `credentialUpdatedAt` on table `AuthIdentity` required. This step will fail if there are existing NULL values in that column.
  - Made the column `legacyId` on table `AuthIdentity` required. This step will fail if there are existing NULL values in that column.
  - Made the column `registeredAt` on table `AuthIdentity` required. This step will fail if there are existing NULL values in that column.
  - Made the column `status` on table `AuthIdentity` required. This step will fail if there are existing NULL values in that column.
  - Made the column `botAuthIdentityId` on table `BotGrant` required. This step will fail if there are existing NULL values in that column.
  - Made the column `grantedByAuthIdentityId` on table `BotGrant` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "app"."AuthIdentity" DROP CONSTRAINT "AuthIdentity_legacyAuthUserId_fkey";

-- DropForeignKey
ALTER TABLE "app"."AuthUserCapability" DROP CONSTRAINT "AuthUserCapability_authUserId_fkey";

-- DropForeignKey
ALTER TABLE "app"."AuthUserRole" DROP CONSTRAINT "AuthUserRole_authUserId_fkey";

-- DropForeignKey
ALTER TABLE "app"."BotGrant" DROP CONSTRAINT "BotGrant_botAuthUserId_fkey";

-- DropForeignKey
ALTER TABLE "app"."BotGrant" DROP CONSTRAINT "BotGrant_grantedByAuthIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "app"."BotGrant" DROP CONSTRAINT "BotGrant_grantedByAuthUserId_fkey";

-- DropForeignKey
ALTER TABLE "app"."BotGrant" DROP CONSTRAINT "BotGrant_revokedByAuthUserId_fkey";

-- DropIndex
DROP INDEX "app"."AuthIdentity_legacyAuthUserId_key";

-- DropIndex
DROP INDEX "app"."BotGrant_userId_botAuthUserId_capability_revokedAt_idx";

-- AlterTable
CREATE SEQUENCE "app".authidentity_legacyid_seq;
ALTER TABLE "app"."AuthIdentity" DROP COLUMN "legacyAuthUserId",
ALTER COLUMN "credentialUpdatedAt" SET NOT NULL,
ALTER COLUMN "credentialUpdatedAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "legacyId" SET NOT NULL,
ALTER COLUMN "legacyId" SET DEFAULT nextval('"app".authidentity_legacyid_seq'),
ALTER COLUMN "registeredAt" SET NOT NULL,
ALTER COLUMN "registeredAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER SEQUENCE "app".authidentity_legacyid_seq OWNED BY "app"."AuthIdentity"."legacyId";

-- AlterTable
ALTER TABLE "app"."BotGrant" DROP COLUMN "botAuthUserId",
DROP COLUMN "grantedByAuthUserId",
DROP COLUMN "revokedByAuthUserId",
ALTER COLUMN "botAuthIdentityId" SET NOT NULL,
ALTER COLUMN "grantedByAuthIdentityId" SET NOT NULL;

-- DropTable
DROP TABLE "app"."AuthUser";

-- DropTable
DROP TABLE "app"."AuthUserCapability";

-- DropTable
DROP TABLE "app"."AuthUserRole";

-- DropEnum
DROP TYPE "app"."AuthUserStatus";

-- CreateIndex
CREATE INDEX "BotGrant_userId_botAuthIdentityId_capability_revokedAt_idx" ON "app"."BotGrant"("userId", "botAuthIdentityId", "capability", "revokedAt");

-- AddForeignKey
ALTER TABLE "app"."BotGrant" ADD CONSTRAINT "BotGrant_grantedByAuthIdentityId_fkey" FOREIGN KEY ("grantedByAuthIdentityId") REFERENCES "app"."AuthIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
