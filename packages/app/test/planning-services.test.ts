import assert from "node:assert/strict";
import test from "node:test";

import {
    curriculumInputProblem,
    curriculumProblemResponses
} from "#/modules/planning/curriculum/Curriculum.problems.js";
import { createCurriculumService } from "#/modules/planning/curriculum/Curriculum.service.js";
import {
    guideInputSchema,
    guideSchema,
    patchBody
} from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import {
    periodPlanInputProblem,
    periodPlanProblemResponses
} from "#/modules/planning/period-plan/PeriodPlan.problems.js";
import { createPeriodPlanService } from "#/modules/planning/period-plan/PeriodPlan.service.js";

test("curriculum service returns a domain problem when the plan does not exist", async () => {
    const service = createCurriculumService({
        prisma: {
            curriculum: { findUnique: async () => null }
        } as never
    });

    const result = await service.getById(1, 42);

    assert.equal(result.isErr(), true);
    if (result.isErr())
        assert.equal(result.error.type, "urn:pomi:problem:resource-not-found");
});

test("period plan service returns a domain problem when the plan does not exist", async () => {
    const service = createPeriodPlanService({
        prisma: {
            periodPlanning: { findUnique: async () => null }
        } as never
    });

    const result = await service.getById(1, 42);

    assert.equal(result.isErr(), true);
    if (result.isErr())
        assert.equal(result.error.type, "urn:pomi:problem:resource-not-found");
});

test("planning problems keep service paths relative and add body at the HTTP boundary", () => {
    const curriculumProblem = curriculumInputProblem([
        {
            code: "REFERENCE_NOT_FOUND",
            path: ["courses", "0", "courseId"],
            message: "Disciplina não encontrada."
        }
    ]);
    const periodPlanProblem = periodPlanInputProblem([
        {
            code: "INVALID_VALUE",
            path: ["classes", "add"],
            message: "Turma incompatível."
        }
    ]);

    assert.equal(
        curriculumProblem.type,
        "urn:pomi:problem:reference-not-found"
    );
    assert.equal(
        periodPlanProblem.type,
        "urn:pomi:problem:invalid-period-plan"
    );
    if (
        curriculumProblem.type !== "urn:pomi:problem:reference-not-found" ||
        periodPlanProblem.type !== "urn:pomi:problem:invalid-period-plan"
    )
        return;
    const curriculumResponse = curriculumProblemResponses[
        curriculumProblem.type
    ](curriculumProblem, { inputLocation: "body" });
    const periodPlanResponse = periodPlanProblemResponses[
        periodPlanProblem.type
    ](periodPlanProblem, { inputLocation: "body" });

    assert.deepEqual(curriculumResponse.body.fields[0]?.path, [
        "body",
        "courses",
        "0",
        "courseId"
    ]);
    assert.deepEqual(periodPlanResponse.body.fields[0]?.path, [
        "body",
        "classes",
        "add"
    ]);
});

test("period planning visibility updates do not require class changes", () => {
    const result = patchBody.safeParse({
        visibility: "PUBLIC"
    });

    assert.equal(result.success, true);
});

test("planning guides use nested discriminated variants", () => {
    const saved = {
        mode: "CURRICULUM",
        manualCourseIds: [1, 2],
        curriculum: { source: "SAVED", saved: { curriculumId: 7 } }
    };
    assert.equal(guideInputSchema.safeParse(saved).success, true);
    assert.equal(guideSchema.safeParse(saved).success, true);
    assert.equal(
        guideInputSchema.safeParse({
            mode: "CURRICULUM",
            manualCourseIds: [],
            curriculumSource: "SAVED",
            curriculumId: 7
        }).success,
        false
    );
});

test("period planning inputs do not accept the removed top-level curriculum id", () => {
    assert.equal(patchBody.safeParse({ curriculumId: 7 }).success, false);
});

test("period plan creation does not use update-only manual course operations", async () => {
    let createData: { manualCourses?: unknown } | undefined;
    const service = createPeriodPlanService({
        prisma: {
            studyPeriod: {
                findUnique: async () => ({ id: 39, year: 2026, yearPeriod: 1 })
            },
            course: { findMany: async () => [{ id: 7 }] },
            periodPlanning: {
                create: async ({
                    data
                }: {
                    data: { manualCourses?: unknown };
                }) => {
                    createData = data;
                    return {
                        id: 1,
                        name: "Planejamento",
                        studyPeriodId: 39,
                        studentId: 1,
                        guideMode: "NONE",
                        curriculumSource: null,
                        visibility: "PRIVATE",
                        shareId: "share-id",
                        createdAt: new Date("2026-01-01T00:00:00.000Z"),
                        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
                        studyPeriod: { id: 39, year: 2026, yearPeriod: 1 },
                        curriculum: null,
                        curriculumSuggestion: null,
                        catalogProgram: null,
                        catalogProgramVariant: null,
                        language: null,
                        manualCourses: [{ courseId: 7 }],
                        classes: []
                    };
                }
            }
        } as never
    });

    const result = await service.create(1, {
        studyPeriodId: 39,
        guide: { mode: "NONE", manualCourseIds: [7] },
        classes: new Set()
    });

    assert.equal(result.isOk(), true);
    assert.deepEqual(createData?.manualCourses, {
        create: [{ course: { connect: { id: 7 } } }]
    });
});

function curriculumEntityFixture(selection: {
    catalogProgramId: number | null;
    catalogProgramVariantId: number | null;
    languageId: number | null;
}) {
    return {
        id: 42,
        studentId: 7,
        name: "Planejamento",
        favoriteForStudent: null,
        catalogProgramId: selection.catalogProgramId,
        catalogProgramVariant:
            selection.catalogProgramVariantId === null
                ? null
                : { id: selection.catalogProgramVariantId },
        catalogLanguage:
            selection.languageId === null
                ? null
                : { languageId: selection.languageId },
        planningStartYear: null,
        planningStartSemester: null,
        planningStartNumber: null,
        currentPeriodId: null,
        courses: [],
        periods: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
    };
}

test("curriculum patch treats null selection values as explicit clears", async () => {
    let findUniqueCalls = 0;
    let updateData: unknown;
    const existing = {
        catalogProgramId: 1,
        catalogProgramVariantId: 10,
        catalogLanguageId: 20,
        catalogProgramVariant: { id: 10 },
        catalogLanguage: { languageId: 200 }
    };
    const resultEntity = curriculumEntityFixture({
        catalogProgramId: null,
        catalogProgramVariantId: null,
        languageId: null
    });
    const prisma = {
        curriculum: {
            findUnique: async () => {
                findUniqueCalls += 1;
                return findUniqueCalls === 1 ? existing : resultEntity;
            }
        },
        catalogProgram: { findUnique: async () => null },
        catalogProgramVariant: { findFirst: async () => null },
        catalogLanguage: { findFirst: async () => null },
        $transaction: async (callback: (tx: never) => Promise<unknown>) =>
            callback({
                curriculum: {
                    update: async ({ data }: { data: unknown }) => {
                        updateData = data;
                    }
                }
            } as never)
    } as never;
    const service = createCurriculumService({ prisma });

    await service.patch(7, 42, {
        selection: { catalogProgramId: null }
    });

    assert.deepEqual(updateData, {
        catalogProgramId: null,
        catalogProgramVariantId: null,
        catalogLanguageId: null
    });
});

test("curriculum patch clears dependent selections when changing program", async () => {
    let findUniqueCalls = 0;
    let updateData: unknown;
    const existing = {
        catalogProgramId: 1,
        catalogProgramVariantId: 10,
        catalogLanguageId: 20,
        catalogProgramVariant: { id: 10 },
        catalogLanguage: { languageId: 200 }
    };
    const resultEntity = curriculumEntityFixture({
        catalogProgramId: 2,
        catalogProgramVariantId: null,
        languageId: null
    });
    const prisma = {
        curriculum: {
            findUnique: async () => {
                findUniqueCalls += 1;
                return findUniqueCalls === 1 ? existing : resultEntity;
            }
        },
        catalogProgram: {
            findUnique: async () => ({ id: 2 })
        },
        catalogProgramVariant: { findFirst: async () => null },
        catalogLanguage: { findFirst: async () => null },
        $transaction: async (callback: (tx: never) => Promise<unknown>) =>
            callback({
                curriculum: {
                    update: async ({ data }: { data: unknown }) => {
                        updateData = data;
                    }
                }
            } as never)
    } as never;
    const service = createCurriculumService({ prisma });

    await service.patch(7, 42, {
        selection: { catalogProgramId: 2 }
    });

    assert.deepEqual(updateData, {
        catalogProgramId: 2,
        catalogProgramVariantId: null,
        catalogLanguageId: null
    });
});
