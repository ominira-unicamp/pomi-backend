import { resourcesPaths } from "#/Controllers.js";
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

function relatedPathsForClass(classPayload: PrismaClassPayload) {
    return {
        studyPeriod: resourcesPaths.studyPeriod.entity(
            classPayload.studyPeriod.id
        ),
        unit: classPayload.course.unit
            ? resourcesPaths.unit.entity(classPayload.course.unit.id)
            : null,
        course: resourcesPaths.course.entity(classPayload.course.id),
        class: resourcesPaths.class.entity(classPayload.id),
        classSchedules: resourcesPaths.classSchedule.list({
            filter: [
                {
                    path: ["class", "id"],
                    operator: "eq",
                    values: [classPayload.id]
                }
            ]
        }),
        professors: resourcesPaths.professor.list({
            filter: [
                {
                    path: ["classId"],
                    operator: "eq",
                    values: [classPayload.id]
                }
            ]
        })
    };
}

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
        reservationPrograms: reservationPrograms.map(({ program }) => program),
        _paths: relatedPathsForClass(classData)
    };
}

export default {
    build: buildClassEntity,
    prismaSelection: prismaClassFieldSelection
};
