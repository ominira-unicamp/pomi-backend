/*
  Warnings:

  - A unique constraint covering the columns `[avatarMediaId]` on the table `Group` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bannerMediaId]` on the table `Group` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[avatarMediaId]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "app"."MediaAssetStatus" AS ENUM ('ACTIVE', 'PENDING_DELETE', 'DELETED');

-- AlterTable
ALTER TABLE "app"."Group" ADD COLUMN     "avatarMediaId" UUID,
ADD COLUMN     "avatarRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bannerMediaId" UUID,
ADD COLUMN     "bannerRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "app"."Student" ADD COLUMN     "avatarMediaId" UUID,
ADD COLUMN     "avatarRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "app"."MediaAsset" (
    "id" UUID NOT NULL,
    "alias" VARCHAR(160) NOT NULL,
    "contentType" VARCHAR(32) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "status" "app"."MediaAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleteAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextDeleteAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "lastDeleteError" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_alias_key" ON "app"."MediaAsset"("alias");

-- CreateIndex
CREATE INDEX "MediaAsset_status_nextDeleteAt_idx" ON "app"."MediaAsset"("status", "nextDeleteAt");

-- CreateIndex
CREATE UNIQUE INDEX "Group_avatarMediaId_key" ON "app"."Group"("avatarMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_bannerMediaId_key" ON "app"."Group"("bannerMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_avatarMediaId_key" ON "app"."Student"("avatarMediaId");

-- AddForeignKey
ALTER TABLE "app"."Student" ADD CONSTRAINT "Student_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "app"."MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Group" ADD CONSTRAINT "Group_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "app"."MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Group" ADD CONSTRAINT "Group_bannerMediaId_fkey" FOREIGN KEY ("bannerMediaId") REFERENCES "app"."MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
