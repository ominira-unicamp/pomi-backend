import assert from "node:assert/strict";
import test from "node:test";
import { checkMemoryPagination, checkPagination } from "./check-pagination.mjs";

test("memory pagination requires an explicit exception, including aliases and namespace imports", () => {
    for (const source of [
        'import {buildArrayPaginationResponse} from "@pomi/api-core"; buildArrayPaginationResponse(items, query, policy, path);',
        'import {paginateItems as cut} from "@pomi/api-core"; cut(items, pagination);',
        'import * as core from "@pomi/api-core"; core.paginateItems(items, pagination);'
    ])
        assert.equal(
            checkMemoryPagination("new.controller.ts", source).length,
            1
        );
});

test("exceptions are limited to the declared number of calls", () => {
    const exceptions = new Map([["existing.ts", { calls: 1 }]]);
    assert.deepEqual(
        checkMemoryPagination(
            "existing.ts",
            "paginateItems(items, page);",
            exceptions
        ),
        []
    );
    assert.equal(
        checkMemoryPagination(
            "existing.ts",
            "paginateItems(a, p); paginateItems(b, p);",
            exceptions
        ).length,
        1
    );
    assert.deepEqual(
        checkMemoryPagination(
            "new.ts",
            "buildQueryPaginationResponse(result, query, path);"
        ),
        []
    );
});

test("all API source files satisfy the database-first pagination policy", async () => {
    await checkPagination();
});
