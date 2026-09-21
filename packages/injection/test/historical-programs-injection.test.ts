import assert from "node:assert/strict";
import test from "node:test";
import {
    createHistoricalProgramImportPlan,
    HistoricalProgramsValidationError,
    normalizeHistoricalProgramCatalogs
} from "../src/services/HistoricalProgramsInjection.js";

const catalogs = [
    {
        year: 1998,
        sourceUrl: "https://example.test/1998/cursos.html",
        programs: [
            {
                code: 37,
                name: "Tecnologia em Saneamento",
                sourceUrl: "https://example.test/1998/cursos/cur37.html"
            }
        ]
    },
    {
        year: 2001,
        sourceUrl: "https://example.test/2001/cursos.html",
        programs: [
            {
                code: 37,
                name: "Tecnologia em Saneamento Ambiental",
                sourceUrl: "https://example.test/2001/cursos/cur37.html"
            }
        ]
    }
];

const unitMappings = [
    {
        programCode: 37,
        unitCode: "FT",
        sourceUrl: "https://example.test/unit-map/37"
    }
];

test("planeja somente programas ausentes e preserva todos os catálogos", () => {
    const plan = createHistoricalProgramImportPlan({
        catalogs,
        existingProgramCodes: [99],
        units: [{ id: 10, code: "FT" }],
        unitMappings
    });

    assert.deepEqual(plan, [
        {
            code: 37,
            name: "Tecnologia em Saneamento Ambiental",
            unitCode: "FT",
            unitId: 10,
            sourceUrl: "https://example.test/2001/cursos/cur37.html",
            catalogYears: [1998, 2001]
        }
    ]);
});

test("não altera programas que já existem", () => {
    const plan = createHistoricalProgramImportPlan({
        catalogs,
        existingProgramCodes: [37],
        units: [{ id: 10, code: "FT" }],
        unitMappings
    });

    assert.deepEqual(plan, []);
});

test("rejeita fontes, unidades e mapeamentos ausentes antes da persistência", () => {
    assert.throws(
        () =>
            createHistoricalProgramImportPlan({
                catalogs: [
                    ...catalogs,
                    {
                        year: 2002,
                        sourceUrl: "https://example.test/2002/cursos.html",
                        programs: [
                            { code: 60, name: "Tecnologia", sourceUrl: "" }
                        ]
                    }
                ],
                existingProgramCodes: [],
                units: [],
                unitMappings: [
                    ...unitMappings,
                    {
                        programCode: 60,
                        unitCode: "FT",
                        sourceUrl: "https://example.test/unit-map/60"
                    }
                ]
            }),
        (error: unknown) => {
            assert.ok(error instanceof HistoricalProgramsValidationError);
            assert.match(error.message, /sem fonte histórica: 60/);
            assert.match(error.message, /com unidade inexistente: 37, 60/);
            return true;
        }
    );
});

test("normaliza o envelope nativo do scraper", () => {
    assert.deepEqual(
        normalizeHistoricalProgramCatalogs({
            data: { catalogs },
            issues: [],
            pages: []
        }),
        catalogs
    );
});
