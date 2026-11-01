import type {
    AttemptStatus,
    EvaluationMode,
    YearPeriod
} from "#/modules/academic/Academic.types.js";
import {
    CourseEvaluationMode,
    StudentCourseAttemptStatus,
    YearPeriods
} from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";

type Same<Left, Right> = [Left] extends [Right]
    ? [Right] extends [Left]
        ? true
        : false
    : false;
const compatibility: [
    Same<AttemptStatus, StudentCourseAttemptStatus>,
    Same<EvaluationMode, CourseEvaluationMode>,
    Same<YearPeriod, YearPeriods>
] = [true, true, true];

test("academic types match the complete persisted enums", () => {
    assert.deepEqual(compatibility, [true, true, true]);
    const statuses: AttemptStatus[] = [
        "ENROLLED",
        "DROPPED",
        "APPROVED",
        "FAILED_BY_GRADE",
        "APPROVED_BY_ATTENDANCE",
        "APPROVED_BY_PROFICIENCY",
        "FAILED_BY_ATTENDANCE",
        "SUFFICIENT",
        "INSUFFICIENT"
    ];
    const evaluations: EvaluationMode[] = [
        "GRADE_AND_ATTENDANCE",
        "ATTENDANCE",
        "CONCEPT"
    ];
    const periods: YearPeriod[] = [
        "SUMMER",
        "FIRST_SEMESTER",
        "WINTER",
        "SECOND_SEMESTER"
    ];
    assert.deepEqual(
        new Set(statuses),
        new Set(Object.values(StudentCourseAttemptStatus))
    );
    assert.deepEqual(
        new Set(evaluations),
        new Set(Object.values(CourseEvaluationMode))
    );
    assert.deepEqual(new Set(periods), new Set(Object.values(YearPeriods)));
});
