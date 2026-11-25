import assert from "node:assert/strict";
import test from "node:test";

import {
    compareBySort,
    compileSort,
    defineSort,
    resolveSort,
    resourceSortSchema,
    serializeQueryParams
} from "../src/index.js";

const sorting = defineSort({
    resourceName: "items",
    sortableFields: ["name", "score", "owner.name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }],
    tieBreakers: [{ field: "id", direction: "asc" }]
});

test("parses comma-separated sort terms in priority order", () => {
    assert.deepEqual(
        resourceSortSchema(sorting).parse("score:desc,owner.name:asc"),
        [
            { field: "score", direction: "desc" },
            { field: "owner.name", direction: "asc" }
        ]
    );
});

test("rejects invalid, unsupported and duplicate sort terms", () => {
    for (const value of [
        "name",
        "name:up",
        "unknown:asc",
        "name:asc,name:desc",
        "name:asc, score:desc",
        "name:asc,"
    ]) {
        assert.equal(
            resourceSortSchema(sorting).safeParse(value).success,
            false
        );
    }
});

test("uses defaults and appends missing tie-breakers", () => {
    assert.deepEqual(resolveSort(undefined, sorting), [
        { field: "name", direction: "asc" },
        { field: "id", direction: "asc" }
    ]);
    assert.deepEqual(
        resolveSort([{ field: "score", direction: "desc" }], sorting),
        [
            { field: "score", direction: "desc" },
            { field: "id", direction: "asc" }
        ]
    );
});

test("serializes parsed sort terms back to the wire format", () => {
    const sort = resourceSortSchema(sorting).parse("score:desc,owner.name:asc");
    const query = serializeQueryParams({ sort, page: 2 });
    const params = new URLSearchParams(query);
    assert.equal(params.get("sort"), "score:desc,owner.name:asc");
    assert.equal(params.get("page"), "2");
});

test("compiles terms and compares in declared priority order", () => {
    const terms = resolveSort(
        [
            { field: "score", direction: "desc" },
            { field: "name", direction: "asc" }
        ],
        sorting
    );
    assert.deepEqual(
        compileSort(terms, {
            "name": (direction) => ({ name: direction }),
            "score": (direction) => ({ score: direction }),
            "owner.name": (direction) => ({ owner: { name: direction } }),
            "id": (direction) => ({ id: direction })
        }),
        [{ score: "desc" }, { name: "asc" }, { id: "asc" }]
    );

    const items = [
        { id: 2, name: "B", score: 10 },
        { id: 1, name: "A", score: 10 },
        { id: 3, name: "C", score: 20 }
    ];
    items.sort(
        compareBySort(terms, {
            "name": (left, right) => left.name.localeCompare(right.name),
            "score": (left, right) => left.score - right.score,
            "owner.name": () => 0,
            "id": (left, right) => left.id - right.id
        })
    );
    assert.deepEqual(
        items.map(({ id }) => id),
        [3, 1, 2]
    );
});
