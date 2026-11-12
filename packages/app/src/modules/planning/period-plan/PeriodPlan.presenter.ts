import { canonicalUserId } from "#/modules/identity/UserContext.js";
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

    const curriculum = periodPlanning.curriculum;
    const suggestion = periodPlanning.curriculumSuggestion;
    const program = periodPlanning.catalogProgram;
    const variant = periodPlanning.catalogProgramVariant;
    if (curriculum && suggestion) invalid("multiple_curriculum_sources");
    return {
        mode: periodPlanning.guideMode,
        manualCourseIds,
        curriculum: curriculum
            ? {
                  source: "SAVED",
                  saved: { curriculumId: curriculum.id }
              }
            : suggestion
              ? {
                    source: "SUGGESTION",
                    suggestion: {
                        suggestionId: suggestion.id,
                        catalogProgramId:
                            suggestion.catalogProgramVariant.catalogProgramId
                    }
                }
              : null,
        program:
            program && variant
                ? {
                      catalogProgramId: program.id,
                      catalogProgramVariantId: variant.id,
                      languageId: periodPlanning.language?.id ?? null
                  }
                : null
    };
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
        userId: canonicalUserId(user),
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
