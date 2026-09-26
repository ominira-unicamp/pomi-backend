/*
  Warnings:

  - You are about to drop the column `catalogSpecializationId` on the `Curriculum` table. All the data in the column will be lost.
  - You are about to drop the column `specializationId` on the `PeriodPlanning` table. All the data in the column will be lost.
  - You are about to drop the column `catalogSpecializationId` on the `CourseBlock` table. All the data in the column will be lost.
  - You are about to drop the column `catalogProgramId` on the `CurriculumSuggestion` table. All the data in the column will be lost.
  - You are about to drop the column `catalogSpecializationId` on the `CurriculumSuggestion` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `CurriculumSuggestion` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `CurriculumSuggestion` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `CurriculumSuggestion` table. All the data in the column will be lost.
  - You are about to drop the `CatalogSpecialization` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `catalogProgramVariantId` on table `CurriculumSuggestion` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "app"."Curriculum" DROP CONSTRAINT "Curriculum_catalogSpecializationId_fkey";

-- DropForeignKey
ALTER TABLE "app"."PeriodPlanning" DROP CONSTRAINT "PeriodPlanning_specializationId_fkey";

-- DropForeignKey
ALTER TABLE "data"."CatalogSpecialization" DROP CONSTRAINT "CatalogSpecialization_catalogProgramId_fkey";

-- DropForeignKey
ALTER TABLE "data"."CatalogSpecialization" DROP CONSTRAINT "CatalogSpecialization_specializationId_fkey";

-- DropForeignKey
ALTER TABLE "data"."CourseBlock" DROP CONSTRAINT "CourseBlock_catalogSpecializationId_fkey";

-- DropForeignKey
ALTER TABLE "data"."CurriculumSuggestion" DROP CONSTRAINT "CurriculumSuggestion_catalogProgramId_fkey";

-- DropForeignKey
ALTER TABLE "data"."CurriculumSuggestion" DROP CONSTRAINT "CurriculumSuggestion_catalogSpecializationId_fkey";

-- DropIndex
DROP INDEX "app"."PeriodPlanning_specializationId_idx";

-- DropIndex
DROP INDEX "data"."CurriculumSuggestion_catalogProgramId_code_key";

-- DropIndex
DROP INDEX "data"."CurriculumSuggestion_catalogSpecializationId_key";

-- AlterTable
ALTER TABLE "app"."Curriculum" DROP COLUMN "catalogSpecializationId";

-- AlterTable
ALTER TABLE "app"."PeriodPlanning" DROP COLUMN "specializationId";

-- AlterTable
ALTER TABLE "data"."CourseBlock" DROP COLUMN "catalogSpecializationId";

-- AlterTable
ALTER TABLE "data"."CurriculumSuggestion" DROP COLUMN "catalogProgramId",
DROP COLUMN "catalogSpecializationId",
DROP COLUMN "code",
DROP COLUMN "name",
DROP COLUMN "type",
ALTER COLUMN "catalogProgramVariantId" SET NOT NULL;

-- DropTable
DROP TABLE "data"."CatalogSpecialization";

-- DropEnum
DROP TYPE "data"."CurriculumSuggestionType";
