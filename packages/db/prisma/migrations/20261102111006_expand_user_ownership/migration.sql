/*
  Warnings:

  - A unique constraint covering the columns `[userId,noticeId]` on the table `ExchangeNoticeDelivery` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `ExchangeNoticeSubscription` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[subscriptionUserId,placeId]` on the table `ExchangeNoticeSubscriptionPlace` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[groupId,recipientUserId,pendingKey]` on the table `GroupInvitation` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[groupId,userId,activeKey]` on the table `GroupMembership` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,classId,professorId]` on the table `ProfessorEvaluation` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,courseId,studyPeriodId]` on the table `StudentCourseAttempt` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userAId,userBId]` on the table `StudentFriendship` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,tagId]` on the table `StudentTagInterest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[publicId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[avatarMediaId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[favoriteCurriculumId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "app"."BotGrant" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."Curriculum" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."ExchangeNoticeDelivery" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."ExchangeNoticeSubscription" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."ExchangeNoticeSubscriptionPlace" ADD COLUMN     "subscriptionUserId" INTEGER;

-- AlterTable
ALTER TABLE "app"."FeedbackReport" ADD COLUMN     "reporterUserId" INTEGER;

-- AlterTable
ALTER TABLE "app"."GroupInvitation" ADD COLUMN     "inviterUserId" INTEGER,
ADD COLUMN     "recipientUserId" INTEGER;

-- AlterTable
ALTER TABLE "app"."GroupMembership" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."PeriodPlanning" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."ProfessorEvaluation" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."StudentCourseAttempt" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."StudentFriendship" ADD COLUMN     "requestedByUserId" INTEGER,
ADD COLUMN     "userAId" INTEGER,
ADD COLUMN     "userBId" INTEGER;

-- AlterTable
ALTER TABLE "app"."StudentTagInterest" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "app"."User" ADD COLUMN     "avatarMediaId" UUID,
ADD COLUMN     "avatarRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentCoursesVisibility" "app"."StudentCurrentCoursesVisibility" NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN     "favoriteCurriculumId" INTEGER,
ADD COLUMN     "publicBio" VARCHAR(280),
ADD COLUMN     "publicDisplayName" VARCHAR(80),
ADD COLUMN     "publicId" TEXT NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "publicProfileEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "app"."UserEmail" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ExchangeNoticeDeliveryRecipient" (
    "id" SERIAL NOT NULL,
    "deliveryId" INTEGER NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "status" "app"."ExchangeNoticeDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeNoticeDeliveryRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserEmail_userId_email_key" ON "app"."UserEmail"("userId", "email");

-- CreateIndex
CREATE INDEX "ExchangeNoticeDeliveryRecipient_status_nextAttemptAt_idx" ON "app"."ExchangeNoticeDeliveryRecipient"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeNoticeDeliveryRecipient_deliveryId_email_key" ON "app"."ExchangeNoticeDeliveryRecipient"("deliveryId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeNoticeDelivery_userId_noticeId_key" ON "app"."ExchangeNoticeDelivery"("userId", "noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeNoticeSubscription_userId_key" ON "app"."ExchangeNoticeSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeNoticeSubscriptionPlace_subscriptionUserId_placeId_key" ON "app"."ExchangeNoticeSubscriptionPlace"("subscriptionUserId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvitation_groupId_recipientUserId_pendingKey_key" ON "app"."GroupInvitation"("groupId", "recipientUserId", "pendingKey");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_userId_activeKey_key" ON "app"."GroupMembership"("groupId", "userId", "activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessorEvaluation_userId_classId_professorId_key" ON "app"."ProfessorEvaluation"("userId", "classId", "professorId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCourseAttempt_userId_courseId_studyPeriodId_key" ON "app"."StudentCourseAttempt"("userId", "courseId", "studyPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFriendship_userAId_userBId_key" ON "app"."StudentFriendship"("userAId", "userBId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentTagInterest_userId_tagId_key" ON "app"."StudentTagInterest"("userId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "app"."User"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_avatarMediaId_key" ON "app"."User"("avatarMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "User_favoriteCurriculumId_key" ON "app"."User"("favoriteCurriculumId");

-- AddForeignKey
ALTER TABLE "app"."User" ADD CONSTRAINT "User_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "app"."MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."User" ADD CONSTRAINT "User_favoriteCurriculumId_fkey" FOREIGN KEY ("favoriteCurriculumId") REFERENCES "app"."Curriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."StudentTagInterest" ADD CONSTRAINT "StudentTagInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ExchangeNoticeSubscription" ADD CONSTRAINT "ExchangeNoticeSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ExchangeNoticeSubscriptionPlace" ADD CONSTRAINT "ExchangeNoticeSubscriptionPlace_subscriptionUserId_fkey" FOREIGN KEY ("subscriptionUserId") REFERENCES "app"."ExchangeNoticeSubscription"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ExchangeNoticeDelivery" ADD CONSTRAINT "ExchangeNoticeDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."FeedbackReport" ADD CONSTRAINT "FeedbackReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."StudentFriendship" ADD CONSTRAINT "StudentFriendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."StudentFriendship" ADD CONSTRAINT "StudentFriendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."StudentFriendship" ADD CONSTRAINT "StudentFriendship_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BotGrant" ADD CONSTRAINT "BotGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."StudentCourseAttempt" ADD CONSTRAINT "StudentCourseAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ProfessorEvaluation" ADD CONSTRAINT "ProfessorEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Curriculum" ADD CONSTRAINT "Curriculum_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."PeriodPlanning" ADD CONSTRAINT "PeriodPlanning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupInvitation" ADD CONSTRAINT "GroupInvitation_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupInvitation" ADD CONSTRAINT "GroupInvitation_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupMembership" ADD CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ExchangeNoticeDeliveryRecipient" ADD CONSTRAINT "ExchangeNoticeDeliveryRecipient_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "app"."ExchangeNoticeDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
