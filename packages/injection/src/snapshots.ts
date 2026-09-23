import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { InjectionContext } from "./services/InjectionTypes.js";

export type SnapshotComponent = {
    status: "COMPLETE" | "UNAVAILABLE" | "FAILED";
    path: string | null;
    sha256: string | null;
    schemaVersion: number;
    records: number;
};

export type SnapshotManifest = {
    protocol: string;
    version: number;
    snapshotId: string;
    partition: Record<string, string | number>;
    profile?: string;
    status: "COMPLETE" | "PARTIAL";
    components: Record<string, SnapshotComponent>;
    producer?: unknown;
    issues?: unknown[];
};

export async function readSnapshotManifest(
    inputPath: string,
    {
        protocol,
        version,
        requiredComponents = []
    }: {
        protocol: string;
        version: number;
        requiredComponents?: string[];
    }
) {
    const manifest = JSON.parse(
        await readFile(resolve(inputPath, "manifest.json"), "utf8")
    ) as SnapshotManifest;
    if (
        manifest.protocol !== protocol ||
        manifest.version !== version ||
        manifest.status !== "COMPLETE" ||
        typeof manifest.snapshotId !== "string" ||
        !manifest.partition ||
        typeof manifest.partition !== "object" ||
        !manifest.components ||
        typeof manifest.components !== "object"
    )
        throw new Error("Protocolo de snapshot incompatível");
    for (const name of requiredComponents)
        if (manifest.components[name]?.status !== "COMPLETE")
            throw new Error(`Componente obrigatório incompleto: ${name}`);
    return manifest;
}

export async function snapshotComponentPaths(
    inputPath: string,
    manifest: SnapshotManifest
) {
    const snapshotDirectory = resolve(inputPath);
    const paths = new Map<string, string>();
    for (const [name, component] of Object.entries(manifest.components)) {
        if (component.status !== "COMPLETE") continue;
        if (!component.path || !component.sha256)
            throw new Error(`Metadados incompletos no componente ${name}`);
        const path = resolve(snapshotDirectory, component.path);
        if (!path.startsWith(`${snapshotDirectory}/`))
            throw new Error(`Caminho inválido no componente ${name}`);
        const bytes = await readFile(path);
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== component.sha256)
            throw new Error(`Hash inválido no componente ${name}`);
        paths.set(name, path);
    }
    return paths;
}

export async function beginSnapshotPersistence(
    context: InjectionContext,
    manifest: SnapshotManifest,
    { workflow, partitionKey }: { workflow: string; partitionKey: string }
) {
    const manifestPath = resolve(context.inputPath, "manifest.json");
    const manifestBytes = await readFile(manifestPath);
    const manifestSha256 = createHash("sha256")
        .update(manifestBytes)
        .digest("hex");
    await context.prisma.$executeRawUnsafe(
        `INSERT INTO app."DataSnapshot" (id, protocol, "protocolVersion", workflow, "partitionKey", profile, status, "manifestPath", "manifestSha256", producer, "jobRequestId", "collectedAt", "validatedAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, 'PERSISTING', $7, $8, $9::jsonb, $10, NOW(), NOW(), NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET status = 'PERSISTING', "manifestPath" = EXCLUDED."manifestPath", "manifestSha256" = EXCLUDED."manifestSha256", "updatedAt" = NOW()`,
        manifest.snapshotId,
        manifest.protocol,
        manifest.version,
        workflow,
        partitionKey,
        manifest.profile ?? "default",
        manifestPath,
        manifestSha256,
        JSON.stringify(manifest.producer ?? null),
        context.auditContext.jobId ?? null
    );
    for (const [name, component] of Object.entries(manifest.components))
        await context.prisma.$executeRawUnsafe(
            `INSERT INTO app."DataSnapshotComponent" ("snapshotId", name, "schemaVersion", status, "artifactPath", "artifactSha256", "recordCount", "issueCount", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4::app."DataSnapshotComponentStatus", $5, $6, $7, $8, NOW(), NOW()) ON CONFLICT ("snapshotId", name) DO UPDATE SET status = EXCLUDED.status, "artifactPath" = EXCLUDED."artifactPath", "artifactSha256" = EXCLUDED."artifactSha256", "recordCount" = EXCLUDED."recordCount", "issueCount" = EXCLUDED."issueCount", "updatedAt" = NOW()`,
            manifest.snapshotId,
            name,
            component.schemaVersion,
            component.status,
            component.path,
            component.sha256,
            component.records,
            manifest.issues?.length ?? 0
        );
}

export async function failSnapshotPersistence(
    context: InjectionContext,
    snapshotId: string
) {
    await context.prisma.$executeRawUnsafe(
        `UPDATE app."DataSnapshot" SET status = 'FAILED', "updatedAt" = NOW() WHERE id = $1`,
        snapshotId
    );
}

export async function publishSnapshot(
    context: InjectionContext,
    manifest: SnapshotManifest,
    { workflow, partitionKey }: { workflow: string; partitionKey: string }
) {
    await context.prisma.$executeRawUnsafe(
        `UPDATE app."DataSnapshotComponent" SET status = 'PERSISTED', "persistedAt" = NOW(), "updatedAt" = NOW() WHERE "snapshotId" = $1 AND status = 'COMPLETE'`,
        manifest.snapshotId
    );
    await context.prisma.$executeRawUnsafe(
        `UPDATE app."DataSnapshot" SET status = 'PUBLISHED', "persistedAt" = NOW(), "publishedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
        manifest.snapshotId
    );
    const rows = await context.prisma.$queryRawUnsafe<
        Array<{
            id: string;
            status: "PUBLISHED" | "FAILED";
            manifestPath: string;
        }>
    >(
        `SELECT id, status::text AS status, "manifestPath" FROM app."DataSnapshot" WHERE workflow = $1 AND "partitionKey" = $2 AND (status = 'PUBLISHED' OR (status = 'FAILED' AND "updatedAt" < NOW() - INTERVAL '7 days')) ORDER BY "publishedAt" DESC NULLS LAST, "updatedAt" DESC`,
        workflow,
        partitionKey
    );
    const expired = [
        ...rows.filter((row) => row.status === "PUBLISHED").slice(3),
        ...rows.filter((row) => row.status === "FAILED")
    ];
    const partitionDirectory = resolve(context.inputPath, "..");
    for (const row of expired) {
        const snapshotDirectory = dirname(resolve(row.manifestPath));
        if (
            resolve(snapshotDirectory, "..") !== partitionDirectory ||
            basename(snapshotDirectory) !== row.id
        )
            throw new Error(`Snapshot fora da partição esperada: ${row.id}`);
        await rm(snapshotDirectory, { recursive: true, force: true });
        await context.prisma.$executeRawUnsafe(
            `DELETE FROM app."DataSnapshot" WHERE id = $1`,
            row.id
        );
    }
}
