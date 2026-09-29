import express from "express";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

const { default: openApiRouter, generateDataOpenApiDocument } =
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

test("class contract exposes reservation programs instead of legacy codes", () => {
    const document = generateDataOpenApiDocument();
    const schema = document.components?.schemas?.ClassEntity as {
        properties?: Record<string, unknown>;
        required?: string[];
    };

    assert.ok(schema.properties?.reservationPrograms);
    assert.equal("reservations" in (schema.properties ?? {}), false);
    assert.equal(schema.required?.includes("reservationPrograms"), true);
});

test("exposes links only in pagination envelopes", () => {
    const document = generateDataOpenApiDocument();
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

    const links = document.components?.schemas?.PaginationLinks as {
        properties?: Record<string, unknown>;
        required?: string[];
    };
    assert.deepEqual(Object.keys(links.properties ?? {}), [
        "self",
        "first",
        "last",
        "next",
        "previous"
    ]);
    assert.deepEqual(links.required, [
        "self",
        "first",
        "last",
        "next",
        "previous"
    ]);
});

test("documents and groups every operation tag", () => {
    const document = generateDataOpenApiDocument();
    const tags = document.tags ?? [];
    const tagNames = new Set(tags.map(({ name }) => name));
    const tagGroups = document["x-tagGroups"] as Array<{
        name: string;
        tags: string[];
    }>;

    assert.ok(tags.length > 0);
    assert.ok(
        tags.every(
            (tag) =>
                tag.description &&
                typeof tag["x-displayName"] === "string" &&
                tag["x-displayName"].length > 0
        )
    );
    assert.deepEqual(
        new Set(tagGroups.flatMap(({ tags: groupedTags }) => groupedTags)),
        tagNames
    );
});

test("uses Portuguese summaries and no unused administration scheme", () => {
    const document = generateDataOpenApiDocument();
    const listCourses = document.paths["/courses"]?.get;
    const getCourse = document.paths["/courses/{id}"]?.get;
    const listCatalogCourses = document.paths["/catalog-courses"]?.get;
    const getCatalogCourse = document.paths["/catalog-courses/{id}"]?.get;

    assert.equal(listCourses?.summary, "Listar disciplinas");
    assert.equal(getCourse?.summary, "Consultar disciplina");
    assert.equal(listCatalogCourses?.summary, "Listar disciplinas de catálogo");
    assert.equal(getCatalogCourse?.summary, "Consultar disciplina de catálogo");
    assert.equal(
        document.components?.securitySchemes?.DataAdminToken,
        undefined
    );
});
