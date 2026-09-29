import assert from "node:assert/strict";
import test from "node:test";

import {
    normalizeQueryFilter,
    parseStructuredQuery,
    queryFilterSchema,
    serializeQueryParams,
    unsupportedQueryFilterField
} from "../src/index.js";

test("parses bracketed filters and normalizes implicit equality", () => {
    const query = parseStructuredQuery(
        "filter[unit][code]=IC&filter[credits][gte]=4&filter[credits][in]=2&filter[credits][in]=4"
    );

    assert.deepEqual(normalizeQueryFilter(query.filter), {
        success: true,
        data: [
            { path: ["unit", "code"], operator: "eq", values: ["IC"] },
            { path: ["credits"], operator: "gte", values: ["4"] },
            { path: ["credits"], operator: "in", values: ["2", "4"] }
        ]
    });
});

test("rejects malformed filter values and empty filters", () => {
    assert.equal(
        queryFilterSchema.safeParse({ credits: ["4"] }).success,
        false
    );
    assert.equal(queryFilterSchema.safeParse({}).success, false);
    assert.equal(
        queryFilterSchema.safeParse({ credits: { gte: ["4", "5"] } }).success,
        false
    );
});

test("serializes normalized filters as repeated bracketed query parameters", () => {
    const query = serializeQueryParams({
        filter: [
            { path: ["credits"], operator: "gte", values: [4] },
            { path: ["credits"], operator: "lte", values: [8] },
            { path: ["unit", "code"], operator: "eq", values: ["IC"] },
            { path: ["tagId"], operator: "in", values: [1, 2] }
        ],
        page: 2
    });
    const params = new URLSearchParams(query);

    assert.equal(params.get("filter[credits][gte]"), "4");
    assert.equal(params.get("filter[credits][lte]"), "8");
    assert.equal(params.get("filter[unit][code]"), "IC");
    assert.deepEqual(params.getAll("filter[tagId][in]"), ["1", "2"]);
    assert.equal(params.get("page"), "2");
});

test("identifies filters unsupported by an endpoint", () => {
    assert.deepEqual(
        unsupportedQueryFilterField({ filter: { code: "MC202" } }),
        {
            code: "FILTER_UNSUPPORTED_ENDPOINT",
            path: ["query", "filter"],
            message: "Este endpoint não aceita filtros.",
            details: { feature: "filter" }
        }
    );
    assert.equal(
        unsupportedQueryFilterField(
            { filter: { code: "MC202" } },
            { filter: true }
        ),
        undefined
    );
});
