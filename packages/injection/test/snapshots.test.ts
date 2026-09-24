import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    readSnapshotManifest,
    snapshotComponentPaths
} from "../src/snapshots.js";

test("valida manifesto e hash antes da persistência", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-snapshot-"));
    const component = Buffer.from('{"data":true}\n');
    try {
        await writeFile(join(directory, "events.json"), component);
        await writeFile(
            join(directory, "manifest.json"),
            JSON.stringify({
                protocol: "pomi.calendar.snapshot",
                version: 1,
                snapshotId: "calendar-2026-1",
                partition: { year: 2026 },
                status: "COMPLETE",
                components: {
                    events: {
                        status: "COMPLETE",
                        path: "events.json",
                        sha256: createHash("sha256")
                            .update(component)
                            .digest("hex"),
                        schemaVersion: 1,
                        records: 1
                    }
                },
                issues: []
            })
        );
        const manifest = await readSnapshotManifest(directory, {
            protocol: "pomi.calendar.snapshot",
            version: 1,
            requiredComponents: ["events"]
        });
        assert.equal(
            (await snapshotComponentPaths(directory, manifest)).get("events"),
            join(directory, "events.json")
        );

        await writeFile(join(directory, "events.json"), "alterado\n");
        await assert.rejects(
            snapshotComponentPaths(directory, manifest),
            /Hash inválido/
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("rejeita componente obrigatório ausente e snapshot parcial", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-snapshot-invalid-"));
    try {
        await writeFile(
            join(directory, "manifest.json"),
            JSON.stringify({
                protocol: "pomi.calendar.snapshot",
                version: 1,
                snapshotId: "calendar-2026-2",
                partition: { year: 2026 },
                status: "PARTIAL",
                components: {},
                issues: []
            })
        );
        await assert.rejects(
            readSnapshotManifest(directory, {
                protocol: "pomi.calendar.snapshot",
                version: 1,
                requiredComponents: ["events"]
            }),
            /Protocolo de snapshot incompatível/
        );
        await writeFile(
            join(directory, "manifest.json"),
            JSON.stringify({
                protocol: "pomi.calendar.snapshot",
                version: 1,
                snapshotId: "calendar-2026-2",
                partition: { year: 2026 },
                status: "COMPLETE",
                components: {},
                issues: []
            })
        );
        await assert.rejects(
            readSnapshotManifest(directory, {
                protocol: "pomi.calendar.snapshot",
                version: 1,
                requiredComponents: ["events"]
            }),
            /Componente obrigatório incompleto/
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("aceita versões explicitamente compatíveis do protocolo", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-snapshot-v2-"));
    try {
        await writeFile(
            join(directory, "manifest.json"),
            JSON.stringify({
                protocol: "pomi.catalog-disciplines.snapshot",
                version: 2,
                snapshotId: "catalog-2020-v2",
                partition: { year: 2020 },
                status: "COMPLETE",
                components: {
                    catalog: {
                        status: "COMPLETE",
                        path: "catalog.json",
                        sha256: "hash",
                        schemaVersion: 2,
                        records: 1
                    }
                }
            })
        );
        const manifest = await readSnapshotManifest(directory, {
            protocol: "pomi.catalog-disciplines.snapshot",
            version: [1, 2],
            requiredComponents: ["catalog"]
        });
        assert.equal(manifest.version, 2);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
