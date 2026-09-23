ALTER TABLE "data"."CatalogCoursePrerequisiteItem"
    DROP CONSTRAINT "CatalogCoursePrerequisiteItem_target_check";

ALTER TABLE "data"."CatalogCoursePrerequisiteItem"
    ADD CONSTRAINT "CatalogCoursePrerequisiteItem_target_check"
    CHECK (
        (
            "fulfillment" IS NOT NULL
            AND "specialRequirementType" IS NULL
            AND "specialRequirementValue" IS NULL
        )
        OR (
            "courseId" IS NULL
            AND "fulfillment" IS NULL
            AND "specialRequirementType" IS NOT NULL
            AND "specialRequirementValue" IS NOT NULL
        )
    );
