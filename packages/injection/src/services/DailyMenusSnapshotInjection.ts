import {
    beginSnapshotPersistence,
    failSnapshotPersistence,
    publishSnapshot,
    readSnapshotManifest,
    snapshotComponentPaths
} from "../snapshots.js";
import {
    injectDailyMenus,
    type DailyMenusInjectionOptions
} from "./DailyMenusInjection.js";
import type { InjectionContext } from "./InjectionTypes.js";

export async function injectDailyMenusSnapshot(
    context: InjectionContext,
    options: DailyMenusInjectionOptions = {}
) {
    const manifest = await readSnapshotManifest(context.inputPath, {
        protocol: "pomi.daily-menus.snapshot",
        version: 1,
        requiredComponents: ["menus"]
    });
    const firstDate = manifest.partition.firstDate;
    const lastDate = manifest.partition.lastDate;
    if (typeof firstDate !== "string" || typeof lastDate !== "string")
        throw new Error("Partição de cardápios inválida");
    const componentPaths = await snapshotComponentPaths(
        context.inputPath,
        manifest
    );
    const menusPath = componentPaths.get("menus");
    if (!menusPath) throw new Error("Componente menus ausente");
    const partitionKey = `${firstDate}..${lastDate}`;
    await beginSnapshotPersistence(context, manifest, {
        workflow: "daily-menus",
        partitionKey
    });
    try {
        await injectDailyMenus({ ...context, inputPath: menusPath }, options);
    } catch (error) {
        await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    await publishSnapshot(context, manifest, {
        workflow: "daily-menus",
        partitionKey
    });
}
