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
    if (!Number.isInteger(year))
        throw new Error("Partição de catálogo inválida");
    const componentPaths = await snapshotComponentPaths(
        context.inputPath,
        manifest
    );
    const catalogPath = componentPaths.get("catalog");
    const relationshipsPath = componentPaths.get("relationships");
    if (!catalogPath || !relationshipsPath)
        throw new Error("Componentes de disciplinas ausentes");
    await beginSnapshotPersistence(context, manifest, {
        workflow: "catalog-disciplines",
        partitionKey: String(year)
    });
    try {
        await injectCatalogDisciplines(
            { ...context, inputPath: catalogPath },
            { ...options, phase: "catalog" }
        );
        await injectCatalogDisciplines(
            { ...context, inputPath: relationshipsPath },
            { ...options, phase: "relationships" }
        );
    } catch (error) {
        await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    await publishSnapshot(context, manifest, {
        workflow: "catalog-disciplines",
        partitionKey: String(year)
    });
}
