-- CreateEnum
CREATE TYPE "app"."PrincipalKind" AS ENUM ('HUMAN', 'SERVICE');

-- CreateEnum
CREATE TYPE "app"."PrincipalStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "app"."Principal" (
    "id" SERIAL NOT NULL,
    "kind" "app"."PrincipalKind" NOT NULL,
    "status" "app"."PrincipalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Principal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."AuthIdentity" (
    "id" SERIAL NOT NULL,
    "principalId" INTEGER NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "legacyAuthUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."User" (
    "id" SERIAL NOT NULL,
    "principalId" INTEGER NOT NULL,
    "name" TEXT,
    "studentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ServiceAccount" (
    "id" SERIAL NOT NULL,
    "principalId" INTEGER NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_legacyAuthUserId_key" ON "app"."AuthIdentity"("legacyAuthUserId");

-- CreateIndex
CREATE INDEX "AuthIdentity_principalId_idx" ON "app"."AuthIdentity"("principalId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_issuer_subject_key" ON "app"."AuthIdentity"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "User_principalId_key" ON "app"."User"("principalId");

-- CreateIndex
CREATE UNIQUE INDEX "User_studentId_key" ON "app"."User"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAccount_principalId_key" ON "app"."ServiceAccount"("principalId");

-- AddForeignKey
ALTER TABLE "app"."AuthIdentity" ADD CONSTRAINT "AuthIdentity_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "app"."Principal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AuthIdentity" ADD CONSTRAINT "AuthIdentity_legacyAuthUserId_fkey" FOREIGN KEY ("legacyAuthUserId") REFERENCES "app"."AuthUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."User" ADD CONSTRAINT "User_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "app"."Principal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."User" ADD CONSTRAINT "User_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "app"."Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ServiceAccount" ADD CONSTRAINT "ServiceAccount_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "app"."Principal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
