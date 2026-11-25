import assert from "node:assert/strict";
import test from "node:test";

import { assertOpenApiSdkCoverage } from "../src/openapi/OpenApiSdkAudit.js";

function document(operation: Record<string, unknown>) {
    return {
        paths: { "/students/{id}": { get: operation } },
        components: {
            schemas: {
                Student: {
                    "type": "object",
                    "properties": { id: { type: "integer" } },
                    "x-pomi-schema": {
                        kind: "entity",
                        publicName: "Student",
                        identityFields: ["id"]
                    }
                }
            }
        }
    };
}

const operation = {
    "operationId": "getStudent",
    "x-pomi-sdk": {
        resource: "students",
        method: "get",
        action: "get",
        pathParameters: { id: "studentId" }
    }
};

test("accepts a fully declared SDK contract", () => {
    assert.doesNotThrow(() => assertOpenApiSdkCoverage(document(operation)));
});

test("rejects an operation without SDK metadata", () => {
    assert.throws(
        () => assertOpenApiSdkCoverage(document({ operationId: "getStudent" })),
        /must declare x-pomi-sdk/
    );
});

test("rejects incomplete path parameter mappings", () => {
    assert.throws(
        () =>
            assertOpenApiSdkCoverage(
                document({
                    ...operation,
                    "x-pomi-sdk": {
                        ...operation["x-pomi-sdk"],
                        pathParameters: {}
                    }
                })
            ),
        /must map every path parameter/
    );
});

test("rejects schema metadata that references an absent field", () => {
    const invalid = document(operation);
    invalid.components.schemas.Student["x-pomi-schema"].identityFields = [
        "studentId"
    ];
    assert.throws(
        () => assertOpenApiSdkCoverage(invalid),
        /references missing field/
    );
});

test("validates union root metadata against every referenced branch", () => {
    const unionDocument = document(operation);
    unionDocument.components.schemas = {
        Example: {
            "oneOf": [
                { $ref: "#/components/schemas/ExampleA" },
                { $ref: "#/components/schemas/ExampleB" }
            ],
            "x-pomi-schema": {
                kind: "entity",
                publicName: "Example",
                identityFields: ["id"]
            }
        },
        ExampleA: {
            "type": "object",
            "properties": { id: { type: "integer" }, type: { enum: ["A"] } },
            "x-pomi-schema": { kind: "variant", publicName: "ExampleA" }
        },
        ExampleB: {
            "type": "object",
            "properties": { id: { type: "integer" }, type: { enum: ["B"] } },
            "x-pomi-schema": { kind: "variant", publicName: "ExampleB" }
        }
    } as never;

    assert.doesNotThrow(() => assertOpenApiSdkCoverage(unionDocument));
    delete (
        unionDocument.components.schemas.ExampleB as never as {
            properties: { id?: unknown };
        }
    ).properties.id;
    assert.throws(
        () => assertOpenApiSdkCoverage(unionDocument),
        /references missing field/
    );
});
