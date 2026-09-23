import {
    JobRequestStatus,
    JobRequestTrigger,
    JobRequestType,
    type JobRequest,
    type PrismaClient
} from "@pomi/db";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InjectionConfig } from "./config.js";

export const workflowNames = ["catalog-programs"] as const;
export type WorkflowName = (typeof workflowNames)[number];
export type WorkflowProfile = "core" | "available" | "complete";

export type WorkflowParameters = {
    workflow: true;
    year: number;
    profile: WorkflowProfile;
    attempt: number;
    snapshotId?: string;
};

export type WorkflowStageParameters = {
    workflowName: WorkflowName;
    workflowStage: string;
    workflowYear: number;
    workflowProfile: WorkflowProfile;
    workflowAttempt: number;
    snapshotId: string;
    firstYear: number;
    lastYear: number;
    partitionKey: string;
};

type JobExecutor = Pick<PrismaClient, "jobRequest">;

export function isWorkflowName(value: string): value is WorkflowName {
    return workflowNames.includes(value as WorkflowName);
}

export function parseWorkflowProfile(value: string): WorkflowProfile {
    if (!(["core", "available", "complete"] as string[]).includes(value))
        throw new Error(`Perfil de workflow inválido: ${value}`);
    return value as WorkflowProfile;
}

export function catalogProgramStages(
    year: number,
    _profile: WorkflowProfile
): string[] {
    if (!Number.isInteger(year) || year < 1998 || year > 3000)
        throw new Error(`Ano de catálogo inválido: ${year}`);
    return ["catalog-programs-snapshot"];
}

export function validateWorkflowConfig(config: InjectionConfig) {
    const configured = new Set(config.injections.map(({ name }) => name));
    const required = ["catalog-programs-snapshot"];
    const missing = required.filter((name) => !configured.has(name));
    if (missing.length > 0)
        throw new Error(
            `Configuração incompleta de catalog-programs: ${missing.join(", ")}`
        );
}

export function workflowParameters(value: unknown): WorkflowParameters | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    if (
        candidate.workflow !== true ||
        !Number.isInteger(candidate.year) ||
        typeof candidate.profile !== "string" ||
        !Number.isInteger(candidate.attempt)
    )
        return null;
    return {
        workflow: true,
        year: candidate.year as number,
        profile: parseWorkflowProfile(candidate.profile),
        attempt: candidate.attempt as number,
        ...(typeof candidate.snapshotId === "string"
            ? { snapshotId: candidate.snapshotId }
            : {})
    };
}

export function workflowStageParameters(
    value: unknown
): WorkflowStageParameters | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    if (
        candidate.workflowName !== "catalog-programs" ||
        typeof candidate.workflowStage !== "string" ||
        !Number.isInteger(candidate.workflowYear) ||
        typeof candidate.workflowProfile !== "string" ||
        !Number.isInteger(candidate.workflowAttempt) ||
        typeof candidate.snapshotId !== "string"
    )
        return null;
    const year = candidate.workflowYear as number;
    return {
        workflowName: "catalog-programs",
        workflowStage: candidate.workflowStage,
        workflowYear: year,
        workflowProfile: parseWorkflowProfile(candidate.workflowProfile),
        workflowAttempt: candidate.workflowAttempt as number,
        snapshotId: candidate.snapshotId,
        firstYear: year,
        lastYear: year,
        partitionKey: String(year)
    };
}

export function workflowProgress(
    stages: string[],
    children: Array<{
        stage: string;
        attempt: number;
        status: JobRequestStatus;
        errorMessage?: string | null;
    }>,
    attempt: number
):
    | { kind: "enqueue"; stage: string }
    | { kind: "wait" }
    | { kind: "failed"; stage: string; errorMessage: string | null }
    | { kind: "complete" } {
    for (const stage of stages) {
        if (
            children.some(
                (child) =>
                    child.stage === stage &&
                    child.status === JobRequestStatus.SUCCEEDED
            )
        )
            continue;
        const current = children.findLast(
            (child) => child.stage === stage && child.attempt === attempt
        );
        if (!current) return { kind: "enqueue", stage };
        if (current.status === JobRequestStatus.FAILED)
            return {
                kind: "failed",
                stage,
                errorMessage: current.errorMessage ?? null
            };
        return { kind: "wait" };
    }
    return { kind: "complete" };
}

export async function enqueueCatalogProgramWorkflows(
    database: JobExecutor,
    {
        firstYear,
        lastYear,
        profile,
        mode,
        requestedBy,
        trigger = JobRequestTrigger.MANUAL,
        scheduledFor,
        snapshotId
    }: {
        firstYear: number;
        lastYear: number;
        profile: WorkflowProfile;
        mode: "all" | "obtain" | "inject";
        requestedBy: string;
        trigger?: JobRequestTrigger;
        scheduledFor?: Date;
        snapshotId?: string;
    }
) {
    if (firstYear > lastYear)
        throw new Error("firstYear não pode ser maior que lastYear");
    const jobs = [];
    for (let year = firstYear; year <= lastYear; year += 1) {
        catalogProgramStages(year, profile);
        const active = await database.jobRequest.findMany({
            where: {
                type: JobRequestType.INJECTION,
                name: "catalog-programs",
                partitionKey: String(year),
                status: {
                    in: [JobRequestStatus.QUEUED, JobRequestStatus.RUNNING]
                }
            },
            take: 1
        });
        if (active.length > 0)
            throw new Error(
                `Já existe um workflow catalog-programs para ${year}: ${active[0].id}`
            );
        jobs.push(
            await database.jobRequest.create({
                data: {
                    type: JobRequestType.INJECTION,
                    name: "catalog-programs",
                    partitionKey: String(year),
                    mode,
                    trigger,
                    scheduledFor,
                    requestedBy,
                    parameters: {
                        workflow: true,
                        year,
                        profile,
                        attempt: 1,
                        ...(snapshotId ? { snapshotId } : {})
                    }
                }
            })
        );
    }
    return jobs;
}

export async function validateWorkflowArtifact(
    inputPath: string,
    parameters: WorkflowStageParameters
) {
    const parsed = JSON.parse(
        await readFile(join(inputPath, "manifest.json"), "utf8")
    ) as Record<string, unknown>;
    if (
        parsed.protocol !== "pomi.catalog-programs.snapshot" ||
        parsed.version !== 1 ||
        parsed.snapshotId !== parameters.snapshotId ||
        parsed.profile !== parameters.workflowProfile ||
        parsed.status !== "COMPLETE" ||
        typeof parsed.components !== "object" ||
        !Array.isArray(parsed.issues)
    )
        throw new Error("Manifest de snapshot inválido ou incompatível");
    const partition = parsed.partition as { year?: unknown } | undefined;
    if (partition?.year !== parameters.workflowYear)
        throw new Error("Partição do snapshot não corresponde ao workflow");
    const blockingIssues = parsed.issues.filter(
        (issue) =>
            issue &&
            typeof issue === "object" &&
            (issue as Record<string, unknown>).blocksCompleteness === true
    );
    if (blockingIssues.length > 0)
        throw new Error(
            `Snapshot possui ${blockingIssues.length} issue(s) bloqueante(s)`
        );
    return {
        pages: null,
        issues: parsed.issues.length,
        blockingIssues: blockingIssues.length
    };
}

function stageParameters(
    workflow: WorkflowParameters,
    stage: string,
    snapshotId: string
): WorkflowStageParameters {
    return {
        workflowName: "catalog-programs",
        workflowStage: stage,
        workflowYear: workflow.year,
        workflowProfile: workflow.profile,
        workflowAttempt: workflow.attempt,
        snapshotId,
        firstYear: workflow.year,
        lastYear: workflow.year,
        partitionKey: String(workflow.year)
    };
}

async function enqueueStage(
    database: JobExecutor,
    parent: JobRequest,
    workflow: WorkflowParameters,
    stage: string
) {
    return database.jobRequest.create({
        data: {
            type: JobRequestType.INJECTION,
            name: stage,
            parentJobId: parent.id,
            partitionKey: String(workflow.year),
            mode: parent.mode,
            trigger: parent.trigger,
            scheduledFor: parent.scheduledFor,
            requestedBy: parent.requestedBy,
            parameters: stageParameters(
                workflow,
                stage,
                workflow.snapshotId ??
                    (workflow.attempt === 1
                        ? parent.id
                        : `${parent.id}-${workflow.attempt}`)
            ),
            deduplicationKey: `workflow:${parent.id}:${workflow.attempt}:${stage}`
        }
    });
}

export async function advanceWorkflow(
    database: JobExecutor,
    config: InjectionConfig,
    parentId: string
) {
    const parent = await database.jobRequest.findUnique({
        where: { id: parentId }
    });
    if (!parent) throw new Error(`Workflow não encontrado: ${parentId}`);
    const workflow = workflowParameters(parent.parameters);
    if (!workflow)
        throw new Error(`Parâmetros inválidos do workflow: ${parentId}`);
    const stages = catalogProgramStages(workflow.year, workflow.profile);
    const children = await database.jobRequest.findMany({
        where: { parentJobId: parentId },
        orderBy: { createdAt: "asc" }
    });
    const progress = workflowProgress(
        stages,
        children.flatMap((child) => {
            const parameters = workflowStageParameters(child.parameters);
            return parameters
                ? [
                      {
                          stage: parameters.workflowStage,
                          attempt: parameters.workflowAttempt,
                          status: child.status,
                          errorMessage: child.errorMessage
                      }
                  ]
                : [];
        }),
        workflow.attempt
    );
    if (progress.kind === "enqueue") {
        await enqueueStage(database, parent, workflow, progress.stage);
        await writeWorkflowManifest(database, config, parentId);
        return;
    }
    if (progress.kind === "failed") {
        await database.jobRequest.update({
            where: { id: parentId },
            data: {
                status: JobRequestStatus.FAILED,
                errorMessage: `${progress.stage}: ${progress.errorMessage ?? "falha"}`,
                finishedAt: new Date()
            }
        });
        await writeWorkflowManifest(database, config, parentId);
        return;
    }
    if (progress.kind === "wait") {
        await writeWorkflowManifest(database, config, parentId);
        return;
    }
    await database.jobRequest.update({
        where: { id: parentId },
        data: {
            status: JobRequestStatus.SUCCEEDED,
            errorMessage: null,
            finishedAt: new Date()
        }
    });
    await writeWorkflowManifest(database, config, parentId);
}

export async function retryWorkflow(
    database: JobExecutor,
    config: InjectionConfig,
    parentId: string
) {
    const parent = await database.jobRequest.findUnique({
        where: { id: parentId }
    });
    if (!parent) throw new Error("Workflow não encontrado");
    if (parent.status !== JobRequestStatus.FAILED)
        throw new Error("Somente workflows com falha podem ser retomados");
    const workflow = workflowParameters(parent.parameters);
    if (!workflow) throw new Error("O job informado não é um workflow");
    await database.jobRequest.update({
        where: { id: parentId },
        data: {
            status: JobRequestStatus.RUNNING,
            parameters: { ...workflow, attempt: workflow.attempt + 1 },
            errorMessage: null,
            finishedAt: null
        }
    });
    await advanceWorkflow(database, config, parentId);
}

async function artifactSummary(path: string) {
    try {
        const bytes = await readFile(path);
        const parsed = JSON.parse(bytes.toString("utf8")) as {
            pages?: unknown[];
            issues?: unknown[];
        };
        return {
            path,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            pages: Array.isArray(parsed.pages) ? parsed.pages.length : null,
            issues: Array.isArray(parsed.issues) ? parsed.issues.length : null
        };
    } catch {
        return { path, sha256: null, pages: null, issues: null };
    }
}

export async function workflowStatus(database: JobExecutor, id: string) {
    const job = await database.jobRequest.findUnique({ where: { id } });
    if (!job) throw new Error("Job não encontrado");
    const children = await database.jobRequest.findMany({
        where: { parentJobId: id },
        orderBy: { createdAt: "asc" }
    });
    return { ...job, stages: children };
}

export async function writeWorkflowManifest(
    database: JobExecutor,
    config: InjectionConfig,
    parentId: string
) {
    const status = await workflowStatus(database, parentId);
    const workflow = workflowParameters(status.parameters);
    if (!workflow) return;
    const stages = await Promise.all(
        status.stages.map(async (job) => {
            const parameters = workflowStageParameters(job.parameters);
            const artifact = parameters
                ? await artifactSummary(
                      join(
                          config.rootDirectory,
                          "data",
                          "snapshots",
                          parameters.workflowName,
                          String(parameters.workflowYear),
                          parameters.snapshotId,
                          "manifest.json"
                      )
                  )
                : null;
            return {
                name: job.name,
                attempt: parameters?.workflowAttempt ?? null,
                status: job.status,
                runId: job.runId,
                error: job.errorMessage,
                artifact
            };
        })
    );
    const manifest = {
        schemaVersion: 1,
        workflow: "catalog-programs",
        jobId: parentId,
        year: workflow.year,
        profile: workflow.profile,
        mode: status.mode,
        status: status.status,
        generatedAt: new Date().toISOString(),
        stages
    };
    const path = join(
        config.rootDirectory,
        "data",
        "workflows",
        "catalog-programs",
        String(workflow.year),
        parentId,
        "workflow-status.json"
    );
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.partial`;
    await writeFile(
        temporary,
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8"
    );
    await rename(temporary, path);
}
