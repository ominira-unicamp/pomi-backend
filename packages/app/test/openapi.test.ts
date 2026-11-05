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

    assert.equal(document.paths["/users/{userId}/period-plan"], undefined);
    assert.equal(document.paths["/users/{userId}/period-plan/{id}"], undefined);
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

test("groups keep public reads separate from student-scoped management", () => {
    const document = generateAppOpenApiDocument();
    const group = document.components?.schemas?.Group as {
        properties?: Record<string, unknown>;
    };
    const publicMember = document.components?.schemas
        ?.PublicGroupMembership as { properties?: Record<string, unknown> };
    const ownMember = document.components?.schemas?.OwnGroupMembership as {
        properties?: Record<string, unknown>;
    };
    const managedInvitation = document.components?.schemas
        ?.ManagedGroupInvitation as { properties?: Record<string, unknown> };

    assert.ok(group.properties?.contacts);
    assert.ok(group.properties?.externalLinks);
    assert.ok(group.properties?.tags);
    assert.equal(publicMember.properties?.studentId, undefined);
    assert.equal(publicMember.properties?.roles, undefined);
    assert.equal(publicMember.properties?.permissions, undefined);
    assert.ok(publicMember.properties?.profilePublicId);
    assert.ok(ownMember.properties?.permissions);
    assert.ok(managedInvitation.properties?.recipientName);
    assert.ok(managedInvitation.properties?.recipientPublicId);
    assert.ok(document.paths["/groups"]?.get);
    assert.ok(document.paths["/users/{userId}/groups"]?.post);
    assert.ok(document.paths["/users/{userId}/groups/{id}"]?.patch);
    assert.ok(document.paths["/users/{userId}/group-memberships"]?.get);
    assert.ok(document.paths["/users/{userId}/managed-group-invitations"]?.get);
    assert.ok(document.paths["/group-events"]?.get);
    const memberships = document.paths["/group-memberships"]?.get;
    assert.ok(memberships);
    const filter = memberships.parameters?.find(
        (parameter) =>
            "name" in parameter &&
            parameter.name === "filter" &&
            parameter.in === "query"
    );
    assert.ok(filter && !("$ref" in filter));
    const filterMetadata = (filter as unknown as Record<string, unknown>)[
        "x-pomi-filters"
    ] as { fields: Array<{ path: string[] }> };
    assert.ok(
        filterMetadata.fields.some((field) => field.path.includes("publicId"))
    );
    assert.equal(document.paths["/groups/{id}/members"], undefined);
});

test("group authorization scope comes from path and query", () => {
    const document = generateAppOpenApiDocument();
    const operations = [
        ["/users/{userId}/group-invitations", "post"],
        ["/users/{userId}/group-roles", "post"],
        ["/users/{userId}/group-events", "post"]
    ] as const;

    for (const [path, method] of operations) {
        const operation = document.paths[path]?.[method];
        assert.ok(operation, `${method.toUpperCase()} ${path}`);
        assert.ok(
            operation.parameters?.some(
                (parameter) =>
                    "name" in parameter &&
                    parameter.name === "groupId" &&
                    parameter.in === "query" &&
                    parameter.required
            ),
            `${method.toUpperCase()} ${path} requires query groupId`
        );
    }
});

test("media contracts declare multipart upload, binary reads and transport failures", () => {
    const document = generateAppOpenApiDocument();
    const upload = document.paths["/users/{userId}/avatar"]?.post;
    const read = document.paths["/media/{mediaId}/{variant}"]?.get;
    assert.ok(upload);
    assert.ok(read);
    assert.ok(upload.requestBody && "content" in upload.requestBody);
    assert.ok(upload.requestBody.content?.["multipart/form-data"]);
    assert.ok(upload.responses?.[413]);
    assert.ok(upload.responses?.[422]);
    assert.ok(upload.responses?.[429]);
    assert.ok(upload.responses?.[503]);
    assert.ok(read.responses?.[503]);
    assert.deepEqual(read.security, [{}, { BearerAuth: [] }]);
    const success = read.responses?.[200];
    assert.ok(success && "content" in success);
    assert.ok(success.content?.["image/webp"]);
    assert.match(
        success.description,
        /Cross-Origin-Resource-Policy: cross-origin/
    );
});

test("media contract exposes only avatars and removes group headers", () => {
    const document = generateAppOpenApiDocument();
    assert.equal(
        document.paths["/users/{userId}/groups/{id}/banner"],
        undefined
    );
    const group = document.components?.schemas?.Group;
    assert.ok(group && !("$ref" in group));
    assert.ok(group.properties?.avatarMediaId);
    assert.equal(group.properties?.bannerMediaId, undefined);
    const variant = document.paths[
        "/media/{mediaId}/{variant}"
    ]?.get?.parameters?.find(
        (parameter) => "name" in parameter && parameter.name === "variant"
    );
    assert.ok(variant && !("$ref" in variant));
    assert.deepEqual(
        variant.schema && !("$ref" in variant.schema)
            ? variant.schema.enum
            : undefined,
        ["avatarSmall", "avatarLarge"]
    );
});
