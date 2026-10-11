import { readFile } from "node:fs/promises";
import {
    beginSnapshotPersistence,
    failSnapshotPersistence,
    publishSnapshot,
    readSnapshotManifest,
    snapshotComponentPaths
} from "../snapshots.js";
import {
    injectCatalogDisciplines,
    type CatalogDisciplinesInjectionOptions
} from "./CatalogDisciplinesInjection.js";
import type { InjectionContext } from "./InjectionTypes.js";

type SnapshotCatalog = {
    year: number;
    sourceFormat?: string;
    courses: Array<{
        code: string;
        name?: string;
        credits?: number | null;
        prerequisites?: unknown;
    }>;
};

async function readCatalogs(path: string) {
    const envelope = JSON.parse(await readFile(path, "utf8")) as {
        data?: { catalogs?: unknown };
    };
    if (!Array.isArray(envelope.data?.catalogs))
        throw new Error("Componente de disciplinas sem catálogos");
    return envelope.data.catalogs as SnapshotCatalog[];
}

function uniqueCourseCodes(catalog: SnapshotCatalog, component: string) {
    if (!Array.isArray(catalog.courses) || catalog.courses.length === 0)
        throw new Error(`Componente ${component} sem disciplinas`);
    const codes = catalog.courses.map(({ code }) => code);
    if (codes.some((code) => typeof code !== "string" || !code.trim()))
        throw new Error(`Componente ${component} possui código inválido`);
    if (new Set(codes).size !== codes.length)
        throw new Error(`Componente ${component} possui códigos duplicados`);
    return [...codes].sort();
}

export async function validateCatalogDisciplineComponents({
    catalogPath,
    relationshipsPath,
    year,
    catalogRecords,
    relationshipRecords
}: {
    catalogPath: string;
    relationshipsPath: string;
    year: number;
    catalogRecords: number;
    relationshipRecords: number;
}) {
    const [catalogs, relationshipCatalogs] = await Promise.all([
        readCatalogs(catalogPath),
        readCatalogs(relationshipsPath)
    ]);
    if (catalogs.length !== 1 || relationshipCatalogs.length !== 1)
        throw new Error("Snapshot deve conter exatamente um catálogo");
    const catalog = catalogs[0];
    const relationships = relationshipCatalogs[0];
    if (catalog.year !== year || relationships.year !== year)
        throw new Error("Ano interno diverge da partição do snapshot");
    if (catalog.sourceFormat !== relationships.sourceFormat)
        throw new Error("Formato da fonte diverge entre componentes");
    const catalogCodes = uniqueCourseCodes(catalog, "catalog");
    const relationshipCodes = uniqueCourseCodes(relationships, "relationships");
    if (JSON.stringify(catalogCodes) !== JSON.stringify(relationshipCodes))
        throw new Error(
            "Componentes possuem conjuntos de disciplinas diferentes"
        );
    if (
        catalogRecords !== catalogCodes.length ||
        relationshipRecords !== relationshipCodes.length
    )
        throw new Error("Contagem do manifesto diverge dos componentes");
    for (const course of catalog.courses) {
        if (typeof course.name !== "string" || !course.name.trim())
            throw new Error(`Disciplina ${course.code} sem nome`);
        if (!Number.isInteger(course.credits) || (course.credits as number) < 0)
            throw new Error(`Disciplina ${course.code} sem créditos válidos`);
        if ("prerequisites" in course)
            throw new Error("Componente catalog contém relações");
    }
    for (const course of relationships.courses)
        if (!("prerequisites" in course))
            throw new Error(
                `Disciplina ${course.code} sem pré-requisitos declarados`
            );
}

export async function injectCatalogDisciplinesSnapshot(
    context: InjectionContext,
    options: CatalogDisciplinesInjectionOptions = {}
) {
    const manifest = await readSnapshotManifest(context.inputPath, {
        protocol: "pomi.catalog-disciplines.snapshot",
        version: 2,
        requiredComponents: ["catalog", "relationships"]
    });
    const year = manifest.partition.year;
    if (typeof year !== "number" || !Number.isInteger(year))
        throw new Error("Partição de catálogo inválida");
    const componentPaths = await snapshotComponentPaths(
        context.inputPath,
        manifest
    );
    const catalogPath = componentPaths.get("catalog");
    const relationshipsPath = componentPaths.get("relationships");
    if (!catalogPath || !relationshipsPath)
        throw new Error("Componentes de disciplinas ausentes");
    await validateCatalogDisciplineComponents({
        catalogPath,
        relationshipsPath,
        year,
        catalogRecords: manifest.components.catalog.records,
        relationshipRecords: manifest.components.relationships.records
    });
    if (!options.dryRun)
        await beginSnapshotPersistence(context, manifest, {
            workflow: "catalog-disciplines",
            partitionKey: String(year)
        });
    try {
        await injectCatalogDisciplines(
            { ...context, inputPath: catalogPath },
            {
                ...options,
                phase: "all",
                strict: true,
                reconcileMissingCatalogCourses: true,
                relationshipsInputPath: relationshipsPath,
                dryRun: options.dryRun
            }
        );
    } catch (error) {
        if (!options.dryRun)
            await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    if (!options.dryRun)
        await publishSnapshot(context, manifest, {
            workflow: "catalog-disciplines",
            partitionKey: String(year)
        });
}
