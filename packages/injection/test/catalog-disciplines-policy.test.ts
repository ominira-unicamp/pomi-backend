import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    courseCreditsDiffer,
    shouldUpdateGlobalCourseName
} from "../src/services/CatalogDisciplinesInjection.js";
import { validateCatalogDisciplineComponents } from "../src/services/CatalogDisciplinesSnapshotInjection.js";

test("preserva créditos globais e usa o nome do catálogo mais recente", () => {
    assert.equal(shouldUpdateGlobalCourseName(null, 1998), true);
    assert.equal(shouldUpdateGlobalCourseName(2026, 1998), false);
    assert.equal(shouldUpdateGlobalCourseName(2020, 2020), true);
    assert.equal(courseCreditsDiffer(6, 6), false);
    assert.equal(courseCreditsDiffer(6, 4), true);
});

test("valida igualdade e contagem dos componentes antes da persistência", async () => {
    const directory = await mkdtemp(join(tmpdir(), "catalog-disciplines-"));
    const catalogPath = join(directory, "catalog.json");
    const relationshipsPath = join(directory, "relationships.json");
    try {
        await writeFile(
            catalogPath,
            JSON.stringify({
                data: {
                    catalogs: [
                        {
                            year: 2020,
                            sourceFormat: "LEGACY_INTERMEDIATE",
                            courses: [
                                {
                                    code: "MC102",
                                    name: "Algoritmos",
                                    credits: 6
                                }
                            ]
                        }
                    ]
                }
            })
        );
        await writeFile(
            relationshipsPath,
            JSON.stringify({
                data: {
                    catalogs: [
                        {
                            year: 2020,
                            sourceFormat: "LEGACY_INTERMEDIATE",
                            courses: [
                                {
                                    code: "MC102",
                                    prerequisites: { any: [] }
                                }
                            ]
                        }
                    ]
                }
            })
        );
        await validateCatalogDisciplineComponents({
            catalogPath,
            relationshipsPath,
            year: 2020,
            catalogRecords: 1,
            relationshipRecords: 1
        });
        await assert.rejects(
            validateCatalogDisciplineComponents({
                catalogPath,
                relationshipsPath,
                year: 2020,
                catalogRecords: 2,
                relationshipRecords: 1
            }),
            /Contagem do manifesto/
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
