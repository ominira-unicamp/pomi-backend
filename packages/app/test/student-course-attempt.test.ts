import IO from "#/modules/planning/student-course-attempt/StudentCourseAttempt.contract.js";
import { isAttemptApprovedForPrerequisite } from "#/modules/planning/student-course-attempt/StudentCourseAttempt.rules.js";
import assert from "node:assert/strict";
import test from "node:test";

test("declares assessment-specific course attempt statuses", () => {
    assert.equal(
        IO.create.request.safeParse({
            path: { sid: "1" },
            body: {
                courseId: 2,
                evaluationMode: "CONCEPT",
                status: "SUFFICIENT"
            }
        }).success,
        true
    );
    assert.equal(
        IO.create.request.safeParse({
            path: { sid: "1" },
            body: {
                courseId: 2,
                evaluationMode: "GRADE_AND_ATTENDANCE",
                status: "APPROVED_BY_PROFICIENCY"
            }
        }).success,
        true
    );
    assert.equal(
        IO.create.request.safeParse({
            path: { sid: "1" },
            body: {
                courseId: 2,
                evaluationMode: "GRADE_AND_ATTENDANCE",
                status: "COMPLETED"
            }
        }).success,
        false
    );
});

test("identifies only approved outcomes as prerequisite satisfiers", () => {
    assert.equal(isAttemptApprovedForPrerequisite("APPROVED"), true);
    assert.equal(
        isAttemptApprovedForPrerequisite("APPROVED_BY_ATTENDANCE"),
        true
    );
    assert.equal(
        isAttemptApprovedForPrerequisite("APPROVED_BY_PROFICIENCY"),
        true
    );
    assert.equal(isAttemptApprovedForPrerequisite("SUFFICIENT"), true);
    assert.equal(isAttemptApprovedForPrerequisite("FAILED_BY_GRADE"), false);
    assert.equal(isAttemptApprovedForPrerequisite("DROPPED"), false);
});
