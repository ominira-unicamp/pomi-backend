import assert from "node:assert/strict";
import test from "node:test";
import {
    annualInjectionParameters,
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

test("fixa o ano do job anual e preserva-o após a virada do ano", () => {
    const request = injectionRequestPartition(
        {},
        "catalog-disciplines-snapshot",
        new Date("2026-12-31T12:00:00Z")
    );
    assert.deepEqual(request, {
        partitionKey: "2026",
        parameters: { year: 2026, partitionKey: "2026" }
    });
    assert.deepEqual(
        annualInjectionParameters(
            request.parameters,
            new Date("2027-01-01T12:00:00Z")
        ),
        request.parameters
    );
});

test("aceita ano futuro, aliases de um único ano e snapshot existente", () => {
    for (const options of [
        { year: 2027 },
        { firstYear: 2027, lastYear: 2027 },
        { lastYear: 2027 }
    ]) {
        const result = injectionRequestPartition(
            { ...options, snapshotId: "original" },
            "catalog-disciplines-snapshot"
        );
        assert.equal(result.partitionKey, "2027");
        assert.equal(result.parameters.year, 2027);
        assert.equal(result.parameters.snapshotId, "original");
    }
});

test("rejeita ano inválido, intervalos e partições conflitantes", () => {
    for (const options of [
        { year: 1800 },
        { year: 2027.5 },
        { firstYear: 2026, lastYear: 2027 },
        { year: 2027, firstYear: 2026 },
        { year: 2027, partitionKey: "2026" }
    ])
        assert.throws(() =>
            injectionRequestPartition(options, "catalog-disciplines-snapshot")
        );
    assert.throws(
        () => injectionRequestPartition({ year: 2027 }, "academic-data"),
        /não é suportado/
    );
});
