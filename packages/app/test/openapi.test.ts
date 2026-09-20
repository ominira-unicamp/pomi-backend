import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

const { generateAppOpenApiDocument } = await import("#/OpenApi.js");

test("student OpenAPI exposes structured filters and stable operations", () => {
    const document = generateAppOpenApiDocument("student");
    const tagsOperation = document.paths["/tags"]?.get;
    const filterParameter = tagsOperation?.parameters?.find(
        (parameter) =>
            "name" in parameter &&
            parameter.name === "filter" &&
            parameter.in === "query"
    );

    assert.ok(filterParameter && !("$ref" in filterParameter));
    assert.equal(filterParameter.style, "deepObject");
    assert.equal(filterParameter.explode, true);
    const filterMetadata = (
        filterParameter as unknown as Record<string, unknown>
    )["x-pomi-filters"] as { fields: unknown };
    assert.deepEqual(filterMetadata.fields, [
        {
            path: ["categoryId"],
            schema: { minimum: 1, type: "integer" },
            operators: ["eq", "in"]
        },
        {
            path: ["parentTagId"],
            schema: { minimum: 1, type: "integer" },
            operators: ["eq", "in"]
        },
        {
            path: ["courseId"],
            schema: { minimum: 1, type: "integer" },
            operators: ["eq", "in"]
        }
    ]);

    const operationIds = new Set<string>();
    for (const item of Object.values(document.paths)) {
        for (const operation of Object.values(item ?? {})) {
            if (!operation || typeof operation !== "object") continue;
            if (!("operationId" in operation)) continue;
            assert.equal(typeof operation.operationId, "string");
            assert.equal(operationIds.has(operation.operationId), false);
            operationIds.add(operation.operationId);
        }
    }
});

test("student collection operations expose the standard pagination contract", () => {
    const document = generateAppOpenApiDocument("student");
    const operation = document.paths["/tags"]?.get;
    assert.deepEqual(operation?.["x-pomi-pagination"], {
        defaultMode: "all",
        defaultPageSize: 20,
        allowAll: true
    });
    const parameters = operation?.parameters
        ?.filter(
            (parameter) =>
                "name" in parameter &&
                (parameter.name === "page" || parameter.name === "pageSize")
        )
        .map((parameter) => ("name" in parameter ? parameter.name : null));
    assert.deepEqual(parameters, ["page", "pageSize"]);
    assert.equal("itemsField" in operation!["x-pomi-pagination"], false);
    assert.equal("pageParameter" in operation!["x-pomi-pagination"], false);
});
