import { guideInputSchema } from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import presenter from "#/modules/planning/period-plan/PeriodPlan.presenter.js";
import { createPeriodPlanService } from "#/modules/planning/period-plan/PeriodPlan.service.js";
import assert from "node:assert/strict";
import test from "node:test";

const curriculum = { source: "SAVED" as const, saved: { curriculumId: 3 } };
const program = {
    catalogProgramId: 4,
    catalogProgramVariantId: 5,
    languageId: null
};
const row = {
    createdAt: new Date(),
    updatedAt: new Date(),
    id: 1,
    userId: 7,
    guideMode: "CURRICULUM",
    curriculumSource: "SAVED",
    curriculum: { id: 3 },
    curriculumSuggestion: null,
    catalogProgram: { id: 4 },
    catalogProgramVariant: { id: 5 },
    language: null,
    manualCourses: [],
    classes: [],
    studyPeriodId: 2,
    studyPeriod: { id: 2, year: 2026, yearPeriod: "FIRST_SEMESTER" },
    user: { id: 7 }
};

for (const mode of ["NONE", "PROGRAM", "CURRICULUM"] as const) {
    test(`guide preserves both configurations in ${mode}`, () => {
        const input = { mode, curriculum, program, manualCourseIds: [] };
        assert.deepEqual(guideInputSchema.parse(input), input);
        assert.deepEqual(
            presenter.build({ ...row, guideMode: mode } as never).guide,
            input
        );
    });
}

test("legacy mode-only updates preserve relations and explicit null removes only curriculum", async () => {
    let data: Record<string, unknown> = {};
    const service = createPeriodPlanService({
        prisma: {
            periodPlanning: {
                findUnique: async () => row,
                update: async (input: { data: Record<string, unknown> }) => {
                    data = input.data;
                    return row;
                }
            }
        } as never
    });
    await service.patch(7, 1, { guide: { mode: "NONE", manualCourseIds: [] } });
    for (const key of [
        "curriculum",
        "curriculumSuggestion",
        "catalogProgram",
        "catalogProgramVariant",
        "language"
    ])
        assert.equal(data[key], undefined);
    await service.patch(7, 1, {
        guide: { mode: "PROGRAM", manualCourseIds: [], curriculum: null }
    });
    assert.deepEqual(data.curriculum, { disconnect: true });
    assert.equal(data.catalogProgram, undefined);
});

test("inactive saved curriculum still requires ownership", async () => {
    let owner: unknown;
    let updated = false;
    const service = createPeriodPlanService({
        prisma: {
            periodPlanning: {
                findUnique: async () => row,
                update: async () => {
                    updated = true;
                    return row;
                }
            },
            curriculum: {
                findFirst: async (input: { where: unknown }) => {
                    owner = input.where;
                    return null;
                }
            }
        } as never
    });
    const result = await service.patch(7, 1, {
        guide: { mode: "NONE", manualCourseIds: [], curriculum }
    });
    assert.deepEqual(owner, { id: 3, userId: 7 });
    assert.equal(result.isErr(), true);
    assert.equal(updated, false);
});
