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
    expectedCatalogProgramVariants,
    reconcileCatalogProgramVariants
} from "./CatalogProgramVariantReconciliation.js";
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
    if (typeof year !== "number" || !Number.isInteger(year))
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
    const curriculaPath = componentPaths.get("curricula");
    const informationPath = componentPaths.get("information");
    const expectedVariants =
        manifest.profile === "complete" && curriculaPath && informationPath
            ? await expectedCatalogProgramVariants({
                  year,
                  curriculaPath,
                  informationPath
              })
            : undefined;
    await beginSnapshotPersistence(context, manifest, {
        workflow: "catalog-programs",
        partitionKey: String(year)
    });
    try {
        if (curriculaPath)
            await injectCatalogs(
                { ...context, inputPath: curriculaPath },
                {
                    ...(options as CatalogInjectionOptions),
                    updateProgramMetadata: year >= new Date().getFullYear(),
                    requireAllCourses: manifest.profile === "complete"
                }
            );
        const programsPath = componentPaths.get("programs");
        if (!programsPath) throw new Error("Componente programs ausente");
        await injectHistoricalPrograms(
            { ...context, inputPath: programsPath },
            options as HistoricalProgramsInjectionOptions
        );
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
        if (manifest.profile === "complete" && curriculaPath && informationPath)
            await reconcileCatalogProgramVariants(context, {
                year,
                curriculaPath,
                informationPath,
                expectedVariants
            });
    } catch (error) {
        await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    await publishSnapshot(context, manifest, {
        workflow: "catalog-programs",
        partitionKey: String(year)
    });
}
