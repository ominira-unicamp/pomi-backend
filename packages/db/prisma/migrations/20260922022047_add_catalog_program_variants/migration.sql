/*
  Warnings:

  - A unique constraint covering the columns `[catalogProgramVariantId]` on the table `CurriculumSuggestion` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "data"."CatalogProgramShift" AS ENUM ('INTEGRAL', 'NOTURNO');

-- CreateEnum
CREATE TYPE "data"."CatalogCreditLimitType" AS ENUM ('NONE', 'FIXED', 'CR_FORMULA');

-- AlterTable
ALTER TABLE "app"."Curriculum" ADD COLUMN     "catalogProgramVariantId" INTEGER;

-- AlterTable
ALTER TABLE "app"."PeriodPlanning" ADD COLUMN     "catalogProgramVariantId" INTEGER;

-- AlterTable
ALTER TABLE "data"."CatalogProgram" ADD COLUMN     "creditLimitBeforeThresholdCredits" INTEGER,
ADD COLUMN     "creditLimitCrBase" INTEGER,
ADD COLUMN     "creditLimitCrMultiplier" DOUBLE PRECISION,
ADD COLUMN     "creditLimitFixedCredits" INTEGER,
ADD COLUMN     "creditLimitThresholdCredits" INTEGER,
ADD COLUMN     "creditLimitType" "data"."CatalogCreditLimitType",
ADD COLUMN     "professionalPracticeDescription" TEXT,
ADD COLUMN     "shift" "data"."CatalogProgramShift";

-- AlterTable
ALTER TABLE "data"."CourseBlock" ADD COLUMN     "catalogProgramVariantId" INTEGER;

-- AlterTable
ALTER TABLE "data"."CurriculumSuggestion" ADD COLUMN     "catalogProgramVariantId" INTEGER;

-- CreateTable
CREATE TABLE "data"."CatalogProgramVariant" (
    "id" SERIAL NOT NULL,
    "catalogProgramId" INTEGER NOT NULL,
    "programId" INTEGER,
    "specializationId" INTEGER,
    "integralizationCredits" INTEGER,
    "integralizationSupervisedHours" INTEGER,
    "integralizationExtensionHours" INTEGER,
    "integralizationSemesters" INTEGER,
    "integralizationMaximumSemesters" INTEGER,
    "professionalDescription" TEXT,
    "recognitionDescription" TEXT,

    CONSTRAINT "CatalogProgramVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogProgramVariant_programId_idx" ON "data"."CatalogProgramVariant"("programId");

-- CreateIndex
CREATE INDEX "CatalogProgramVariant_specializationId_idx" ON "data"."CatalogProgramVariant"("specializationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProgramVariant_catalogProgramId_programId_key" ON "data"."CatalogProgramVariant"("catalogProgramId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProgramVariant_catalogProgramId_specializationId_key" ON "data"."CatalogProgramVariant"("catalogProgramId", "specializationId");

-- CreateIndex
CREATE INDEX "PeriodPlanning_catalogProgramVariantId_idx" ON "app"."PeriodPlanning"("catalogProgramVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumSuggestion_catalogProgramVariantId_key" ON "data"."CurriculumSuggestion"("catalogProgramVariantId");

-- AddForeignKey
ALTER TABLE "data"."CurriculumSuggestion" ADD CONSTRAINT "CurriculumSuggestion_catalogProgramVariantId_fkey" FOREIGN KEY ("catalogProgramVariantId") REFERENCES "data"."CatalogProgramVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data"."CatalogProgramVariant" ADD CONSTRAINT "CatalogProgramVariant_catalogProgramId_fkey" FOREIGN KEY ("catalogProgramId") REFERENCES "data"."CatalogProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data"."CatalogProgramVariant" ADD CONSTRAINT "CatalogProgramVariant_programId_fkey" FOREIGN KEY ("programId") REFERENCES "data"."Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data"."CatalogProgramVariant" ADD CONSTRAINT "CatalogProgramVariant_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "data"."Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data"."CourseBlock" ADD CONSTRAINT "CourseBlock_catalogProgramVariantId_fkey" FOREIGN KEY ("catalogProgramVariantId") REFERENCES "data"."CatalogProgramVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Curriculum" ADD CONSTRAINT "Curriculum_catalogProgramVariantId_fkey" FOREIGN KEY ("catalogProgramVariantId") REFERENCES "data"."CatalogProgramVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."PeriodPlanning" ADD CONSTRAINT "PeriodPlanning_catalogProgramVariantId_fkey" FOREIGN KEY ("catalogProgramVariantId") REFERENCES "data"."CatalogProgramVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
