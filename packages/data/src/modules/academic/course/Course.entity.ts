import z from "zod";

import IO from "#/modules/academic/course/Course.contract.js";
import catalogCourseEntity from "#/modules/catalog/catalog-course/CatalogCourse.entity.js";
import { MyPrisma } from "@pomi/db";

const prismaCourseFieldSelection = {
    include: {
        catalogCourses: {
            ...catalogCourseEntity.selection,
            orderBy: { catalog: { year: "desc" } },
            take: 1
        },
        unit: {
            select: {
                code: true
            }
        }
    }
} satisfies MyPrisma.CourseDefaultArgs;

type PrismaCoursePayload = MyPrisma.CourseGetPayload<
    typeof prismaCourseFieldSelection
>;

function buildCourseEntity(
    course: PrismaCoursePayload
): z.infer<typeof IO.schema> {
    const { unit, catalogCourses, ...rest } = course;
    return {
        ...rest,
        prefix: rest.code.slice(0, 2).toUpperCase(),
        unitCode: unit?.code ?? null,
        latestCatalogCourse: catalogCourses[0]
            ? catalogCourseEntity.build(catalogCourses[0])
            : null
    };
}

export default {
    selection: prismaCourseFieldSelection,
    build: buildCourseEntity
};
