import { type Prisma, type PrismaClient } from "@pomi/db";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withAuditTransaction } from "../audit-context.js";
import { readSnapshotManifest, snapshotComponentPaths } from "../snapshots.js";
import { validateAcademicCredits } from "./AcademicDataInjection.js";
import { unwrapScrapeData } from "./scrape-input.js";

type Database = Pick<Prisma.TransactionClient, "course" | "dataAuditEvent">;
type ExpectedCourse = { code: string; credits: number };
type RepairEntry = {
    id: number;
    code: string;
    name: string;
    unitId: number | null;
    beforeCredits: number;
    credits: number;
    creationAuditId: string;
    latestAuditId: string;
};
export type AcademicCreditsPreview = {
    version: 1;
    snapshotId: string;
    manifestSha256: string;
    partition: { year: number; semester: 1 | 2; instituteCode: string };
    candidates: RepairEntry[];
    skipped: Array<{ code: string; reason: string }>;
};
type RepairSource = Omit<
    AcademicCreditsPreview,
    "version" | "candidates" | "skipped"
> & { courses: ExpectedCourse[] };

const hash = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");

export function isDefaultCreditsCreation(
    event: {
        operation: string;
        injectionName: string | null;
        before: unknown;
        after: unknown;
        auditContext: unknown;
    },
    id: number,
    code: string
) {
    const after = event.after as Record<string, unknown> | null;
    const context = event.auditContext as Record<string, unknown> | null;
    return (
        event.operation === "CREATE" &&
        event.before === null &&
        ["academic-data", "academic-data-snapshot"].includes(
            event.injectionName ?? ""
        ) &&
        context?.source === "injection" &&
        after?.id === id &&
        after.code === code &&
        after.credits === 4
    );
}

async function readRepairSource(directory: string): Promise<RepairSource> {
    const manifest = await readSnapshotManifest(directory, {
        protocol: "pomi.academic-data.snapshot",
        version: 2,
        requiredComponents: ["academicData"]
    });
    const { year, semester, instituteCode } = manifest.partition;
    if (
        year !== 2027 ||
        semester !== 1 ||
        typeof instituteCode !== "string" ||
        !instituteCode ||
        manifest.components.academicData?.schemaVersion !== 2
    )
        throw new Error("A correção requer um snapshot v2 completo de 2027/1");
    const path = (await snapshotComponentPaths(directory, manifest)).get(
        "academicData"
    );
    if (!path) throw new Error("Componente acadêmico ausente");
    const periods = validateAcademicCredits(
        unwrapScrapeData(JSON.parse(await readFile(path, "utf8")))
    );
    if (
        periods.length !== 1 ||
        periods[0].year !== year ||
        periods[0].semester !== semester ||
        periods[0].institutes.length !== 1 ||
        periods[0].institutes[0].code !== instituteCode
    )
        throw new Error("Conteúdo não corresponde à partição do snapshot");
    const courses = periods[0].institutes[0].courses
        .map(({ code, credits }) => ({ code, credits }))
        .sort((a, b) => a.code.localeCompare(b.code));
    if (new Set(courses.map((course) => course.code)).size !== courses.length)
        throw new Error("Disciplinas duplicadas no snapshot");
    return {
        snapshotId: manifest.snapshotId,
        manifestSha256: hash(
            await readFile(resolve(directory, "manifest.json"))
        ),
        partition: { year, semester, instituteCode },
        courses
    };
}

async function createPreview(
    database: Database,
    source: RepairSource
): Promise<AcademicCreditsPreview> {
    const { courses, ...metadata } = source;
    const candidates: RepairEntry[] = [];
    const skipped: AcademicCreditsPreview["skipped"] = [];
    for (const expected of courses) {
        const course = await database.course.findUnique({
            where: { code: expected.code },
            select: {
                id: true,
                code: true,
                name: true,
                credits: true,
                unitId: true,
                unit: { select: { code: true } },
                classes: {
                    where: {
                        studyPeriod: {
                            year: 2027,
                            yearPeriod: "FIRST_SEMESTER"
                        }
                    },
                    select: { id: true },
                    take: 1
                }
            }
        });
        if (!course) {
            skipped.push({
                code: expected.code,
                reason: "Disciplina ausente no banco"
            });
            continue;
        }
        if (course.credits === expected.credits) continue;
        if (
            course.credits !== 4 ||
            course.unit?.code !== source.partition.instituteCode ||
            !course.classes.length
        ) {
            skipped.push({
                code: expected.code,
                reason: "Valor ou vínculos atuais fora do escopo da correção"
            });
            continue;
        }
        const events = await database.dataAuditEvent.findMany({
            where: {
                schemaName: "data",
                tableName: "Course",
                recordKey: { path: ["id"], equals: course.id }
            },
            orderBy: { id: "asc" }
        });
        const creation = events[0];
        if (
            !creation ||
            !isDefaultCreditsCreation(creation, course.id, course.code) ||
            events.some((event) => {
                const before = event.before as Record<string, unknown> | null;
                const after = event.after as Record<string, unknown> | null;
                return (
                    event.operation !== "CREATE" &&
                    before?.credits !== after?.credits
                );
            })
        ) {
            skipped.push({
                code: expected.code,
                reason: "Auditoria não comprova créditos fixos preservados desde a criação"
            });
            continue;
        }
        candidates.push({
            id: course.id,
            code: course.code,
            name: course.name,
            unitId: course.unitId,
            beforeCredits: course.credits,
            credits: expected.credits,
            creationAuditId: String(creation.id),
            latestAuditId: String(events.at(-1)!.id)
        });
    }
    return { version: 1, ...metadata, candidates, skipped };
}

export async function previewAcademicCredits(
    prisma: PrismaClient,
    directory: string
) {
    return createPreview(prisma, await readRepairSource(directory));
}

export async function applyAcademicCredits(
    prisma: PrismaClient,
    directory: string,
    previewPath: string
) {
    const source = await readRepairSource(directory);
    const preview = JSON.parse(
        await readFile(previewPath, "utf8")
    ) as AcademicCreditsPreview;
    if (
        preview.version !== 1 ||
        !Array.isArray(preview.candidates) ||
        !Array.isArray(preview.skipped)
    )
        throw new Error("Prévia inválida");
    const previewSha256 = hash(JSON.stringify(preview));
    const runId = randomUUID();
    return withAuditTransaction(
        prisma,
        {
            source: "injection",
            runId,
            injectionName: "academic-credits-repair",
            mode: "inject",
            trigger: "MANUAL",
            requestedBy: process.env.POMI_JOB_REQUESTED_BY ?? "cli",
            snapshotId: source.snapshotId,
            creditsCorrectionPreviewSha256: previewSha256
        },
        async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('academic-credits-repair'))`;
            const codes = source.courses.map((course) => course.code);
            await tx.course.findMany({
                where: { code: { in: codes } },
                select: { id: true }
            });
            for (const code of codes)
                await tx.$queryRaw`SELECT id FROM data."Course" WHERE code = ${code} FOR UPDATE`;
            const alreadyApplied = new Set<number>();
            for (const entry of preview.candidates) {
                const current = await tx.course.findUnique({
                    where: { id: entry.id }
                });
                const latest = await tx.dataAuditEvent.findFirst({
                    where: {
                        schemaName: "data",
                        tableName: "Course",
                        recordKey: { path: ["id"], equals: entry.id }
                    },
                    orderBy: { id: "desc" }
                });
                const context = latest?.auditContext as Record<
                    string,
                    unknown
                > | null;
                if (
                    current?.credits === entry.credits &&
                    current.name === entry.name &&
                    current.unitId === entry.unitId &&
                    latest?.injectionName === "academic-credits-repair" &&
                    context?.creditsCorrectionPreviewSha256 === previewSha256
                )
                    alreadyApplied.add(entry.id);
            }
            const fresh = await createPreview(tx, source);
            const remaining = {
                ...preview,
                candidates: preview.candidates.filter(
                    (entry) => !alreadyApplied.has(entry.id)
                )
            };
            if (JSON.stringify(fresh) !== JSON.stringify(remaining))
                throw new Error(
                    "Prévia desatualizada ou incompatível; gere uma nova prévia"
                );
            for (const entry of remaining.candidates)
                await tx.course.update({
                    where: { id: entry.id },
                    data: { credits: entry.credits }
                });
            return {
                snapshotId: source.snapshotId,
                previewSha256,
                runId,
                updated: remaining.candidates.length,
                alreadyApplied: alreadyApplied.size,
                skipped: fresh.skipped
            };
        },
        { timeout: 120000, maxWait: 10000 }
    );
}
