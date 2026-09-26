import express from "express";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

const { default: openApiRouter, generateAppOpenApiDocument } =
    await import("#/OpenApi.js");

test("redirects the root path to the documentation", async () => {
    const application = express().use(openApiRouter);
    const server = application.listen(0, "127.0.0.1");

    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");

        const response = await fetch(`http://127.0.0.1:${address.port}/`, {
            redirect: "manual"
        });

        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), "/docs");
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        );
    }
});

test("App OpenAPI exposes structured filters and stable operations", () => {
    const document = generateAppOpenApiDocument();
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

test("period planning classes expose reservation programs instead of legacy codes", () => {
    const document = generateAppOpenApiDocument();
    const schema = document.components?.schemas?.PeriodPlanningClass as {
        properties?: Record<string, unknown>;
        required?: string[];
    };

    assert.ok(schema.properties?.reservationPrograms);
    assert.equal("reservations" in (schema.properties ?? {}), false);
    assert.equal(schema.required?.includes("reservationPrograms"), true);
});

test("does not expose removed period-plan aliases", () => {
    const document = generateAppOpenApiDocument();

    assert.equal(document.paths["/student/{sid}/period-plan"], undefined);
    assert.equal(document.paths["/student/{sid}/period-plan/{id}"], undefined);
});

test("collection operations expose the standard pagination contract", () => {
    const document = generateAppOpenApiDocument();
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

test("exposes links only in pagination envelopes", () => {
    const document = generateAppOpenApiDocument();
    assert.equal(JSON.stringify(document).includes('"_paths"'), false);

    for (const [name, value] of Object.entries(
        document.components?.schemas ?? {}
    )) {
        if (!("properties" in value) || !value.properties?.links) continue;
        assert.equal(
            value["x-pomi-schema"]?.kind,
            "page",
            `${name} exposes links outside a page schema`
        );
    }
});
