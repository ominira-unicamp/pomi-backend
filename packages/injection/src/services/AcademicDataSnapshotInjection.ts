import { readFile } from "node:fs/promises";
import {
    beginSnapshotPersistence,
    failSnapshotPersistence,
    publishSnapshot,
    readSnapshotManifest,
    snapshotComponentPaths
} from "../snapshots.js";
import {
    injectAcademicData,
    validateAcademicCredits,
    type AcademicDataInjectionOptions
} from "./AcademicDataInjection.js";
import type { InjectionContext } from "./InjectionTypes.js";
import { unwrapScrapeData } from "./scrape-input.js";

export async function injectAcademicDataSnapshot(
    context: InjectionContext,
    options: AcademicDataInjectionOptions = {}
) {
    const manifest = await readSnapshotManifest(context.inputPath, {
        protocol: "pomi.academic-data.snapshot",
        version: 2,
        requiredComponents: ["academicData"]
    });
    if (manifest.components.academicData?.schemaVersion !== 2)
        throw new Error("Versão do componente acadêmico incompatível");
    const { year, semester, instituteCode } = manifest.partition;
    if (
        !Number.isInteger(year) ||
        (semester !== 1 && semester !== 2) ||
        typeof instituteCode !== "string"
    )
        throw new Error("Partição acadêmica inválida");
    const componentPaths = await snapshotComponentPaths(
        context.inputPath,
        manifest
    );
    const dataPath = componentPaths.get("academicData");
    if (!dataPath) throw new Error("Componente academicData ausente");
    const periods = validateAcademicCredits(
        unwrapScrapeData(JSON.parse(await readFile(dataPath, "utf8")))
    );
    if (
        periods.length !== 1 ||
        periods[0].year !== year ||
        periods[0].semester !== semester ||
        periods[0].institutes.length !== 1 ||
        periods[0].institutes[0].code !== instituteCode
    )
        throw new Error("Conteúdo não corresponde à partição acadêmica");
    const partitionKey = `${year}-${semester}-${instituteCode}`;
    await beginSnapshotPersistence(context, manifest, {
        workflow: "academic-data",
        partitionKey
    });
    try {
        await injectAcademicData({ ...context, inputPath: dataPath }, options);
    } catch (error) {
        await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    await publishSnapshot(context, manifest, {
        workflow: "academic-data",
        partitionKey
    });
}
