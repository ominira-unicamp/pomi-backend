import assert from "node:assert/strict";
import test from "node:test";

import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import z from "zod";

import {
    adaptLegacyContract,
    collectionQuery,
    defineEndpoint,
    defineResource,
    defineSort,
    openApiFromEndpoint,
    pathSeg,
    request,
    responses,
    type PaginationPolicy
} from "../src/index.js";

extendZodWithOpenApi(z);

const pagination = {
    defaultMode: "page",
    defaultPageSize: 20,
    allowAll: false
} satisfies PaginationPolicy;

const items = defineResource({
    collectionPath: [
        pathSeg.literal("owners"),
        pathSeg.param("ownerId"),
        pathSeg.literal("items")
    ],
    memberParameter: "itemId",
    tag: "items",
    operationName: "Items",
    sdk: {
        resource: "items",
        pathParameters: { ownerId: "ownerId", itemId: "itemId" }
    }
});

test("resource factories produce regular endpoint contracts", () => {
    const query = collectionQuery({
        pagination,
        filter: z.object({ name: z.string() }),
        additional: { includeArchived: z.coerce.boolean().optional() }
    });
    const list = items.list({
        authorization: { kind: "public" as const },
        item: z.object({ id: z.number().int() }),
        pagination,
        request: request({
            path: z.object({ ownerId: z.coerce.number().int() }),
            query
        })
    });

    assert.equal(list.meta.method, "get");
    assert.equal(list.meta.operationId, "listItems");
    assert.deepEqual(list.meta.sdk.pathParameters, { ownerId: "ownerId" });
    assert.deepEqual(list.meta.queryFeatures, { filter: true });
    assert.deepEqual(
        list.request.parse({
            path: { ownerId: "3" },
            query: { page: "2", includeArchived: "true" }
        }),
        {
            path: { ownerId: 3 },
            query: { page: 2, includeArchived: true }
        }
    );
});

test("collection queries compose sorting as an optional capability", () => {
    const sorting = defineSort({
        resourceName: "items",
        sortableFields: ["name"] as const,
        defaultSort: [{ field: "name", direction: "asc" }],
        tieBreakers: [{ field: "id", direction: "asc" }]
    });
    const query = collectionQuery({ pagination, sort: sorting });
    const list = items.list({
        authorization: { kind: "public" as const },
        item: z.object({ id: z.number().int() }),
        pagination,
        request: request({
            path: z.object({ ownerId: z.coerce.number().int() }),
            query
        })
    });

    assert.deepEqual(list.meta.queryFeatures, {
        filter: false,
        sort: true
    });
    assert.deepEqual(
        list.request.parse({
            path: { ownerId: "3" },
            query: { sort: "name:desc" }
        }).query.sort,
        [{ field: "name", direction: "desc" }]
    );
});

test("resource operations allow named overrides and SDK opt-out", () => {
    const endpoint = items.get({
        authorization: { kind: "private" as const },
        operationId: "findItem",
        sdk: false,
        request: request({
            path: z.object({
                ownerId: z.coerce.number().int(),
                itemId: z.coerce.number().int()
            })
        }),
        response: responses()
            .ok(z.object({ id: z.number().int() }), "Item retrieved")
            .notFound()
            .build()
    });

    assert.equal(endpoint.meta.operationId, "findItem");
    assert.equal(endpoint.meta.sdk, false);
});

test("manual endpoints support custom media types without resource factories", () => {
    const endpoint = defineEndpoint({
        meta: {
            method: "get",
            path: [pathSeg.literal("feed")],
            tags: ["feed"],
            operationId: "getFeed",
            authorization: { kind: "public" as const },
            sdk: false
        },
        request: request({ query: z.object({}) }),
        response: responses()
            .ok(z.string(), "Calendar feed", { mediaType: "text/calendar" })
            .noContent()
            .build()
    });
    const openApi = openApiFromEndpoint(endpoint, { security: [] });

    assert.ok(openApi.responses[200]);
    assert.deepEqual(openApi.responses[204], { description: "No content" });
    assert.deepEqual(openApi.security, []);
});

test("legacy adaptation preserves the canonical endpoint contract", () => {
    const endpoint = defineEndpoint({
        meta: {
            method: "get",
            path: [pathSeg.literal("legacy")],
            tags: ["legacy"],
            operationId: "getLegacy",
            authorization: { kind: "public" as const },
            sdk: false
        },
        request: request({}),
        response: responses().noContent().build()
    });

    assert.equal(adaptLegacyContract(endpoint), endpoint);
});
