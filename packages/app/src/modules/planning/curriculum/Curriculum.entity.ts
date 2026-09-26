import IO from "#/modules/planning/curriculum/Curriculum.contract.js";
import { MyPrisma } from "@pomi/db";
import z from "zod";

const courseSelection = {
    select: {
        id: true,
        code: true,
        name: true,
        credits: true
    }
} as const;

export const prismaCurriculumFieldSelection = {
    include: {
        courses: {
            include: { course: courseSelection }
        },
        periods: {
            select: { id: true, position: true },
            orderBy: { position: "asc" }
        },
        favoriteForStudent: { select: { id: true } },
        catalogProgramVariant: { select: { id: true } },
        catalogLanguage: { select: { languageId: true } }
    }
} as const satisfies MyPrisma.CurriculumDefaultArgs;

export const prismaCurriculumSummaryFieldSelection = {
    select: {
        id: true,
        studentId: true,
        name: true,
        catalogProgramId: true,
        catalogProgramVariant: { select: { id: true } },
        catalogLanguage: { select: { languageId: true } },
        favoriteForStudent: { select: { id: true } },
        createdAt: true,
        updatedAt: true
    }
} as const satisfies MyPrisma.CurriculumDefaultArgs;

type PrismaCurriculumPayload = MyPrisma.CurriculumGetPayload<
    typeof prismaCurriculumFieldSelection
>;
type PrismaCurriculumSummaryPayload = MyPrisma.CurriculumGetPayload<
    typeof prismaCurriculumSummaryFieldSelection
>;

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

function buildCurriculumEntity(
    curriculum: PrismaCurriculumPayload
): z.infer<typeof IO.schema> {
    return {
        id: curriculum.id,
        studentId: curriculum.studentId,
        name: curriculum.name,
        isFavorite: curriculum.favoriteForStudent !== null,
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
        studentId: curriculum.studentId,
        name: curriculum.name,
        isFavorite: curriculum.favoriteForStudent !== null,
        selection: selectionFromCurriculum(curriculum),
        createdAt: curriculum.createdAt.toISOString(),
        updatedAt: curriculum.updatedAt.toISOString()
    };
}

export default {
    build: buildCurriculumEntity,
    buildSummary: buildCurriculumSummary,
    prismaSelection: prismaCurriculumFieldSelection,
    prismaSummarySelection: prismaCurriculumSummaryFieldSelection
};
