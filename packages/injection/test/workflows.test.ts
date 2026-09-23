import { JobRequestStatus } from "@pomi/db";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    catalogProgramStages,
    parseWorkflowProfile,
    validateWorkflowArtifact,
    workflowParameters,
    workflowProgress,
    workflowStageParameters
} from "../src/workflows.js";

test("resolve etapas por era e perfil", () => {
    for (const year of [1998, 2020, 2026])
        assert.deepEqual(catalogProgramStages(year, "complete"), [
            "catalog-programs-snapshot"
        ]);
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
            workflowStage: "catalog-programs-snapshot",
            workflowYear: 2026,
            workflowProfile: "complete",
            workflowAttempt: 2,
            snapshotId: "snapshot-1"
        }),
        {
            workflowName: "catalog-programs",
            workflowStage: "catalog-programs-snapshot",
            workflowYear: 2026,
            workflowProfile: "complete",
            workflowAttempt: 2,
            snapshotId: "snapshot-1",
            firstYear: 2026,
            lastYear: 2026,
            partitionKey: "2026"
        }
    );
});

test("valida envelope antes da persistência do workflow", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-workflow-"));
    const path = join(directory, "manifest.json");
    const parameters = workflowStageParameters({
        workflowName: "catalog-programs",
        workflowStage: "catalog-programs-snapshot",
        workflowYear: 2026,
        workflowProfile: "complete",
        workflowAttempt: 1,
        snapshotId: "snapshot-1"
    })!;
    try {
        await writeFile(
            path,
            JSON.stringify({
                protocol: "pomi.catalog-programs.snapshot",
                version: 1,
                snapshotId: "snapshot-1",
                partition: { year: 2026 },
                profile: "complete",
                status: "COMPLETE",
                components: {},
                issues: []
            })
        );
        assert.deepEqual(
            await validateWorkflowArtifact(directory, parameters),
            {
                pages: null,
                issues: 0,
                blockingIssues: 0
            }
        );

        await writeFile(
            path,
            JSON.stringify({
                protocol: "pomi.catalog-programs.snapshot",
                version: 1,
                snapshotId: "snapshot-1",
                partition: { year: 2026 },
                profile: "complete",
                status: "PARTIAL",
                components: {},
                issues: [{ blocksCompleteness: true }]
            })
        );
        await assert.rejects(
            validateWorkflowArtifact(directory, parameters),
            /inválido ou incompatível/
        );

        await writeFile(path, JSON.stringify({ protocol: "inválido" }));
        await assert.rejects(
            validateWorkflowArtifact(directory, parameters),
            /Manifest de snapshot inválido/
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
