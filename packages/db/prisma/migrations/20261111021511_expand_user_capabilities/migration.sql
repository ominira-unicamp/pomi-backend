-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_PROFILE_READ';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_PROFILE_WRITE';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_HISTORY_READ';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_HISTORY_WRITE';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_PLANNING_READ';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_PLANNING_WRITE';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_SOCIAL_READ';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_SOCIAL_WRITE';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_FEEDBACK_WRITE';
ALTER TYPE "app"."StudentCapability" ADD VALUE 'USER_FEEDBACK_READ';
