import IO from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import { MyPrisma, selectIdCode, selectIdName } from "@pomi/db";
import z from "zod";

export const prismaPeriodPlanningFieldSelection = {
    include: {
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

type PrismaPeriodPlanningPayload = MyPrisma.PeriodPlanningGetPayload<
    typeof prismaPeriodPlanningFieldSelection
>;

function buildPeriodPlanningEntity(
    periodPlanning: PrismaPeriodPlanningPayload
): z.infer<typeof IO.schema> {
    const {
        studyPeriod,
        curriculum,
        curriculumSuggestion,
        catalogProgram,
        catalogProgramVariant,
        language,
        manualCourses,
        classes,
        ...rest
    } = periodPlanning;
    return {
        ...rest,
        createdAt: periodPlanning.createdAt.toISOString(),
        updatedAt: periodPlanning.updatedAt.toISOString(),
        studyPeriodId: studyPeriod.id,
        studyPeriodYear: studyPeriod.year,
        studyPeriodYearPeriod: studyPeriod.yearPeriod,
        curriculumId: curriculum?.id ?? null,
        guide: {
            mode: periodPlanning.guideMode,
            curriculumSource: periodPlanning.curriculumSource,
            curriculumId: curriculum?.id ?? null,
            suggestionId: curriculumSuggestion?.id ?? null,
            suggestionCatalogProgramId:
                curriculumSuggestion?.catalogProgramVariant.catalogProgramId ??
                null,
            catalogProgramId: catalogProgram?.id ?? null,
            catalogProgramVariantId: catalogProgramVariant?.id ?? null,
            languageId: language?.id ?? null,
            manualCourseIds: manualCourses.map(({ courseId }) => courseId)
        },
        classes: classes.map((c) => {
            const { course, professors, reservationPrograms, ...classRest } = c;
            return {
                ...classRest,
                courseCode: course.code,
                courseCredits: course.credits,
                reservationPrograms: reservationPrograms.map(
                    ({ program }) => program
                ),
                professors: professors.map((p) => ({
                    id: p.id,
                    name: p.name
                })),
                classSchedules: c.classSchedules.map((cs) => ({
                    id: cs.id,
                    dayOfWeek: cs.dayOfWeek,
                    start: cs.start,
                    end: cs.end,
                    roomId: cs.room.id,
                    roomCode: cs.room.code
                }))
            };
        })
    };
}

export default {
    build: buildPeriodPlanningEntity,
    prismaSelection: prismaPeriodPlanningFieldSelection
};
