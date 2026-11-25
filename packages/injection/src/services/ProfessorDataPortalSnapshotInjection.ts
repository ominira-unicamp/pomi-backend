import {
    beginSnapshotPersistence,
    failSnapshotPersistence,
    publishSnapshot,
    readSnapshotManifest,
    snapshotComponentPaths
} from "../snapshots.js";
import type { InjectionContext } from "./InjectionTypes.js";
import {
    injectProfessorDataPortal,
    type ProfessorDataPortalInjectionOptions
} from "./ProfessorDataPortalInjection.js";

export async function injectProfessorDataPortalSnapshot(
    context: InjectionContext,
    options: ProfessorDataPortalInjectionOptions = {}
) {
    const manifest = await readSnapshotManifest(context.inputPath, {
        protocol: "pomi.professors-data-portal.snapshot",
        version: 1,
        requiredComponents: ["profiles"]
    });
    const collectionKey = manifest.partition.collectionKey;
    if (typeof collectionKey !== "string" || !collectionKey)
        throw new Error("Partição de docentes inválida");
    const componentPaths = await snapshotComponentPaths(
        context.inputPath,
        manifest
    );
    const profilesPath = componentPaths.get("profiles");
    if (!profilesPath) throw new Error("Componente profiles ausente");
    await beginSnapshotPersistence(context, manifest, {
        workflow: "professors-data-portal",
        partitionKey: collectionKey
    });
    try {
        await injectProfessorDataPortal(
            { ...context, inputPath: profilesPath },
            options
        );
    } catch (error) {
        await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    await publishSnapshot(context, manifest, {
        workflow: "professors-data-portal",
        partitionKey: collectionKey
    });
}
