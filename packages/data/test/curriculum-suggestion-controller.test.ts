import assert from "node:assert/strict";
import test from "node:test";

import curriculumSuggestionController from "#/modules/catalog/curriculum-suggestion/CurriculumSuggestion.controller.js";

test("registers only read operations and public GET policies", () => {
    const definitions =
        curriculumSuggestionController.registry.definitions.filter(
            (definition) => definition.type === "route"
        );
    assert.equal(definitions.length, 2);
    assert.equal(
        curriculumSuggestionController.authRegistry.checkException(
            "GET",
            "/curriculum-suggestions"
        ),
        true
    );
    assert.equal(
        curriculumSuggestionController.authRegistry.checkException(
            "POST",
            "/curriculum-suggestions"
        ),
        false
    );
});
