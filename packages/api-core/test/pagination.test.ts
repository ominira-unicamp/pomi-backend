import assert from "node:assert/strict";
import test from "node:test";

import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import z from "zod";

import {
    buildPaginationPath,
    buildPaginationResponse,
    createPaginationQuerySchema,
    resolvePagination,
    type PaginationPolicy
} from "../src/index.js";

extendZodWithOpenApi(z);

const allByDefault = {
    defaultMode: "all",
    defaultPageSize: 20,
    maxPageSize: 100,
    allowAll: true
} satisfies PaginationPolicy;

const pageByDefault = {
    defaultMode: "page",
    defaultPageSize: 20,
    maxPageSize: 50,
    allowAll: false
} satisfies PaginationPolicy;

test("resolves omitted pagination according to the endpoint policy", () => {
    assert.deepEqual(resolvePagination({}, allByDefault), { mode: "all" });
    assert.deepEqual(resolvePagination({}, pageByDefault), {
        mode: "page",
        page: 1,
        pageSize: 20,
        skip: 0,
        take: 20
    });
});

test("resolves page and pageSize into offset pagination", () => {
    assert.deepEqual(
        resolvePagination({ page: 3, pageSize: 10 }, allByDefault),
        {
            mode: "page",
            page: 3,
            pageSize: 10,
            skip: 20,
            take: 10
        }
    );
    assert.deepEqual(resolvePagination({ page: 2 }, allByDefault), {
        mode: "page",
        page: 2,
        pageSize: 20,
        skip: 20,
        take: 20
    });
});

test("accepts all only when the endpoint policy allows it", () => {
    assert.deepEqual(resolvePagination({ pageSize: "all" }, allByDefault), {
        mode: "all"
    });
    assert.equal(
        createPaginationQuerySchema(pageByDefault).safeParse({
            pageSize: "all"
        }).success,
        false
    );
});

test("rejects page with all and values above the maximum", () => {
    const schema = createPaginationQuerySchema(allByDefault);
    assert.equal(
        schema.safeParse({ page: "2", pageSize: "all" }).success,
        false
    );
    assert.equal(schema.safeParse({ pageSize: "101" }).success, false);
});

test("builds canonical links for empty and all responses", () => {
    const empty = buildPaginationResponse<z.ZodString>(
        [],
        0,
        resolvePagination({}, pageByDefault),
        (query) => `/items?${new URLSearchParams(stringify(query))}`
    );
    assert.deepEqual(empty.links, {
        self: "/items?page=1&pageSize=20",
        first: "/items?page=1&pageSize=20",
        last: "/items?page=1&pageSize=20",
        next: null,
        previous: null
    });

    const all = buildPaginationResponse<z.ZodString>(
        ["a", "b"],
        2,
        resolvePagination({ pageSize: "all" }, allByDefault),
        (query) => `/items?${new URLSearchParams(stringify(query))}`
    );
    assert.deepEqual(all.links, {
        self: "/items?pageSize=all",
        first: "/items?pageSize=all",
        last: "/items?pageSize=all",
        next: null,
        previous: null
    });
});

test("builds navigation links for an intermediate page", () => {
    const page = buildPaginationResponse<z.ZodString>(
        ["a", "b"],
        8,
        resolvePagination({ page: 2, pageSize: 2 }, pageByDefault),
        (query) => `/items?${new URLSearchParams(stringify(query))}`
    );

    assert.deepEqual(page.links, {
        self: "/items?page=2&pageSize=2",
        first: "/items?page=1&pageSize=2",
        last: "/items?page=4&pageSize=2",
        next: "/items?page=3&pageSize=2",
        previous: "/items?page=1&pageSize=2"
    });
});

test("preserves non-pagination query parameters in links", () => {
    assert.equal(
        buildPaginationPath(
            "/courses",
            { q: "cálculo", sort: "code:asc", page: 1, pageSize: 20 },
            { page: 2, pageSize: 20 }
        ),
        "/courses?q=c%C3%A1lculo&sort=code%3Aasc&page=2&pageSize=20"
    );
});

function stringify(value: Record<string, number | string>) {
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, String(item)])
    );
}
