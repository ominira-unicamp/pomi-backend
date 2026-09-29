import IO from "#/modules/schedule/study-period/StudyPeriod.contract.js";
import assert from "node:assert/strict";
import test from "node:test";

test("accepts structured study period filters and sorting", () => {
    assert.deepEqual(IO.list.meta.queryFeatures, { filter: true, sort: true });

    const parsed = IO.list.request.safeParse({
        query: { filter: { year: "2025" }, sort: "year:desc,startDate:asc" }
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data.query.filter, [
        { path: ["year"], operator: "eq", values: [2025] }
    ]);
    assert.deepEqual(parsed.data.query.sort, [
        { field: "year", direction: "desc" },
        { field: "startDate", direction: "asc" }
    ]);
});
