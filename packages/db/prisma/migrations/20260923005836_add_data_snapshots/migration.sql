-- CreateEnum
CREATE TYPE "app"."DataSnapshotStatus" AS ENUM ('COLLECTING', 'VALIDATED', 'PERSISTING', 'PUBLISHED', 'INVALID', 'FAILED');

-- CreateEnum
CREATE TYPE "app"."DataSnapshotComponentStatus" AS ENUM ('COMPLETE', 'UNAVAILABLE', 'FAILED', 'PERSISTED');

-- CreateTable
CREATE TABLE "app"."DataSnapshot" (
    "id" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "protocolVersion" INTEGER NOT NULL,
    "workflow" TEXT NOT NULL,
    "partitionKey" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "status" "app"."DataSnapshotStatus" NOT NULL DEFAULT 'COLLECTING',
    "manifestPath" TEXT NOT NULL,
    "manifestSha256" TEXT,
    "producer" JSONB,
    "jobRequestId" TEXT,
    "collectedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "persistedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."DataSnapshotComponent" (
    "id" SERIAL NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "status" "app"."DataSnapshotComponentStatus" NOT NULL,
    "artifactPath" TEXT,
    "artifactSha256" TEXT,
    "recordCount" INTEGER,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "persistedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSnapshotComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataSnapshot_workflow_partitionKey_status_idx" ON "app"."DataSnapshot"("workflow", "partitionKey", "status");

-- CreateIndex
CREATE INDEX "DataSnapshot_jobRequestId_idx" ON "app"."DataSnapshot"("jobRequestId");

-- CreateIndex
CREATE INDEX "DataSnapshotComponent_status_idx" ON "app"."DataSnapshotComponent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DataSnapshotComponent_snapshotId_name_key" ON "app"."DataSnapshotComponent"("snapshotId", "name");

-- AddForeignKey
ALTER TABLE "app"."DataSnapshot" ADD CONSTRAINT "DataSnapshot_jobRequestId_fkey" FOREIGN KEY ("jobRequestId") REFERENCES "app"."JobRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."DataSnapshotComponent" ADD CONSTRAINT "DataSnapshotComponent_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "app"."DataSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
