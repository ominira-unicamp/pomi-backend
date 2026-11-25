import {
    beginSnapshotPersistence,
    failSnapshotPersistence,
    publishSnapshot,
    readSnapshotManifest,
    snapshotComponentPaths
} from "../snapshots.js";
import {
    injectCalendar,
    type CalendarInjectionOptions
} from "./CalendarInjection.js";
import type { InjectionContext } from "./InjectionTypes.js";

export async function injectCalendarSnapshot(
    context: InjectionContext,
    options: CalendarInjectionOptions = {}
) {
    const manifest = await readSnapshotManifest(context.inputPath, {
        protocol: "pomi.calendar.snapshot",
        version: 1,
        requiredComponents: ["events"]
    });
    const year = manifest.partition.year;
    if (!Number.isInteger(year))
        throw new Error("Partição de calendário inválida");
    const componentPaths = await snapshotComponentPaths(
        context.inputPath,
        manifest
    );
    const eventsPath = componentPaths.get("events");
    if (!eventsPath) throw new Error("Componente events ausente");
    await beginSnapshotPersistence(context, manifest, {
        workflow: "calendar",
        partitionKey: String(year)
    });
    try {
        await injectCalendar({ ...context, inputPath: eventsPath }, options);
    } catch (error) {
        await failSnapshotPersistence(context, manifest.snapshotId);
        throw error;
    }
    await publishSnapshot(context, manifest, {
        workflow: "calendar",
        partitionKey: String(year)
    });
}
