import IO, {
    guideSchema
} from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import { InconsistentResourceStateError } from "@pomi/api-core";
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

function buildPlanningGuide(
    periodPlanning: PrismaPeriodPlanningPayload
): z.infer<typeof guideSchema> {
    const invalid = (reason: string): never => {
        throw new InconsistentResourceStateError(
            "PeriodPlanning",
            periodPlanning.id,
            reason
        );
    };
    const manualCourseIds = periodPlanning.manualCourses.map(
        ({ courseId }) => courseId
    );

    if (periodPlanning.guideMode === "NONE") {
        if (
            periodPlanning.curriculumSource !== null ||
            periodPlanning.curriculum !== null ||
            periodPlanning.curriculumSuggestion !== null ||
            periodPlanning.catalogProgram !== null ||
            periodPlanning.catalogProgramVariant !== null ||
            periodPlanning.language !== null
        )
            invalid("none_with_variant_data");
        return { mode: "NONE", manualCourseIds };
    }

    if (periodPlanning.guideMode === "PROGRAM") {
        const program = periodPlanning.catalogProgram;
        const variant = periodPlanning.catalogProgramVariant;
        const language = periodPlanning.language;
        if (
            periodPlanning.curriculumSource !== null ||
            periodPlanning.curriculum !== null ||
            periodPlanning.curriculumSuggestion !== null ||
            program === null ||
            variant === null ||
            language === null
        )
            return invalid("invalid_program_variant");
        return {
            mode: "PROGRAM",
            manualCourseIds,
            program: {
                catalogProgramId: program.id,
                catalogProgramVariantId: variant.id,
                languageId: language.id
            }
        };
    }

    if (periodPlanning.guideMode !== "CURRICULUM") invalid("unknown_mode");
    if (
        periodPlanning.catalogProgram !== null ||
        periodPlanning.catalogProgramVariant !== null ||
        periodPlanning.language !== null
    )
        invalid("curriculum_with_program_data");

    if (periodPlanning.curriculumSource === "SAVED") {
        const curriculum = periodPlanning.curriculum;
        if (curriculum === null || periodPlanning.curriculumSuggestion !== null)
            return invalid("invalid_saved_curriculum_variant");
        return {
            mode: "CURRICULUM",
            manualCourseIds,
            curriculum: {
                source: "SAVED",
                saved: { curriculumId: curriculum.id }
            }
        };
    }

    if (periodPlanning.curriculumSource === "SUGGESTION") {
        const suggestion = periodPlanning.curriculumSuggestion;
        if (periodPlanning.curriculum !== null || suggestion === null)
            return invalid("invalid_suggestion_curriculum_variant");
        return {
            mode: "CURRICULUM",
            manualCourseIds,
            curriculum: {
                source: "SUGGESTION",
                suggestion: {
                    suggestionId: suggestion.id,
                    catalogProgramId:
                        suggestion.catalogProgramVariant.catalogProgramId
                }
            }
        };
    }

    return invalid("curriculum_without_source");
}

function buildPeriodPlanningEntity(
    periodPlanning: PrismaPeriodPlanningPayload
): z.infer<typeof IO.schema> {
    const {
        studyPeriod,
        curriculum,
        curriculumSuggestion: _curriculumSuggestion,
        catalogProgram: _catalogProgram,
        catalogProgramVariant: _catalogProgramVariant,
        language: _language,
        manualCourses: _manualCourses,
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
        guide: buildPlanningGuide(periodPlanning),
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
