import IO from "#/modules/planning/professor-evaluation/ProfessorEvaluation.contract.js";
import { isEligibleProfessorEvaluationAttempt } from "#/modules/planning/professor-evaluation/ProfessorEvaluation.rules.js";
import { createProfessorEvaluationService } from "#/modules/planning/professor-evaluation/ProfessorEvaluation.service.js";
import assert from "node:assert/strict";
import test from "node:test";

const path = { sid: "1", classId: "2", professorId: "3" };
const body = {
    wouldTakeAgain: 5,
    fairness: 4,
    clarity: 5,
    difficulty: 4
};

test("declares professor evaluation paths and scores", () => {
    assert.deepEqual(IO.get.meta.path, [
        { type: "literal", value: "student" },
        { type: "param", name: "sid" },
        { type: "literal", value: "classes" },
        { type: "param", name: "classId" },
        { type: "literal", value: "professors" },
        { type: "param", name: "professorId" },
        { type: "literal", value: "evaluation" }
    ]);
    assert.equal(IO.put.request.safeParse({ path, body }).success, true);
    assert.equal(
        IO.put.request.safeParse({
            path,
            body: { ...body, difficulty: 6 }
        }).success,
        false
    );
    assert.equal(
        IO.listPending.request.safeParse({
            path: { sid: "1" },
            query: {
                filter: {
                    year: "2026",
                    yearPeriod: "FIRST_SEMESTER"
                }
            }
        }).success,
        true
    );
});

test("lists only professors without an evaluation in the requested semester", async () => {
    const service = createProfessorEvaluationService({
        prisma: {
            studentCourseAttempt: {
                findMany: async () => [
                    {
                        id: 7,
                        class: {
                            id: 2,
                            code: "A",
                            course: {
                                id: 8,
                                code: "MC102",
                                name: "Algoritmos"
                            },
                            professors: [
                                { id: 3, name: "Docente avaliado" },
                                { id: 4, name: "Docente pendente" }
                            ]
                        }
                    }
                ]
            },
            professorEvaluation: {
                findMany: async () => [{ classId: 2, professorId: 3 }]
            }
        } as never
    });

    const pending = await service.listPending(1, {
        filter: [
            { path: ["year"], operator: "eq", values: [2026] },
            {
                path: ["yearPeriod"],
                operator: "eq",
                values: ["FIRST_SEMESTER"]
            }
        ]
    });

    assert.deepEqual(pending, [
        {
            attemptId: 7,
            class: { id: 2, code: "A" },
            course: { id: 8, code: "MC102", name: "Algoritmos" },
            professor: { id: 4, name: "Docente pendente" }
        }
    ]);
});

test("accepts only ended attempts for professor evaluations", () => {
    assert.equal(isEligibleProfessorEvaluationAttempt("DROPPED"), true);
    assert.equal(isEligibleProfessorEvaluationAttempt("APPROVED"), true);
    assert.equal(isEligibleProfessorEvaluationAttempt("INSUFFICIENT"), true);
    assert.equal(
        isEligibleProfessorEvaluationAttempt("APPROVED_BY_PROFICIENCY"),
        true
    );
    assert.equal(isEligibleProfessorEvaluationAttempt("ENROLLED"), false);
});

test("rejects a professor that does not belong to the class", async () => {
    const service = createProfessorEvaluationService({
        prisma: {
            class: {
                findUnique: async () => ({ id: 2, professors: [] })
            },
            professor: { findUnique: async () => ({ id: 3 }) },
            studentCourseAttempt: {
                findFirst: async () => ({ status: "APPROVED" })
            }
        } as never
    });

    const result = await service.put(
        { studentId: 1, classId: 2, professorId: 3 },
        body
    );

    assert.equal(result.isErr(), true);
    if (result.isErr())
        assert.equal(
            result.error.type,
            "urn:pomi:problem:invalid-professor-evaluation"
        );
});

test("upserts an evaluation for an eligible student", async () => {
    const now = new Date("2026-08-21T12:00:00.000Z");
    const service = createProfessorEvaluationService({
        prisma: {
            class: {
                findUnique: async () => ({ id: 2, professors: [{ id: 3 }] })
            },
            professor: { findUnique: async () => ({ id: 3 }) },
            studentCourseAttempt: {
                findFirst: async () => ({ status: "APPROVED" })
            },
            professorEvaluation: {
                upsert: async ({
                    where,
                    create,
                    update
                }: Record<string, unknown>) => {
                    assert.deepEqual(where, {
                        studentId_classId_professorId: {
                            studentId: 1,
                            classId: 2,
                            professorId: 3
                        }
                    });
                    assert.deepEqual(create, {
                        studentId: 1,
                        classId: 2,
                        professorId: 3,
                        ...body
                    });
                    assert.deepEqual(update, body);
                    return {
                        id: 4,
                        studentId: 1,
                        classId: 2,
                        professorId: 3,
                        ...body,
                        createdAt: now,
                        updatedAt: now
                    };
                }
            }
        } as never
    });

    const result = await service.put(
        { studentId: 1, classId: 2, professorId: 3 },
        body
    );

    assert.equal(result.isOk(), true);
    if (result.isOk()) assert.equal(result.value.id, 4);
});
