import { createEvaluationSummaryService } from "#/modules/academic/evaluation-summary/EvaluationSummary.service.js";
import assert from "node:assert/strict";
import test from "node:test";

function aggregate(id: number, difficulty: number) {
    return {
        professorId: id,
        classId: id,
        _count: { _all: 5 },
        _avg: {
            wouldTakeAgain: 4,
            fairness: 4,
            clarity: 4,
            difficulty
        }
    };
}

test("sorts professor summaries by computed metrics before pagination", async () => {
    const service = createEvaluationSummaryService({
        prisma: {
            professorEvaluation: {
                groupBy: async () => [aggregate(1, 2), aggregate(2, 5)]
            },
            professor: {
                findMany: async () => [
                    { id: 1, name: "Ana" },
                    { id: 2, name: "Bruno" }
                ]
            }
        } as never
    });

    const result = await service.listProfessorSummaries({
        page: 1,
        pageSize: 20,
        sort: [{ field: "difficulty", direction: "desc" }]
    });

    assert.deepEqual(
        result.map(({ professor }) => professor.id),
        [2, 1]
    );
});

test("sorts course summaries by nested public fields with a stable id tie-breaker", async () => {
    const service = createEvaluationSummaryService({
        prisma: {
            professorEvaluation: {
                groupBy: async () => [aggregate(10, 3), aggregate(20, 3)]
            },
            class: {
                findMany: async () => [
                    {
                        id: 10,
                        course: { id: 2, code: "MC102", name: "Algoritmos" }
                    },
                    {
                        id: 20,
                        course: { id: 1, code: "MC202", name: "Estruturas" }
                    }
                ]
            }
        } as never
    });

    const result = await service.listCourseSummaries({
        page: 1,
        pageSize: 20,
        sort: [{ field: "difficulty", direction: "asc" }]
    });

    assert.deepEqual(
        result.map(({ course }) => course.id),
        [1, 2]
    );
});
