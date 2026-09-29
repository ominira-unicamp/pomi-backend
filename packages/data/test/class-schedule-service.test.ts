import assert from "node:assert/strict";
import test from "node:test";

import {
    classScheduleProblemResponses,
    classScheduleReferenceNotFoundProblem
} from "#/modules/schedule/class-schedule/ClassSchedule.problems.js";
import { createClassScheduleService } from "#/modules/schedule/class-schedule/ClassSchedule.service.js";

test("accepts a class schedule whose course has no unit", async () => {
    const service = createClassScheduleService({
        prisma: {
            classSchedule: {
                findUnique: async () => ({
                    id: 7,
                    dayOfWeek: "MONDAY",
                    start: "08:00",
                    end: "10:00",
                    roomId: 11,
                    classId: 13,
                    room: { id: 11, code: "PB-01" },
                    class: {
                        id: 13,
                        code: "A",
                        courseId: 17,
                        studyPeriodId: 19,
                        studyPeriod: {
                            id: 19,
                            year: 2026,
                            yearPeriod: "FIRST_SEMESTER"
                        },
                        course: { id: 17, code: "MC001", unit: null }
                    }
                })
            }
        } as never
    });

    const result = await service.getById(7);

    assert.equal(result.isOk(), true);
    if (result.isOk()) {
        assert.equal(result.value.unitId, null);
        assert.equal(result.value.unitCode, null);
    }
});

test("returns a domain problem when a class schedule does not exist", async () => {
    const service = createClassScheduleService({
        prisma: {
            classSchedule: { findUnique: async () => null }
        } as never
    });

    const result = await service.getById(42);

    assert.equal(result.isErr(), true);
    if (result.isErr()) {
        assert.equal(result.error.type, "urn:pomi:problem:resource-not-found");
    }
});

test("prefixes service paths at the HTTP boundary", () => {
    const domainProblem = classScheduleReferenceNotFoundProblem([
        { path: ["roomId"], message: "A sala informada não foi encontrada." }
    ]);
    const response = classScheduleProblemResponses[domainProblem.type](
        domainProblem,
        { inputLocation: "body" }
    );
    const problem = response.body;

    assert.equal(problem.type, "urn:pomi:problem:reference-not-found");
    if (problem.type === "urn:pomi:problem:reference-not-found") {
        assert.deepEqual(problem.fields[0]?.path, ["body", "roomId"]);
    }
});

test("propagates unexpected database failures", async () => {
    const databaseFailure = new Error("database unavailable");
    const service = createClassScheduleService({
        prisma: {
            classSchedule: {
                findUnique: async () => {
                    throw databaseFailure;
                }
            }
        } as never
    });

    await assert.rejects(() => service.getById(42), databaseFailure);
});
