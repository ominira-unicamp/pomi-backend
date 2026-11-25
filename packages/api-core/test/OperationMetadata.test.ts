import assert from "node:assert/strict";
import test from "node:test";

import {
    operationIdFromOpenApiPath,
    summaryFromOperationId
} from "../src/index.js";

test("derives stable operation ids from collection and member paths", () => {
    assert.equal(
        operationIdFromOpenApiPath("get", "/courses", ["courses"]),
        "listCourses"
    );
    assert.equal(
        operationIdFromOpenApiPath("get", "/courses/{id}", ["courses"]),
        "getCourses"
    );
    assert.equal(
        operationIdFromOpenApiPath("get", "/professors/evaluation-summaries", [
            "evaluation-summaries"
        ]),
        "listProfessorsEvaluationSummaries"
    );
});

test("builds a readable summary from a generated operation id", () => {
    assert.equal(summaryFromOperationId("listCourses"), "List Courses");
    assert.equal(summaryFromOperationId("customOperation"), "customOperation");
});
