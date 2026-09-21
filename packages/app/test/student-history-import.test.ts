import assert from "node:assert/strict";
import test from "node:test";

import IO from "#/modules/planning/student-history-import/StudentHistoryImport.contract.js";
import { createStudentHistoryImportService } from "#/modules/planning/student-history-import/StudentHistoryImport.service.js";

const enrolledHistory = {
    format: "pomi-student-history" as const,
    version: 1 as const,
    student: { ra: "123456" },
    semesters: [
        {
            year: 2026,
            yearPeriod: "SECOND_SEMESTER" as const,
            courses: [
                {
                    code: "MC202",
                    name: "Estruturas de Dados",
                    grade: null,
                    workloadHours: 60,
                    credits: 4,
                    status: "ENROLLED" as const
                }
            ]
        }
    ]
};

test("accepts enrolled courses in a student history import", () => {
    assert.equal(
        IO.importHistory.request.safeParse({
            path: { sid: "1" },
            body: enrolledHistory
        }).success,
        true
    );
});

test("imports an enrolled course attempt", async () => {
    let createdData: unknown;
    const transaction = {
        studentCourseAttempt: {
            findFirst: async () => null,
            create: async ({ data }: { data: unknown }) => {
                createdData = data;
            }
        }
    };
    const service = createStudentHistoryImportService({
        prisma: {
            student: {
                findUnique: async () => ({ ra: "123456" })
            },
            studyPeriod: {
                findMany: async () => [
                    {
                        id: 10,
                        year: 2026,
                        yearPeriod: "SECOND_SEMESTER"
                    }
                ]
            },
            course: {
                findMany: async () => [{ id: 20, code: "MC202" }]
            },
            catalogCourse: {
                findMany: async () => [
                    {
                        courseId: 20,
                        evaluation: "GRADE_AND_ATTENDANCE",
                        catalog: { year: 2026 }
                    }
                ]
            },
            $transaction: async (
                action: (tx: typeof transaction) => Promise<unknown>
            ) => action(transaction)
        } as never
    });

    const result = await service.import(1, enrolledHistory);

    assert.equal(result.isOk(), true);
    if (result.isOk())
        assert.deepEqual(result.value, {
            created: 1,
            updated: 0,
            skipped: 0,
            warnings: []
        });
    assert.deepEqual(createdData, {
        studentId: 1,
        courseId: 20,
        studyPeriodId: 10,
        classId: null,
        evaluationMode: "GRADE_AND_ATTENDANCE",
        status: "ENROLLED",
        grade: null
    });
});
