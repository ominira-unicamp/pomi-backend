import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    expectedCatalogProgramVariants,
    planVariantReconciliation
} from "../src/services/CatalogProgramVariantReconciliation.js";

test("planeja remoção das variantes que não pertencem ao snapshot", () => {
    const plan = planVariantReconciliation(
        [
            { id: 1, programId: 42, specialization: null },
            {
                id: 2,
                programId: null,
                specialization: { id: 10, code: "EX" }
            },
            {
                id: 3,
                programId: null,
                specialization: { id: 11, code: "AA" }
            }
        ],
        { program: true, specializations: new Set(["AA"]) }
    );

    assert.deepEqual(plan, {
        staleVariantIds: [2],
        staleSpecializationIds: [10],
        missing: []
    });
});

test("identifica variantes esperadas ainda não persistidas", () => {
    const plan = planVariantReconciliation([], {
        program: true,
        specializations: new Set(["AB", "AA"])
    });

    assert.deepEqual(plan.missing, ["PROGRAM", "AA", "AB"]);
});

test("rejeita especialização sem nome semântico em snapshot completo", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-variant-test-"));
    const curriculaPath = join(directory, "curricula.json");
    const informationPath = join(directory, "information.json");
    await writeFile(
        curriculaPath,
        JSON.stringify({
            data: {
                catalogs: [
                    {
                        year: 2026,
                        programs: [
                            {
                                code: 42,
                                name: "Ciência da Computação",
                                specializations: [
                                    { code: "EX", name: "--", blocks: [] }
                                ]
                            }
                        ]
                    }
                ]
            },
            issues: [],
            pages: []
        })
    );
    await writeFile(
        informationPath,
        JSON.stringify({
            data: {
                catalogs: [
                    {
                        year: 2026,
                        programs: [
                            {
                                code: 42,
                                information: {
                                    variants: []
                                }
                            }
                        ]
                    }
                ]
            },
            issues: [],
            pages: []
        })
    );

    await assert.rejects(
        expectedCatalogProgramVariants({
            year: 2026,
            curriculaPath,
            informationPath
        }),
        /especialização EX sem nome válido/
    );
});
