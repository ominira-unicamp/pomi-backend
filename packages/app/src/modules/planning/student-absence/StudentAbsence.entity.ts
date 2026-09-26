import IO from "#/modules/planning/student-absence/StudentAbsence.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

export const prismaStudentAbsenceSelection = {
    include: {
        classSchedule: {
            select: {
                id: true,
                dayOfWeek: true,
                start: true,
                end: true,
                class: {
                    select: {
                        id: true,
                        code: true,
                        course: { select: { id: true, code: true } },
                        studyPeriod: {
                            select: { id: true, year: true, yearPeriod: true }
                        }
                    }
                }
            }
        }
    }
} as const satisfies MyPrisma.StudentAbsenceDefaultArgs;

type PrismaStudentAbsencePayload = MyPrisma.StudentAbsenceGetPayload<
    typeof prismaStudentAbsenceSelection
>;

function buildStudentAbsenceEntity(
    absence: PrismaStudentAbsencePayload
): z.infer<typeof IO.schema> {
    const { classSchedule, ...data } = absence;
    const { class: classData, ...schedule } = classSchedule;
    return {
        ...data,
        date: absence.date.toISOString().slice(0, 10),
        createdAt: absence.createdAt.toISOString(),
        updatedAt: absence.updatedAt.toISOString(),
        studyPeriodId: classData.studyPeriod.id,
        studyPeriodYear: classData.studyPeriod.year,
        studyPeriodYearPeriod: classData.studyPeriod.yearPeriod,
        courseId: classData.course.id,
        courseCode: classData.course.code,
        classId: classData.id,
        classCode: classData.code,
        dayOfWeek: schedule.dayOfWeek,
        start: schedule.start,
        end: schedule.end
    };
}

export default {
    build: buildStudentAbsenceEntity,
    prismaSelection: prismaStudentAbsenceSelection
};
