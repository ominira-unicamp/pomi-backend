import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCatalogs } from "../src/services/CatalogInjection.js";
import { unwrapScrapeData } from "../src/services/scrape-input.js";

test("desembrulha o resultado nativo da unicamp-scrapper-lib", () => {
    assert.deepEqual(
        unwrapScrapeData({
            data: [{ descricao: "Evento" }],
            issues: [],
            pages: []
        }),
        [{ descricao: "Evento" }]
    );
});

test("normaliza currículos nativos para o formato de injeção", () => {
    const catalogs = normalizeCatalogs({
        data: {
            catalogs: [
                {
                    year: 2026,
                    sourceUrl: "https://example.test/catalogo",
                    programs: [
                        {
                            code: 34,
                            name: "Ciência da Computação",
                            curriculum: {
                                url: "https://example.test/curriculo"
                            },
                            members: { url: "https://example.test/membros" },
                            unitCode: "IC",
                            blocks: [],
                            specializations: []
                        }
                    ]
                }
            ]
        },
        issues: [],
        pages: []
    });

    assert.deepEqual(catalogs, [
        {
            year: 2026,
            url: "https://example.test/catalogo",
            programs: [
                {
                    code: 34,
                    name: "Ciência da Computação",
                    curriculumUrl: "https://example.test/curriculo",
                    membersUrl: "https://example.test/membros",
                    unitCode: "IC",
                    blocks: [],
                    specializations: [],
                    languages: []
                }
            ]
        }
    ]);
});
