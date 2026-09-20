import IO from "#/modules/planning/student-absence/StudentAbsence.contract.js";
import { createStudentAbsenceService } from "#/modules/planning/student-absence/StudentAbsence.service.js";
import assert from "node:assert/strict";
import test from "node:test";

test("declares student absence paths and filter", () => {
    assert.deepEqual(IO.list.meta.path, [
        { type: "literal", value: "student" },
        { type: "param", name: "sid" },
        { type: "literal", value: "absences" }
    ]);
    assert.equal(
        IO.create.request.safeParse({
            path: { sid: "1" },
            body: {
                courseAttemptId: 2,
                classScheduleId: 3,
                date: "2026-08-20"
            }
        }).success,
        true
    );
});

test("rejects an absence whose schedule belongs to another class", async () => {
    const service = createStudentAbsenceService({
        prisma: {
            studentCourseAttempt: {
                findFirst: async () => ({ id: 4, classId: 10 })
            },
            classSchedule: {
                findUnique: async () => ({
                    id: 3,
                    classId: 11,
                    dayOfWeek: "THURSDAY"
                })
            }
        } as never
    });

    const result = await service.create(1, {
        courseAttemptId: 4,
        classScheduleId: 3,
        date: "2026-08-20"
    });

    assert.equal(result.isErr(), true);
    if (result.isErr())
        assert.equal(
            result.error.type,
            "urn:pomi:problem:invalid-student-absence"
        );
});

test("rejects an absence on a different weekday", async () => {
    const service = createStudentAbsenceService({
        prisma: {
            studentCourseAttempt: {
                findFirst: async () => ({ id: 4, classId: 10 })
            },
            classSchedule: {
                findUnique: async () => ({
                    id: 3,
                    classId: 10,
                    dayOfWeek: "MONDAY"
                })
            }
        } as never
    });

    const result = await service.create(1, {
        courseAttemptId: 4,
        classScheduleId: 3,
        date: "2026-08-20"
    });

    assert.equal(result.isErr(), true);
    if (result.isErr())
        assert.equal(
            result.error.type,
            "urn:pomi:problem:invalid-student-absence"
        );
});

test("creates an absence for the attempt schedule and matching date", async () => {
    const createdAt = new Date("2026-08-20T10:00:00.000Z");
    const service = createStudentAbsenceService({
        prisma: {
            studentCourseAttempt: {
                findFirst: async () => ({ id: 4, classId: 10 })
            },
            classSchedule: {
                findUnique: async () => ({
                    id: 3,
                    classId: 10,
                    dayOfWeek: "THURSDAY"
                })
            },
            studentAbsence: {
                findUnique: async () => null,
                create: async ({ data }: { data: unknown }) => {
                    assert.deepEqual(data, {
                        studentCourseAttemptId: 4,
                        classScheduleId: 3,
                        date: new Date("2026-08-20T00:00:00.000Z")
                    });
                    return {
                        id: 1,
                        studentCourseAttemptId: 4,
                        classScheduleId: 3,
                        date: new Date("2026-08-20T00:00:00.000Z"),
                        createdAt,
                        updatedAt: createdAt,
                        studentCourseAttempt: { id: 4, studentId: 1 },
                        classSchedule: {
                            id: 3,
                            dayOfWeek: "THURSDAY",
                            start: "08:00",
                            end: "10:00",
                            class: {
                                id: 10,
                                code: "A",
                                course: { id: 20, code: "MC202" },
                                studyPeriod: {
                                    id: 30,
                                    year: 2026,
                                    yearPeriod: "SECOND_SEMESTER"
                                }
                            }
                        }
                    };
                }
            }
        } as never
    });

    const result = await service.create(1, {
        courseAttemptId: 4,
        classScheduleId: 3,
        date: "2026-08-20"
    });

    assert.equal(result.isOk(), true);
    if (result.isOk())
        assert.deepEqual(result.value, {
            id: 1,
            studentCourseAttemptId: 4,
            classScheduleId: 3,
            date: "2026-08-20",
            createdAt: "2026-08-20T10:00:00.000Z",
            updatedAt: "2026-08-20T10:00:00.000Z",
            studyPeriodId: 30,
            studyPeriodYear: 2026,
            studyPeriodYearPeriod: "SECOND_SEMESTER",
            courseId: 20,
            courseCode: "MC202",
            classId: 10,
            classCode: "A",
            dayOfWeek: "THURSDAY",
            start: "08:00",
            end: "10:00",
            _paths: {
                self: "/student/1/absences/1",
                courseAttempt: "/student/1/course-attempts/4",
                classSchedule: "/class-schedules/3",
                class: "/classes/10",
                course: "/courses/20",
                studyPeriod: "/study-periods/30"
            }
        });
});
