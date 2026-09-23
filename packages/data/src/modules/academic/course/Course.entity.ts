import z from "zod";

import IO from "#/modules/academic/course/Course.contract.js";
import { MyPrisma } from "@pomi/db";

const prismaCourseFieldSelection = {
    include: {
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
    const { unit, ...rest } = course;
    return {
        ...rest,
        prefix: rest.code.slice(0, 2).toUpperCase(),
        unitCode: unit?.code ?? null
    };
}

export default {
    selection: prismaCourseFieldSelection,
    build: buildCourseEntity
};
