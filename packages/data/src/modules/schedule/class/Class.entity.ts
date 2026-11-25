import IO from "#/modules/schedule/class/Class.contract.js";
import { MyPrisma, selectIdCode, selectIdName } from "@pomi/db";
import z from "zod";

export const prismaClassFieldSelection = {
    include: {
        professors: selectIdName,
        reservationPrograms: {
            select: {
                program: {
                    select: { id: true, code: true, name: true }
                }
            },
            orderBy: { program: { code: "asc" } }
        },
        studyPeriod: {
            select: { id: true, year: true, yearPeriod: true }
        },
        course: {
            select: {
                id: true,
                code: true,
                unit: selectIdCode
            }
        }
    }
} as const satisfies MyPrisma.ClassDefaultArgs;

type PrismaClassPayload = MyPrisma.ClassGetPayload<
    typeof prismaClassFieldSelection
>;

function buildClassEntity(
    classData: PrismaClassPayload
): z.infer<typeof IO.schema> {
    const { course, reservationPrograms, studyPeriod, ...rest } = classData;
    return {
        ...rest,
        studyPeriodId: studyPeriod.id,
        studyPeriodYear: studyPeriod.year,
        studyPeriodYearPeriod: studyPeriod.yearPeriod,
        courseId: course.id,
        courseCode: course.code,
        unitId: course.unit?.id ?? null,
        unitCode: course.unit?.code ?? null,
        professorIds: classData.professors.map((p) => p.id),
        reservationPrograms: reservationPrograms.map(({ program }) => program)
    };
}

export default {
    build: buildClassEntity,
    prismaSelection: prismaClassFieldSelection
};
