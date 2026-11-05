import { requireLegacyStudentId } from "#/modules/identity/LegacyStudentContext.js";
import type IO from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import type { guideSchema } from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import { InconsistentResourceStateError } from "@pomi/api-core";
import type z from "zod";
import { type PrismaPeriodPlanningPayload } from "./PeriodPlan.queries.js";

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
            variant === null
        )
            return invalid("invalid_program_variant");
        return {
            mode: "PROGRAM",
            manualCourseIds,
            program: {
                catalogProgramId: program.id,
                catalogProgramVariantId: variant.id,
                languageId: language?.id ?? null
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

function buildPeriodPlanning(
    periodPlanning: PrismaPeriodPlanningPayload
): z.infer<typeof IO.schema> {
    const {
        studyPeriod,
        user,
        userId: _userId,
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
        studentId: requireLegacyStudentId(user),
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
    build: buildPeriodPlanning
};
