import { canonicalUserId } from "#/modules/identity/UserContext.js";
import type IO from "#/modules/planning/curriculum/Curriculum.contract.js";
import type z from "zod";
import {
    type PrismaCurriculumPayload,
    type PrismaCurriculumSummaryPayload
} from "./Curriculum.queries.js";

function selectionFromCurriculum(curriculum: {
    catalogProgramId: number | null;
    catalogProgramVariant: { id: number } | null;
    catalogLanguage: { languageId: number } | null;
}) {
    return {
        catalogProgramId: curriculum.catalogProgramId,
        catalogProgramVariantId: curriculum.catalogProgramVariant?.id ?? null,
        languageId: curriculum.catalogLanguage?.languageId ?? null
    };
}

function planningStartFromCurriculum(curriculum: {
    planningStartYear: number | null;
    planningStartSemester: number | null;
    planningStartNumber: number | null;
}) {
    if (
        curriculum.planningStartYear === null ||
        curriculum.planningStartSemester === null ||
        curriculum.planningStartNumber === null
    )
        return null;
    return {
        year: curriculum.planningStartYear,
        semester: curriculum.planningStartSemester as 1 | 2,
        semesterNumber: curriculum.planningStartNumber
    };
}

function buildCurriculum(
    curriculum: PrismaCurriculumPayload
): z.infer<typeof IO.schema> {
    return {
        id: curriculum.id,
        userId: canonicalUserId(curriculum.user),
        name: curriculum.name,
        isFavorite: curriculum.favoriteForUser !== null,
        selection: selectionFromCurriculum(curriculum),
        planningStart: planningStartFromCurriculum(curriculum),
        currentPeriodId: curriculum.currentPeriodId,
        courses: curriculum.courses.map(({ courseId, periodId, course }) => ({
            courseId,
            periodId,
            code: course.code,
            name: course.name,
            credits: course.credits
        })),
        periods: curriculum.periods,
        createdAt: curriculum.createdAt.toISOString(),
        updatedAt: curriculum.updatedAt.toISOString()
    };
}

function buildCurriculumSummary(
    curriculum: PrismaCurriculumSummaryPayload
): z.infer<typeof IO.summarySchema> {
    return {
        id: curriculum.id,
        userId: canonicalUserId(curriculum.user),
        name: curriculum.name,
        isFavorite: curriculum.favoriteForUser !== null,
        selection: selectionFromCurriculum(curriculum),
        createdAt: curriculum.createdAt.toISOString(),
        updatedAt: curriculum.updatedAt.toISOString()
    };
}

export default {
    build: buildCurriculum,
    buildSummary: buildCurriculumSummary
};
