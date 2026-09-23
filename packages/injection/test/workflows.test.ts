import { JobRequestStatus } from "@pomi/db";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    catalogProgramCapabilities,
    catalogProgramStages,
    parseWorkflowProfile,
    validateWorkflowArtifact,
    workflowParameters,
    workflowProgress,
    workflowStageParameters
} from "../src/workflows.js";

test("resolve etapas por era e perfil", () => {
    assert.deepEqual(catalogProgramStages(1998, "core"), [
        "historical-programs"
    ]);
    assert.deepEqual(catalogProgramStages(2020, "available"), [
        "historical-programs"
    ]);
    assert.deepEqual(catalogProgramStages(2026, "core"), ["catalogs"]);
    assert.deepEqual(catalogProgramStages(2026, "complete"), [
        "catalogs",
        "catalog-information",
        "suggestions"
    ]);
    assert.throws(
        () => catalogProgramStages(2020, "complete"),
        /2021 ou posterior/
    );
});

test("avança em ordem e retoma sem repetir etapas bem-sucedidas", () => {
    const stages = ["catalogs", "catalog-information", "suggestions"];
    assert.deepEqual(workflowProgress(stages, [], 1), {
        kind: "enqueue",
        stage: "catalogs"
    });
    assert.deepEqual(
        workflowProgress(
            stages,
            [
                {
                    stage: "catalogs",
                    attempt: 1,
                    status: JobRequestStatus.SUCCEEDED
                }
            ],
            1
        ),
        { kind: "enqueue", stage: "catalog-information" }
    );
    assert.deepEqual(
        workflowProgress(
            stages,
            [
                {
                    stage: "catalogs",
                    attempt: 1,
                    status: JobRequestStatus.SUCCEEDED
                },
                {
                    stage: "catalog-information",
                    attempt: 1,
                    status: JobRequestStatus.FAILED,
                    errorMessage: "fonte indisponível"
                }
            ],
            1
        ),
        {
            kind: "failed",
            stage: "catalog-information",
            errorMessage: "fonte indisponível"
        }
    );
    assert.deepEqual(
        workflowProgress(
            stages,
            [
                {
                    stage: "catalogs",
                    attempt: 1,
                    status: JobRequestStatus.SUCCEEDED
                },
                {
                    stage: "catalog-information",
                    attempt: 1,
                    status: JobRequestStatus.FAILED
                }
            ],
            2
        ),
        { kind: "enqueue", stage: "catalog-information" }
    );
});

test("expõe capabilities sem transformar ausência histórica em null", () => {
    assert.deepEqual(catalogProgramCapabilities(1998, "available"), {
        adapter: "LEGACY_CLASSIC",
        requestedProfile: "available",
        components: {
            programs: "available",
            curricula: "unsupported-format",
            information: "unsupported-format",
            suggestions: "unsupported-format"
        }
    });
    assert.equal(
        catalogProgramCapabilities(2020, "core").adapter,
        "LEGACY_INTERMEDIATE"
    );
    assert.equal(
        catalogProgramCapabilities(2021, "complete").adapter,
        "MODERN"
    );
});

test("valida parâmetros persistidos de workflow e etapa", () => {
    assert.deepEqual(
        workflowParameters({
            workflow: true,
            year: 2026,
            profile: "complete",
            attempt: 1
        }),
        {
            workflow: true,
            year: 2026,
            profile: "complete",
            attempt: 1
        }
    );
    assert.equal(workflowParameters({ workflow: true }), null);
    assert.equal(parseWorkflowProfile("available"), "available");
    assert.throws(() => parseWorkflowProfile("unknown"), /inválido/);

    assert.deepEqual(
        workflowStageParameters({
            workflowName: "catalog-programs",
            workflowStage: "catalogs",
            workflowYear: 2026,
            workflowProfile: "complete",
            workflowAttempt: 2
        }),
        {
            workflowName: "catalog-programs",
            workflowStage: "catalogs",
            workflowYear: 2026,
            workflowProfile: "complete",
            workflowAttempt: 2,
            firstYear: 2026,
            lastYear: 2026,
            partitionKey: "2026"
        }
    );
});

test("valida envelope antes da persistência do workflow", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-workflow-"));
    const path = join(directory, "artifact.json");
    const parameters = workflowStageParameters({
        workflowName: "catalog-programs",
        workflowStage: "catalogs",
        workflowYear: 2026,
        workflowProfile: "complete",
        workflowAttempt: 1
    })!;
    try {
        await writeFile(
            path,
            JSON.stringify({ data: {}, issues: [], pages: [{ adapter: "x" }] })
        );
        assert.deepEqual(await validateWorkflowArtifact(path, parameters), {
            pages: 1,
            issues: 0,
            blockingIssues: 0
        });

        await writeFile(
            path,
            JSON.stringify({
                data: {},
                issues: [{ code: "load-error" }],
                pages: []
            })
        );
        await assert.rejects(
            validateWorkflowArtifact(path, parameters),
            /Artefato incompleto/
        );

        await writeFile(path, JSON.stringify({ data: {} }));
        await assert.rejects(
            validateWorkflowArtifact(path, parameters),
            /data, issues e pages/
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
