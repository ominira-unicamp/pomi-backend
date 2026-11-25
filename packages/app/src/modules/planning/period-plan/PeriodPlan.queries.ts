import { type MyPrisma, selectIdCode, selectIdName } from "@pomi/db";

export const prismaPeriodPlanningFieldSelection = {
    include: {
        user: { select: { id: true, studentId: true } },
        studyPeriod: {
            select: { id: true, year: true, yearPeriod: true }
        },
        curriculum: { select: { id: true } },
        curriculumSuggestion: {
            select: {
                id: true,
                catalogProgramVariant: {
                    select: { catalogProgramId: true }
                }
            }
        },
        catalogProgram: { select: { id: true } },
        catalogProgramVariant: { select: { id: true } },
        language: { select: { id: true } },
        manualCourses: { select: { courseId: true } },
        classes: {
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
                classSchedules: {
                    select: {
                        id: true,
                        dayOfWeek: true,
                        start: true,
                        end: true,
                        room: selectIdCode
                    }
                },
                course: {
                    select: {
                        id: true,
                        code: true,
                        credits: true,
                        unit: selectIdCode
                    }
                }
            }
        }
    }
} as const satisfies MyPrisma.PeriodPlanningDefaultArgs;

export type PrismaPeriodPlanningPayload = MyPrisma.PeriodPlanningGetPayload<
    typeof prismaPeriodPlanningFieldSelection
>;
