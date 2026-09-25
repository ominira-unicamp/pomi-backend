import assert from "node:assert/strict";
import test from "node:test";

import {
    InconsistentResourceStateError,
    InconsistentResourceStateProblemSchema,
    ReferenceNotFoundProblem,
    ResourceNotFoundProblem,
    appErrorProblem,
    createResultResponder,
    err,
    ok,
    prefixProblemFields,
    problemInput,
    problemResponse
} from "../src/index.js";

test("serializes inconsistent resource states as a safe server problem", () => {
    const error = new InconsistentResourceStateError(
        "CourseRequirement",
        42,
        "missing_course_id"
    );
    const problem = appErrorProblem(error, "/catalog-program/7");

    assert.equal(problem.type, "urn:pomi:problem:inconsistent-resource-state");
    assert.equal(problem.status, 500);
    assert.equal(problem.detail.includes("missing_course_id"), false);
    assert.equal(
        InconsistentResourceStateProblemSchema.safeParse(problem).success,
        true
    );
});

test("creates domain problems without HTTP status", () => {
    const problem = ResourceNotFoundProblem.create({
        detail: "O recurso não foi encontrado."
    });

    assert.equal(problem.type, "urn:pomi:problem:resource-not-found");
    assert.equal("status" in problem, false);
    assert.equal(ResourceNotFoundProblem.status, 404);
});

test("prefixes field paths without mutating the domain problem", () => {
    const problem = ReferenceNotFoundProblem.create({
        detail: "Uma referência não foi encontrada.",
        fields: [
            {
                code: "REFERENCE_NOT_FOUND",
                path: ["courseId"],
                message: "A disciplina não foi encontrada."
            }
        ]
    });
    const translated = prefixProblemFields(problem, "body");

    assert.deepEqual(problem.fields[0]?.path, ["courseId"]);
    assert.deepEqual(translated.fields[0]?.path, ["body", "courseId"]);
});

test("uses a configured response map for success and domain errors", () => {
    const responses = {
        [ResourceNotFoundProblem.type]: problemResponse(
            ResourceNotFoundProblem
        ),
        [ReferenceNotFoundProblem.type]: problemResponse(
            ReferenceNotFoundProblem,
            (problem, context) =>
                prefixProblemFields(problem, context.inputLocation)
        )
    };
    const respond = createResultResponder(responses);

    const success = respond(ok("value"), (value) => ({ status: 200, value }));
    const failure = respond(
        err(
            ReferenceNotFoundProblem.create({
                detail: "Uma referência não foi encontrada.",
                fields: [
                    {
                        code: "REFERENCE_NOT_FOUND",
                        path: ["courseId"],
                        message: "A disciplina não foi encontrada."
                    }
                ]
            })
        ),
        (value) => ({ status: 200, value }),
        problemInput.body
    );

    assert.deepEqual(success, { status: 200, value: "value" });
    assert.equal(failure.status, 422);
    assert.deepEqual(failure.body?.fields[0]?.path, ["body", "courseId"]);
});
