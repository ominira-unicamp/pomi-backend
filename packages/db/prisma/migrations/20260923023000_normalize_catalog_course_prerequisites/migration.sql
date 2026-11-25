CREATE TYPE "data"."CatalogCoursePrerequisiteFulfillment" AS ENUM ('FULL', 'PARTIAL');

CREATE TYPE "data"."CatalogCourseSpecialRequirementType" AS ENUM ('AUTHORIZATION', 'PROGRESSION_COEFFICIENT');

ALTER TABLE "data"."CatalogCoursePrerequisiteItem"
    ADD COLUMN "fulfillment" "data"."CatalogCoursePrerequisiteFulfillment",
    ADD COLUMN "specialRequirementType" "data"."CatalogCourseSpecialRequirementType",
    ADD COLUMN "specialRequirementValue" INTEGER;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "data"."CatalogCoursePrerequisiteItem"
        WHERE "kind" IN ('FULL', 'PARTIAL')
          AND "courseId" IS NULL
    ) THEN
        RAISE EXCEPTION 'Pré-requisito de disciplina sem courseId';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "data"."CatalogCoursePrerequisiteItem"
        WHERE "kind" = 'SPECIAL'
          AND "code" !~ '^AA(200|4[0-9]{2})$'
    ) THEN
        RAISE EXCEPTION 'Pré-requisito especial legado desconhecido';
    END IF;
END $$;

UPDATE "data"."CatalogCoursePrerequisiteItem"
SET "fulfillment" = CASE "kind"::TEXT
    WHEN 'FULL' THEN 'FULL'::"data"."CatalogCoursePrerequisiteFulfillment"
    WHEN 'PARTIAL' THEN 'PARTIAL'::"data"."CatalogCoursePrerequisiteFulfillment"
    ELSE NULL
END;

UPDATE "data"."CatalogCoursePrerequisiteItem"
SET
    "specialRequirementType" = CASE
        WHEN "code" = 'AA200' THEN 'AUTHORIZATION'::"data"."CatalogCourseSpecialRequirementType"
        WHEN "code" ~ '^AA4[0-9]{2}$' THEN 'PROGRESSION_COEFFICIENT'::"data"."CatalogCourseSpecialRequirementType"
        ELSE NULL
    END,
    "specialRequirementValue" = CASE
        WHEN "code" = 'AA200' THEN 0
        WHEN "code" ~ '^AA4[0-9]{2}$' THEN SUBSTRING("code" FROM 4)::INTEGER
        ELSE NULL
    END
WHERE "kind" = 'SPECIAL';

ALTER TABLE "data"."CatalogCoursePrerequisiteItem"
    DROP COLUMN "code",
    DROP COLUMN "kind";

DROP TYPE "data"."CatalogCoursePrerequisiteKind";

ALTER TABLE "data"."CatalogCoursePrerequisiteItem"
    ADD CONSTRAINT "CatalogCoursePrerequisiteItem_target_check"
    CHECK (
        (
            "courseId" IS NOT NULL
            AND "fulfillment" IS NOT NULL
            AND "specialRequirementType" IS NULL
            AND "specialRequirementValue" IS NULL
        )
        OR (
            "courseId" IS NULL
            AND "fulfillment" IS NULL
            AND "specialRequirementType" IS NOT NULL
            AND "specialRequirementValue" IS NOT NULL
        )
    ),
    ADD CONSTRAINT "CatalogCoursePrerequisiteItem_special_requirement_check"
    CHECK (
        "specialRequirementType" IS NULL
        OR (
            "specialRequirementType" = 'AUTHORIZATION'
            AND "specialRequirementValue" = 0
        )
        OR (
            "specialRequirementType" = 'PROGRESSION_COEFFICIENT'
            AND "specialRequirementValue" BETWEEN 0 AND 100
        )
    );
