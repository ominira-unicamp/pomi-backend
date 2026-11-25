import assert from "node:assert/strict";
import test from "node:test";
import {
    academicRequestPartitions,
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
        () => injectionRequestPartition({ year: 2027 }, "calendar"),
        /não é suportado/
    );
});

test("solicita apenas 2027/1 para todos os institutos", () => {
    assert.deepEqual(
        injectionRequestPartition({ year: 2027, semester: 1 }, "academic-data"),
        {
            parameters: { root: true, periods: [{ year: 2027, semester: 1 }] }
        }
    );
});

test("solicita intervalo inclusivo atravessando anos e restringe instituto", () => {
    assert.deepEqual(
        injectionRequestPartition(
            {
                firstYear: 2026,
                firstSemester: 2,
                lastYear: 2027,
                lastSemester: 1,
                instituteCode: "IC"
            },
            "academic-data"
        ).parameters,
        {
            root: true,
            instituteCode: "IC",
            periods: [
                { year: 2026, semester: 2 },
                { year: 2027, semester: 1 }
            ]
        }
    );
});

test("rejeita intervalo invertido e seleções conflitantes", () => {
    for (const options of [
        {
            firstYear: 2027,
            firstSemester: 2 as const,
            lastYear: 2027,
            lastSemester: 1 as const
        },
        { year: 2027, firstYear: 2026 },
        { year: 2027, semester: 1 as const, firstSemester: 2 as const },
        { semester: 1 as const }
    ])
        assert.throws(() =>
            injectionRequestPartition(options, "academic-data")
        );
});

test("seleção anual inclui ambos semestres e filtro seleciona apenas 1s", () => {
    assert.deepEqual(
        injectionRequestPartition({ year: 2027 }, "academic-data").parameters
            .periods,
        [
            { year: 2027, semester: 1 },
            { year: 2027, semester: 2 }
        ]
    );
    assert.deepEqual(
        injectionRequestPartition(
            { firstYear: 2026, lastYear: 2027, semester: 1 },
            "academic-data"
        ).parameters.periods,
        [
            { year: 2026, semester: 1 },
            { year: 2027, semester: 1 }
        ]
    );
    assert.deepEqual(injectionRequestPartition({}, "academic-data"), {
        parameters: { root: true }
    });
});

test("snapshot acadêmico usa seleção explícita e rejeita snapshot de múltiplas partições", () => {
    assert.deepEqual(
        injectionRequestPartition(
            { year: 2027, semester: 1 },
            "academic-data-snapshot"
        ).parameters,
        { root: true, periods: [{ year: 2027, semester: 1 }] }
    );
    for (const options of [
        { year: 2027, snapshotId: "original" },
        { year: 2027, partitionKey: "IC" },
        { year: 1800 },
        { firstYear: 2028, lastYear: 2027 }
    ])
        assert.throws(() =>
            injectionRequestPartition(options, "academic-data-snapshot")
        );
});

test("worker descobre somente períodos selecionados e cria partições por instituto", async () => {
    const calls: unknown[] = [];
    const request = injectionRequestPartition(
        { year: 2027, semester: 1 },
        "academic-data"
    );
    const partitions = await academicRequestPartitions(
        request.parameters,
        async (year, semester) => {
            calls.push([year, semester]);
            return ["IC", "FEEC"];
        }
    );
    assert.deepEqual(calls, [[2027, 1]]);
    assert.deepEqual(
        partitions,
        ["IC", "FEEC"].map((instituteCode) => ({
            key: `2027-1-${instituteCode}`,
            parameters: {
                year: 2027,
                semester: 1,
                instituteCode,
                partitionKey: `2027-1-${instituteCode}`
            }
        }))
    );
});

test("worker respeita instituto explícito e falha quando fonte não retorna institutos", async () => {
    const request = injectionRequestPartition(
        {
            firstYear: 2026,
            firstSemester: 2,
            lastYear: 2027,
            lastSemester: 1,
            instituteCode: "IC"
        },
        "academic-data"
    );
    const partitions = await academicRequestPartitions(
        request.parameters,
        async () => {
            throw new Error("não deve consultar índice");
        }
    );
    assert.deepEqual(
        partitions.map((partition) => partition.key),
        ["2026-2-IC", "2027-1-IC"]
    );
    await assert.rejects(
        academicRequestPartitions(
            { periods: [{ year: 2027, semester: 1 }] },
            async () => []
        ),
        /Nenhum instituto/
    );
});
