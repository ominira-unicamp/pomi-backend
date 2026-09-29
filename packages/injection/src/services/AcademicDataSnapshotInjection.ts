import {
    beginSnapshotPersistence,
    failSnapshotPersistence,
    publishSnapshot,
    readSnapshotManifest,
    snapshotComponentPaths
} from "../snapshots.js";
import {
    injectAcademicData,
    type AcademicDataInjectionOptions
} from "./AcademicDataInjection.js";
import type { InjectionContext } from "./InjectionTypes.js";

export async function injectAcademicDataSnapshot(
    context: InjectionContext,
    options: AcademicDataInjectionOptions = {}
) {
    const manifest = await readSnapshotManifest(context.inputPath, {
        protocol: "pomi.academic-data.snapshot",
        version: 1,
        requiredComponents: ["academicData"]
    });
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
