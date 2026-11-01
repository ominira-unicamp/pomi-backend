import type { MyPrisma } from "@pomi/db";

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

export type PrismaStudentAbsencePayload = MyPrisma.StudentAbsenceGetPayload<
    typeof prismaStudentAbsenceSelection
>;
