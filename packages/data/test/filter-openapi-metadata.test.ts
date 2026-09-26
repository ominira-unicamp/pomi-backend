import assert from "node:assert/strict";
import test from "node:test";

import {
    defineSort,
    filterDefinition,
    resourceFilterOpenApiMetadata,
    sortOpenApiMetadata
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

test("describes sortable fields and defaults for OpenAPI consumers", () => {
    const metadata = sortOpenApiMetadata(
        defineSort({
            resourceName: "courses",
            sortableFields: ["code", "unit.name"] as const,
            defaultSort: [{ field: "code", direction: "asc" }],
            tieBreakers: [{ field: "id", direction: "asc" }]
        })
    );

    assert.deepEqual(metadata, {
        version: 1,
        fields: ["code", "unit.name"],
        default: "code:asc"
    });
});
