import IO from "#/modules/catalog/curriculum-suggestion/CurriculumSuggestion.contract.js";
import assert from "node:assert/strict";
import test from "node:test";

test("declares only curriculum suggestion read paths", () => {
    assert.equal(IO.get.meta.method, "get");
    assert.equal(IO.list.meta.method, "get");
    assert.deepEqual(IO.list.meta.path, [
        { type: "literal", value: "curriculum-suggestions" }
    ]);
    assert.deepEqual(Object.keys(IO).sort(), [
        "get",
        "list",
        "schema",
        "schemas"
    ]);
});

test("coerces academic list filters", () => {
    const result = IO.list.request.safeParse({
        query: {
            filter: { catalogProgramId: "42", catalogYear: "2026" }
        }
    });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.data.query, {
        filter: [
            {
                path: ["catalogProgramId"],
                operator: "eq",
                values: [42]
            },
            { path: ["catalogYear"], operator: "eq", values: [2026] }
        ]
    });
});
