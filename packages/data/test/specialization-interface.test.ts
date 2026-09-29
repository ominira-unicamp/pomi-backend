import IO from "#/modules/catalog/specialization/Specialization.contract.js";
import assert from "node:assert/strict";
import test from "node:test";

test("coerces specialization list filters", () => {
    const result = IO.list.request.safeParse({
        query: {
            filter: { programId: "7", programCode: "34", code: " aa " }
        }
    });

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.data.query, {
        filter: [
            { path: ["programId"], operator: "eq", values: [7] },
            { path: ["programCode"], operator: "eq", values: [34] },
            { path: ["code"], operator: "eq", values: ["AA"] }
        ]
    });
});
