/*
  Warnings:

  - You are about to drop the column `bannerMediaId` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the column `bannerRevision` on the `Group` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "app"."Group" DROP CONSTRAINT "Group_bannerMediaId_fkey";

-- DropIndex
DROP INDEX "app"."Group_bannerMediaId_key";

-- AlterTable
ALTER TABLE "app"."Group" DROP COLUMN "bannerMediaId",
DROP COLUMN "bannerRevision";
