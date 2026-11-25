/*
  Warnings:

  - The values [STUDENT_PROFILE_READ,STUDENT_PROFILE_WRITE,STUDENT_HISTORY_READ,STUDENT_HISTORY_WRITE,STUDENT_PLANNING_READ,STUDENT_PLANNING_WRITE,STUDENT_SOCIAL_READ,STUDENT_SOCIAL_WRITE,STUDENT_FEEDBACK_WRITE,STUDENT_FEEDBACK_READ] on the enum `StudentCapability` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `legacyId` on the `AuthIdentity` table. All the data in the column will be lost.
  - You are about to drop the column `legacyStudentId` on the `AuthIdentity` table. All the data in the column will be lost.
  - You are about to drop the column `legacyStudentId` on the `User` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "app"."StudentCapability_new" AS ENUM ('USER_PROFILE_READ', 'USER_PROFILE_WRITE', 'USER_HISTORY_READ', 'USER_HISTORY_WRITE', 'USER_PLANNING_READ', 'USER_PLANNING_WRITE', 'USER_SOCIAL_READ', 'USER_SOCIAL_WRITE', 'USER_FEEDBACK_WRITE', 'USER_FEEDBACK_READ');
ALTER TABLE "app"."BotGrant" ALTER COLUMN "capability" TYPE "app"."StudentCapability_new" USING ("capability"::text::"app"."StudentCapability_new");
ALTER TYPE "app"."StudentCapability" RENAME TO "StudentCapability_old";
ALTER TYPE "app"."StudentCapability_new" RENAME TO "StudentCapability";
DROP TYPE "app"."StudentCapability_old";
COMMIT;

-- DropIndex
DROP INDEX "app"."AuthIdentity_legacyId_key";

-- DropIndex
DROP INDEX "app"."User_legacyStudentId_key";

-- AlterTable
ALTER TABLE "app"."AuthIdentity" DROP COLUMN "legacyId",
DROP COLUMN "legacyStudentId";

-- AlterTable
ALTER TABLE "app"."User" DROP COLUMN "legacyStudentId";
