import assert from "node:assert/strict";
import test from "node:test";

import type { Request } from "express";
import z from "zod";

import {
    ApiResponse,
    createEndpointRegistries,
    createPaginationQuerySchema,
    getPaginatedSchema,
    pathSeg,
    ResponseSchemaBuilder
} from "../src/index.js";

const contracts = {
    list: {
        meta: {
            method: "get" as const,
            path: [pathSeg.literal("items")],
            tags: ["items"],
            authorization: { kind: "public" as const },
            operationId: "listItems",
            sdk: {
                resource: "items",
                method: "list",
                action: "list" as const
            },
            pagination: {
                defaultMode: "page" as const,
                defaultPageSize: 20,
                allowAll: false
            }
        },
        request: z.object({
            query: createPaginationQuerySchema({
                defaultMode: "page",
                defaultPageSize: 20,
                allowAll: false
            })
        }),
        response: new ResponseSchemaBuilder()
            .ok(getPaginatedSchema(z.string()), "Items")
            .build()
    }
};

test("builds Express, OpenAPI and authorization registries from one contract", () => {
    const policies: Array<{ method: string; path: string; kind: string }> = [];
    const registries = createEndpointRegistries({
        contracts,
        actions: {
            list: async () =>
                ApiResponse.ok({
                    data: [],
                    quantity: 0,
                    total: 0,
                    _paths: {
                        firstPage: "/items?page=1&pageSize=20",
                        lastPage: "/items?page=1&pageSize=20",
                        next: null,
                        prev: null
                    }
                })
        },
        createContext: (_request: Request) => ({}),
        registerAuthorization: (method, path, authorization) => {
            policies.push({ method, path, kind: authorization.kind });
        }
    });

    assert.equal(registries.openApiRegistry.definitions.length, 1);
    assert.deepEqual(policies, [
        { method: "GET", path: "/items", kind: "public" }
    ]);
});

test("exports declarative SDK metadata with an endpoint", () => {
    const sdkContracts = {
        list: {
            ...contracts.list,
            meta: {
                ...contracts.list.meta,
                sdk: {
                    resource: "items",
                    method: "list",
                    action: "list" as const
                },
                pagination: {
                    defaultMode: "page" as const,
                    defaultPageSize: 20,
                    maxPageSize: 100,
                    allowAll: false
                }
            },
            request: z.object({
                query: createPaginationQuerySchema({
                    defaultMode: "page",
                    defaultPageSize: 20,
                    maxPageSize: 100,
                    allowAll: false
                })
            }),
            response: new ResponseSchemaBuilder()
                .ok(getPaginatedSchema(z.string()), "Items")
                .build()
        }
    };
    const registries = createEndpointRegistries({
        contracts: sdkContracts,
        actions: {
            list: async () =>
                ApiResponse.ok({
                    data: [],
                    quantity: 0,
                    total: 0,
                    _paths: {
                        firstPage: "/items?page=1&pageSize=20",
                        lastPage: "/items?page=1&pageSize=20",
                        next: null,
                        prev: null
                    }
                })
        },
        createContext: () => ({}),
        registerAuthorization: () => undefined
    });
    const definition = registries.openApiRegistry.definitions[0];
    assert.equal(definition.type, "route");
    if (definition.type !== "route") return;
    assert.deepEqual(definition.route["x-pomi-sdk"], {
        resource: "items",
        method: "list",
        action: "list"
    });
    assert.equal(definition.route["x-pomi-pagination"].defaultPageSize, 20);
});

test("rejects invalid and duplicate SDK metadata", () => {
    const invalidAlias = {
        ...contracts.list,
        meta: {
            ...contracts.list.meta,
            sdk: {
                resource: "items",
                method: "list",
                action: "list" as const,
                pathParameters: { id: "itemId" }
            }
        }
    };
    assert.throws(
        () =>
            createEndpointRegistries({
                contracts: { list: invalidAlias },
                actions: { list: async () => ApiResponse.ok([]) },
                createContext: () => ({}),
                registerAuthorization: () => undefined
            }),
        /does not exist/
    );

    const sdkContract = {
        ...contracts.list,
        meta: {
            ...contracts.list.meta,
            sdk: {
                resource: "items",
                method: "list",
                action: "list" as const
            }
        }
    };
    assert.throws(
        () =>
            createEndpointRegistries({
                contracts: { first: sdkContract, second: sdkContract },
                actions: {
                    first: async () => ApiResponse.ok([]),
                    second: async () => ApiResponse.ok([])
                },
                createContext: () => ({}),
                registerAuthorization: () => undefined
            }),
        /Duplicate SDK operation items\.list/
    );
});

test("fails during composition when an action is missing", () => {
    assert.throws(
        () =>
            createEndpointRegistries({
                contracts,
                actions: {} as never,
                createContext: () => ({}),
                registerAuthorization: () => undefined
            }),
        /Missing action for endpoint list/
    );
});

test("fails during composition when a query filter is not declared", () => {
    const filterContract = {
        list: {
            meta: {
                method: "get" as const,
                path: [pathSeg.literal("items")],
                tags: ["items"],
                authorization: { kind: "public" as const },
                operationId: "listFilteredItems",
                sdk: false
            },
            request: z.object({ query: z.object({ filter: z.string() }) }),
            response: new ResponseSchemaBuilder()
                .ok(z.string(), "Items")
                .build()
        }
    };

    assert.throws(
        () =>
            createEndpointRegistries({
                contracts: filterContract,
                actions: { list: async () => ApiResponse.ok([]) },
                createContext: () => ({}),
                registerAuthorization: () => undefined
            }),
        /expected queryFeatures\.filter=true/
    );
});

test("fails during composition when filter capability has no query schema", () => {
    const filterContract = {
        list: {
            meta: {
                method: "get" as const,
                path: [pathSeg.literal("items")],
                tags: ["items"],
                authorization: { kind: "public" as const },
                queryFeatures: { filter: true },
                operationId: "listFilterlessItems",
                sdk: false
            },
            request: z.object({ query: z.object({}) }),
            response: new ResponseSchemaBuilder()
                .ok(z.string(), "Items")
                .build()
        }
    };

    assert.throws(
        () =>
            createEndpointRegistries({
                contracts: filterContract,
                actions: { list: async () => ApiResponse.ok([]) },
                createContext: () => ({}),
                registerAuthorization: () => undefined
            }),
        /expected nenhum schema de filter na query/
    );
});

test("fails during composition when sort capability and query schema diverge", () => {
    const sortContract = {
        list: {
            meta: {
                method: "get" as const,
                path: [pathSeg.literal("items")],
                tags: ["items"],
                authorization: { kind: "public" as const },
                queryFeatures: { sort: true },
                operationId: "listSortedItems",
                sdk: false
            },
            request: z.object({ query: z.object({}) }),
            response: new ResponseSchemaBuilder()
                .ok(z.string(), "Items")
                .build()
        }
    };

    assert.throws(
        () =>
            createEndpointRegistries({
                contracts: sortContract,
                actions: { list: async () => ApiResponse.ok([]) },
                createContext: () => ({}),
                registerAuthorization: () => undefined
            }),
        /Inconsistent sort capability/
    );
});
