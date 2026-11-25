import {
    beginSnapshotPersistence,
    failSnapshotPersistence,
    publishSnapshot,
    readSnapshotManifest,
    snapshotComponentPaths
} from "../snapshots.js";
import {
    injectExchangeNotices,
    type ExchangeNoticesInjectionOptions
} from "./ExchangeNoticesInjection.js";
import type { InjectionContext } from "./InjectionTypes.js";

export async function injectExchangeNoticesSnapshot(
    context: InjectionContext,
    options: ExchangeNoticesInjectionOptions = {}
) {
    const manifest = await readSnapshotManifest(context.inputPath, {
        protocol: "pomi.exchange-notices.snapshot",
        version: 1,
        requiredComponents: ["notices"]
    });
    const collectionKey = manifest.partition.collectionKey;
    if (typeof collectionKey !== "string" || !collectionKey)
        throw new Error("Partição de editais inválida");
    const componentPaths = await snapshotComponentPaths(
        context.inputPath,
        manifest
    );
    const noticesPath = componentPaths.get("notices");
    if (!noticesPath) throw new Error("Componente notices ausente");
    await beginSnapshotPersistence(context, manifest, {
        workflow: "exchange-notices",
        partitionKey: collectionKey
    });
    try {
        await injectExchangeNotices(
            { ...context, inputPath: noticesPath },
            options
        );
    } catch (error) {
        await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    await publishSnapshot(context, manifest, {
        workflow: "exchange-notices",
        partitionKey: collectionKey
    });
}
