/*
  Warnings:

  - You are about to drop the column `studentId` on the `BotGrant` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `Curriculum` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `ExchangeNoticeDelivery` table. All the data in the column will be lost.
  - The primary key for the `ExchangeNoticeSubscription` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `studentId` on the `ExchangeNoticeSubscription` table. All the data in the column will be lost.
  - The primary key for the `ExchangeNoticeSubscriptionPlace` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `subscriptionStudentId` on the `ExchangeNoticeSubscriptionPlace` table. All the data in the column will be lost.
  - You are about to drop the column `reporterStudentId` on the `FeedbackReport` table. All the data in the column will be lost.
  - You are about to drop the column `inviterStudentId` on the `GroupInvitation` table. All the data in the column will be lost.
  - You are about to drop the column `recipientStudentId` on the `GroupInvitation` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `GroupMembership` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `PeriodPlanning` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `ProfessorEvaluation` table. All the data in the column will be lost.
  - You are about to drop the column `avatarMediaId` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `avatarRevision` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `currentCoursesVisibility` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `favoriteCurriculumId` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `publicBio` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `publicDisplayName` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `publicId` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `publicProfileEnabled` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `StudentCourseAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `requestedById` on the `StudentFriendship` table. All the data in the column will be lost.
  - You are about to drop the column `studentAId` on the `StudentFriendship` table. All the data in the column will be lost.
  - You are about to drop the column `studentBId` on the `StudentFriendship` table. All the data in the column will be lost.
  - The primary key for the `StudentTagInterest` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `studentId` on the `StudentTagInterest` table. All the data in the column will be lost.
  - Made the column `userId` on table `BotGrant` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `Curriculum` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `ExchangeNoticeDelivery` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `ExchangeNoticeSubscription` required. This step will fail if there are existing NULL values in that column.
  - Made the column `subscriptionUserId` on table `ExchangeNoticeSubscriptionPlace` required. This step will fail if there are existing NULL values in that column.
  - Made the column `inviterUserId` on table `GroupInvitation` required. This step will fail if there are existing NULL values in that column.
  - Made the column `recipientUserId` on table `GroupInvitation` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `GroupMembership` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `PeriodPlanning` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `ProfessorEvaluation` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `StudentCourseAttempt` required. This step will fail if there are existing NULL values in that column.
  - Made the column `requestedByUserId` on table `StudentFriendship` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userAId` on table `StudentFriendship` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userBId` on table `StudentFriendship` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `StudentTagInterest` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "app"."AuthUser" DROP CONSTRAINT "AuthUser_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."BotGrant" DROP CONSTRAINT "BotGrant_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."Curriculum" DROP CONSTRAINT "Curriculum_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."ExchangeNoticeDelivery" DROP CONSTRAINT "ExchangeNoticeDelivery_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."ExchangeNoticeSubscription" DROP CONSTRAINT "ExchangeNoticeSubscription_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."ExchangeNoticeSubscriptionPlace" DROP CONSTRAINT "ExchangeNoticeSubscriptionPlace_subscriptionStudentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."ExchangeNoticeSubscriptionPlace" DROP CONSTRAINT "ExchangeNoticeSubscriptionPlace_subscriptionUserId_fkey";

-- DropForeignKey
ALTER TABLE "app"."FeedbackReport" DROP CONSTRAINT "FeedbackReport_reporterStudentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."GroupInvitation" DROP CONSTRAINT "GroupInvitation_inviterStudentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."GroupInvitation" DROP CONSTRAINT "GroupInvitation_recipientStudentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."GroupMembership" DROP CONSTRAINT "GroupMembership_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."PeriodPlanning" DROP CONSTRAINT "PeriodPlanning_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."ProfessorEvaluation" DROP CONSTRAINT "ProfessorEvaluation_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."Student" DROP CONSTRAINT "Student_avatarMediaId_fkey";

-- DropForeignKey
ALTER TABLE "app"."Student" DROP CONSTRAINT "Student_favoriteCurriculumId_fkey";

-- DropForeignKey
ALTER TABLE "app"."StudentCourseAttempt" DROP CONSTRAINT "StudentCourseAttempt_studentId_fkey";

-- DropForeignKey
ALTER TABLE "app"."StudentFriendship" DROP CONSTRAINT "StudentFriendship_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "app"."StudentFriendship" DROP CONSTRAINT "StudentFriendship_studentAId_fkey";

-- DropForeignKey
ALTER TABLE "app"."StudentFriendship" DROP CONSTRAINT "StudentFriendship_studentBId_fkey";

-- DropForeignKey
ALTER TABLE "app"."StudentTagInterest" DROP CONSTRAINT "StudentTagInterest_studentId_fkey";

-- DropIndex
DROP INDEX "app"."BotGrant_studentId_botAuthUserId_capability_revokedAt_idx";

-- DropIndex
DROP INDEX "app"."Curriculum_studentId_updatedAt_idx";

-- DropIndex
DROP INDEX "app"."ExchangeNoticeDelivery_studentId_noticeId_key";

-- DropIndex
DROP INDEX "app"."ExchangeNoticeSubscription_userId_key";

-- DropIndex
DROP INDEX "app"."ExchangeNoticeSubscriptionPlace_subscriptionUserId_placeId_key";

-- DropIndex
DROP INDEX "app"."FeedbackReport_reporterStudentId_idx";

-- DropIndex
DROP INDEX "app"."GroupInvitation_groupId_recipientStudentId_pendingKey_key";

-- DropIndex
DROP INDEX "app"."GroupInvitation_recipientStudentId_status_expiresAt_idx";

-- DropIndex
DROP INDEX "app"."GroupMembership_groupId_studentId_activeKey_key";

-- DropIndex
DROP INDEX "app"."GroupMembership_studentId_leftAt_idx";

-- DropIndex
DROP INDEX "app"."PeriodPlanning_studentId_updatedAt_idx";

-- DropIndex
DROP INDEX "app"."ProfessorEvaluation_studentId_classId_professorId_key";

-- DropIndex
DROP INDEX "app"."Student_avatarMediaId_key";

-- DropIndex
DROP INDEX "app"."Student_favoriteCurriculumId_key";

-- DropIndex
DROP INDEX "app"."Student_publicId_key";

-- DropIndex
DROP INDEX "app"."StudentCourseAttempt_studentId_courseId_idx";

-- DropIndex
DROP INDEX "app"."StudentCourseAttempt_studentId_courseId_studyPeriodId_key";

-- DropIndex
DROP INDEX "app"."StudentCourseAttempt_studentId_status_idx";

-- DropIndex
DROP INDEX "app"."StudentCourseAttempt_studentId_studyPeriodId_idx";

-- DropIndex
DROP INDEX "app"."StudentFriendship_requestedById_status_idx";

-- DropIndex
DROP INDEX "app"."StudentFriendship_studentAId_status_idx";

-- DropIndex
DROP INDEX "app"."StudentFriendship_studentAId_studentBId_key";

-- DropIndex
DROP INDEX "app"."StudentFriendship_studentBId_status_idx";

-- DropIndex
DROP INDEX "app"."StudentTagInterest_userId_tagId_key";

-- AlterTable
ALTER TABLE "app"."BotGrant" DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."Curriculum" DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."ExchangeNoticeDelivery" DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."ExchangeNoticeSubscription" DROP CONSTRAINT "ExchangeNoticeSubscription_pkey",
DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL,
ADD CONSTRAINT "ExchangeNoticeSubscription_pkey" PRIMARY KEY ("userId");

-- AlterTable
ALTER TABLE "app"."ExchangeNoticeSubscriptionPlace" DROP CONSTRAINT "ExchangeNoticeSubscriptionPlace_pkey",
DROP COLUMN "subscriptionStudentId",
ALTER COLUMN "subscriptionUserId" SET NOT NULL,
ADD CONSTRAINT "ExchangeNoticeSubscriptionPlace_pkey" PRIMARY KEY ("subscriptionUserId", "placeId");

-- AlterTable
ALTER TABLE "app"."FeedbackReport" DROP COLUMN "reporterStudentId";

-- AlterTable
ALTER TABLE "app"."GroupInvitation" DROP COLUMN "inviterStudentId",
DROP COLUMN "recipientStudentId",
ALTER COLUMN "inviterUserId" SET NOT NULL,
ALTER COLUMN "recipientUserId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."GroupMembership" DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."PeriodPlanning" DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."ProfessorEvaluation" DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."Student" DROP COLUMN "avatarMediaId",
DROP COLUMN "avatarRevision",
DROP COLUMN "currentCoursesVisibility",
DROP COLUMN "favoriteCurriculumId",
DROP COLUMN "publicBio",
DROP COLUMN "publicDisplayName",
DROP COLUMN "publicId",
DROP COLUMN "publicProfileEnabled";

-- AlterTable
ALTER TABLE "app"."StudentCourseAttempt" DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."StudentFriendship" DROP COLUMN "requestedById",
DROP COLUMN "studentAId",
DROP COLUMN "studentBId",
ALTER COLUMN "requestedByUserId" SET NOT NULL,
ALTER COLUMN "userAId" SET NOT NULL,
ALTER COLUMN "userBId" SET NOT NULL;

-- AlterTable
ALTER TABLE "app"."StudentTagInterest" DROP CONSTRAINT "StudentTagInterest_pkey",
DROP COLUMN "studentId",
ALTER COLUMN "userId" SET NOT NULL,
ADD CONSTRAINT "StudentTagInterest_pkey" PRIMARY KEY ("userId", "tagId");

-- CreateIndex
CREATE INDEX "BotGrant_userId_idx" ON "app"."BotGrant"("userId");

-- CreateIndex
CREATE INDEX "BotGrant_userId_botAuthUserId_capability_revokedAt_idx" ON "app"."BotGrant"("userId", "botAuthUserId", "capability", "revokedAt");

-- CreateIndex
CREATE INDEX "Curriculum_userId_idx" ON "app"."Curriculum"("userId");

-- CreateIndex
CREATE INDEX "Curriculum_userId_updatedAt_idx" ON "app"."Curriculum"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "FeedbackReport_reporterUserId_idx" ON "app"."FeedbackReport"("reporterUserId");

-- CreateIndex
CREATE INDEX "GroupInvitation_recipientUserId_status_expiresAt_idx" ON "app"."GroupInvitation"("recipientUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "GroupMembership_userId_idx" ON "app"."GroupMembership"("userId");

-- CreateIndex
CREATE INDEX "GroupMembership_userId_leftAt_idx" ON "app"."GroupMembership"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "PeriodPlanning_userId_idx" ON "app"."PeriodPlanning"("userId");

-- CreateIndex
CREATE INDEX "PeriodPlanning_userId_updatedAt_idx" ON "app"."PeriodPlanning"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "StudentCourseAttempt_userId_idx" ON "app"."StudentCourseAttempt"("userId");

-- CreateIndex
CREATE INDEX "StudentCourseAttempt_userId_studyPeriodId_idx" ON "app"."StudentCourseAttempt"("userId", "studyPeriodId");

-- CreateIndex
CREATE INDEX "StudentCourseAttempt_userId_status_idx" ON "app"."StudentCourseAttempt"("userId", "status");

-- CreateIndex
CREATE INDEX "StudentFriendship_userAId_status_idx" ON "app"."StudentFriendship"("userAId", "status");

-- CreateIndex
CREATE INDEX "StudentFriendship_userBId_status_idx" ON "app"."StudentFriendship"("userBId", "status");

-- CreateIndex
CREATE INDEX "StudentFriendship_requestedByUserId_status_idx" ON "app"."StudentFriendship"("requestedByUserId", "status");

-- AddForeignKey
ALTER TABLE "app"."ExchangeNoticeSubscriptionPlace" ADD CONSTRAINT "ExchangeNoticeSubscriptionPlace_subscriptionUserId_fkey" FOREIGN KEY ("subscriptionUserId") REFERENCES "app"."ExchangeNoticeSubscription"("userId") ON DELETE CASCADE ON UPDATE RESTRICT;
