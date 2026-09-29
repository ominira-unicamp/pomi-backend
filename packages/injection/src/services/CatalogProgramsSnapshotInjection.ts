import {
    beginSnapshotPersistence,
    failSnapshotPersistence,
    publishSnapshot,
    readSnapshotManifest,
    snapshotComponentPaths
} from "../snapshots.js";
import {
    injectCatalogInformation,
    type CatalogInformationInjectionOptions
} from "./CatalogInformationInjection.js";
import {
    injectCatalogs,
    type CatalogInjectionOptions
} from "./CatalogInjection.js";
import {
    injectHistoricalPrograms,
    type HistoricalProgramsInjectionOptions
} from "./HistoricalProgramsInjection.js";
import type { InjectionContext } from "./InjectionTypes.js";
import {
    injectSuggestions,
    type SuggestionsInjectionOptions
} from "./SuggestionsInjection.js";

export async function injectCatalogProgramsSnapshot(
    context: InjectionContext,
    options: Record<string, unknown> = {}
) {
    const manifest = await readSnapshotManifest(context.inputPath, {
        protocol: "pomi.catalog-programs.snapshot",
        version: 1
    });
    const year = manifest.partition.year;
    if (!Number.isInteger(year))
        throw new Error("Partição de catálogo inválida");
    const required =
        manifest.profile === "complete"
            ? ["programs", "curricula", "information", "suggestions"]
            : ["programs"];
    for (const name of required)
        if (manifest.components[name]?.status !== "COMPLETE")
            throw new Error(`Componente obrigatório incompleto: ${name}`);
    const componentPaths = await snapshotComponentPaths(
        context.inputPath,
        manifest
    );
    await beginSnapshotPersistence(context, manifest, {
        workflow: "catalog-programs",
        partitionKey: String(year)
    });
    try {
        const curriculaPath = componentPaths.get("curricula");
        if (curriculaPath)
            await injectCatalogs(
                { ...context, inputPath: curriculaPath },
                options as CatalogInjectionOptions
            );
        const programsPath = componentPaths.get("programs");
        if (!programsPath) throw new Error("Componente programs ausente");
        await injectHistoricalPrograms(
            { ...context, inputPath: programsPath },
            options as HistoricalProgramsInjectionOptions
        );
        const informationPath = componentPaths.get("information");
        if (informationPath)
            await injectCatalogInformation(
                { ...context, inputPath: informationPath },
                options as CatalogInformationInjectionOptions
            );
        const suggestionsPath = componentPaths.get("suggestions");
        if (suggestionsPath)
            await injectSuggestions(
                { ...context, inputPath: suggestionsPath },
                options as SuggestionsInjectionOptions
            );
    } catch (error) {
        await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    await publishSnapshot(context, manifest, {
        workflow: "catalog-programs",
        partitionKey: String(year)
    });
}
