-- CreateEnum
CREATE TYPE "app"."GroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "app"."GroupInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "app"."GroupEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "app"."GroupPermission" AS ENUM ('GROUP_EDIT', 'GROUP_TAG_MANAGE', 'MEMBER_MANAGE', 'ROLE_MANAGE', 'EVENT_CREATE', 'EVENT_EDIT', 'EVENT_PUBLISH');

-- CreateEnum
CREATE TYPE "app"."GroupActiveKey" AS ENUM ('ACTIVE');

-- CreateEnum
CREATE TYPE "app"."GroupPendingKey" AS ENUM ('PENDING');

-- CreateTable
CREATE TABLE "app"."Group" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "app"."GroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."GroupContact" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "label" VARCHAR(80),
    "value" VARCHAR(320) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."GroupLink" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."GroupTag" (
    "groupId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "GroupTag_pkey" PRIMARY KEY ("groupId","tagId")
);

-- CreateTable
CREATE TABLE "app"."GroupInvitation" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "recipientStudentId" INTEGER NOT NULL,
    "inviterStudentId" INTEGER NOT NULL,
    "status" "app"."GroupInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "pendingKey" "app"."GroupPendingKey" DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."GroupMembership" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "activeKey" "app"."GroupActiveKey" DEFAULT 'ACTIVE',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."GroupPosition" (
    "id" SERIAL NOT NULL,
    "membershipId" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."GroupRole" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "GroupRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."GroupRolePermission" (
    "roleId" INTEGER NOT NULL,
    "permission" "app"."GroupPermission" NOT NULL,

    CONSTRAINT "GroupRolePermission_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "app"."GroupMembershipRole" (
    "groupId" INTEGER NOT NULL,
    "membershipId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMembershipRole_pkey" PRIMARY KEY ("membershipId","roleId")
);

-- CreateTable
CREATE TABLE "app"."GroupEvent" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "app"."GroupEventStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "location" VARCHAR(320),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."GroupEventTag" (
    "eventId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "GroupEventTag_pkey" PRIMARY KEY ("eventId","tagId")
);

-- CreateIndex
CREATE INDEX "Group_status_name_idx" ON "app"."Group"("status", "name");

-- CreateIndex
CREATE INDEX "GroupContact_groupId_sortOrder_idx" ON "app"."GroupContact"("groupId", "sortOrder");

-- CreateIndex
CREATE INDEX "GroupLink_groupId_sortOrder_idx" ON "app"."GroupLink"("groupId", "sortOrder");

-- CreateIndex
CREATE INDEX "GroupTag_tagId_idx" ON "app"."GroupTag"("tagId");

-- CreateIndex
CREATE INDEX "GroupInvitation_recipientStudentId_status_expiresAt_idx" ON "app"."GroupInvitation"("recipientStudentId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "GroupInvitation_groupId_status_idx" ON "app"."GroupInvitation"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvitation_groupId_recipientStudentId_pendingKey_key" ON "app"."GroupInvitation"("groupId", "recipientStudentId", "pendingKey");

-- CreateIndex
CREATE INDEX "GroupMembership_studentId_leftAt_idx" ON "app"."GroupMembership"("studentId", "leftAt");

-- CreateIndex
CREATE INDEX "GroupMembership_groupId_isPublic_leftAt_idx" ON "app"."GroupMembership"("groupId", "isPublic", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_studentId_activeKey_key" ON "app"."GroupMembership"("groupId", "studentId", "activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_id_groupId_key" ON "app"."GroupMembership"("id", "groupId");

-- CreateIndex
CREATE INDEX "GroupPosition_membershipId_sortOrder_idx" ON "app"."GroupPosition"("membershipId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRole_groupId_name_key" ON "app"."GroupRole"("groupId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRole_id_groupId_key" ON "app"."GroupRole"("id", "groupId");

-- CreateIndex
CREATE INDEX "GroupMembershipRole_roleId_groupId_idx" ON "app"."GroupMembershipRole"("roleId", "groupId");

-- CreateIndex
CREATE INDEX "GroupEvent_groupId_status_startsAt_idx" ON "app"."GroupEvent"("groupId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "GroupEvent_status_startsAt_idx" ON "app"."GroupEvent"("status", "startsAt");

-- CreateIndex
CREATE INDEX "GroupEventTag_tagId_idx" ON "app"."GroupEventTag"("tagId");

-- AddForeignKey
ALTER TABLE "app"."GroupContact" ADD CONSTRAINT "GroupContact_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupLink" ADD CONSTRAINT "GroupLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupTag" ADD CONSTRAINT "GroupTag_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupTag" ADD CONSTRAINT "GroupTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "app"."Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupInvitation" ADD CONSTRAINT "GroupInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app"."Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupInvitation" ADD CONSTRAINT "GroupInvitation_recipientStudentId_fkey" FOREIGN KEY ("recipientStudentId") REFERENCES "app"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupInvitation" ADD CONSTRAINT "GroupInvitation_inviterStudentId_fkey" FOREIGN KEY ("inviterStudentId") REFERENCES "app"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app"."Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupMembership" ADD CONSTRAINT "GroupMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "app"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupPosition" ADD CONSTRAINT "GroupPosition_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "app"."GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupRole" ADD CONSTRAINT "GroupRole_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app"."Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupRolePermission" ADD CONSTRAINT "GroupRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app"."GroupRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupMembershipRole" ADD CONSTRAINT "GroupMembershipRole_membershipId_groupId_fkey" FOREIGN KEY ("membershipId", "groupId") REFERENCES "app"."GroupMembership"("id", "groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupMembershipRole" ADD CONSTRAINT "GroupMembershipRole_roleId_groupId_fkey" FOREIGN KEY ("roleId", "groupId") REFERENCES "app"."GroupRole"("id", "groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupEvent" ADD CONSTRAINT "GroupEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app"."Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupEventTag" ADD CONSTRAINT "GroupEventTag_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "app"."GroupEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."GroupEventTag" ADD CONSTRAINT "GroupEventTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "app"."Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
