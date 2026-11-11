import { type MyPrisma, selectIdCode } from "@pomi/db";

export const prismaStudentCourseFieldSelection = {
    include: {
        user: { select: { id: true, studentId: true } },
        course: {
            select: {
                id: true,
                code: true,
                name: true,
                credits: true,
                unit: selectIdCode
            }
        },
        studyPeriod: {
            select: { id: true, year: true, yearPeriod: true }
        },
        class: {
            select: {
                id: true,
                code: true,
                studyPeriod: {
                    select: { id: true, year: true, yearPeriod: true }
                },
                professors: { select: { id: true, name: true } }
            }
        }
    }
} as const satisfies MyPrisma.StudentCourseAttemptDefaultArgs;

export type PrismaStudentCoursePayload =
    MyPrisma.StudentCourseAttemptGetPayload<
        typeof prismaStudentCourseFieldSelection
    >;
