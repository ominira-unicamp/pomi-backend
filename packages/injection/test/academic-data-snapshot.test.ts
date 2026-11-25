import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { injectAcademicDataSnapshot } from "../src/services/AcademicDataSnapshotInjection.js";

test("snapshot rejeita versão antiga e créditos ausentes antes da persistência", async () => {
    const directory = await mkdtemp(join(tmpdir(), "academic-snapshot-"));
    try {
        for (const version of [1, 2]) {
            const data = JSON.stringify({
                year: 2027,
                semester: 1,
                institutes: [
                    {
                        code: "FE",
                        courses: [{ code: "EX092", name: "Nome", classes: [] }]
                    }
                ]
            });
            await writeFile(join(directory, "academicData.json"), data);
            await writeFile(
                join(directory, "manifest.json"),
                JSON.stringify({
                    protocol: "pomi.academic-data.snapshot",
                    version,
                    snapshotId: "snapshot",
                    partition: { year: 2027, semester: 1, instituteCode: "FE" },
                    status: "COMPLETE",
                    components: {
                        academicData: {
                            status: "COMPLETE",
                            schemaVersion: version,
                            path: "academicData.json",
                            sha256: createHash("sha256")
                                .update(data)
                                .digest("hex"),
                            records: 1
                        }
                    }
                })
            );
            const context = {
                inputPath: directory,
                prisma: new Proxy(
                    {},
                    {
                        get() {
                            throw new Error("Persistência prematura");
                        }
                    }
                )
            } as unknown as Parameters<typeof injectAcademicDataSnapshot>[0];
            await assert.rejects(
                injectAcademicDataSnapshot(context),
                version === 1 ? /Protocolo/ : /Créditos ausentes/
            );
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
