import type { MyPrisma } from "@pomi/db";

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

export type PrismaCurriculumPayload = MyPrisma.CurriculumGetPayload<
    typeof prismaCurriculumFieldSelection
>;
export type PrismaCurriculumSummaryPayload = MyPrisma.CurriculumGetPayload<
    typeof prismaCurriculumSummaryFieldSelection
>;
