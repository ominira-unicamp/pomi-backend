import assert from "node:assert/strict";
import test from "node:test";

import {
    filterDefinition,
    resourceFilterOpenApiMetadata
} from "@pomi/api-core";

test("describes resource filters for OpenAPI consumers", () => {
    const metadata = resourceFilterOpenApiMetadata({
        "credits": filterDefinition.integer({
            minimum: 0,
            operators: ["eq", "gte", "in"]
        }),
        "unit.code": filterDefinition.code({ operators: ["eq"] })
    });

    assert.equal(metadata.version, 1);
    assert.deepEqual(metadata.fields, [
        {
            path: ["credits"],
            schema: { minimum: 0, type: "integer" },
            operators: ["eq", "gte", "in"]
        },
        {
            path: ["unit", "code"],
            schema: { minLength: 1, type: "string" },
            operators: ["eq"]
        }
    ]);
    assert.deepEqual(metadata.constraints, {
        maxExpressions: 20,
        maxDepth: 3,
        maxParameters: 100
    });
});
