import assert from "node:assert/strict";
import test from "node:test";
import {
    injectionRequestPartition,
    isRequestableInjection
} from "../src/request.js";

test("aceita somente injections registradas para request", () => {
    assert.equal(isRequestableInjection("academic-data"), true);
    assert.equal(isRequestableInjection("catalog-programs-snapshot"), true);
    assert.equal(isRequestableInjection("unknown"), false);
});

test("cria job raiz quando o request não informa partição", () => {
    assert.deepEqual(injectionRequestPartition({}), {
        parameters: { root: true }
    });
});

test("preserva parâmetros explícitos sem depender da configuração", () => {
    assert.deepEqual(
        injectionRequestPartition({
            firstYear: 2020,
            lastYear: 2020,
            instituteCode: "IC",
            semester: 2,
            snapshotId: "snapshot-1"
        }),
        {
            partitionKey: "IC",
            parameters: {
                partitionKey: "IC",
                firstYear: 2020,
                lastYear: 2020,
                instituteCode: "IC",
                semester: 2,
                snapshotId: "snapshot-1"
            }
        }
    );
});
