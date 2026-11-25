import type { PrismaClient } from "@pomi/db";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    applyAcademicCredits,
    previewAcademicCredits
} from "../src/services/AcademicCreditsRepair.js";

async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), "credits-repair-"));
    const component = JSON.stringify({
        issues: [],
        pages: [],
        data: {
            year: 2027,
            semester: 1,
            institutes: [
                {
                    code: "FE",
                    name: "FE",
                    courses: [
                        { code: "EX092", name: "Nome", credits: 2, classes: [] }
                    ]
                }
            ]
        }
    });
    await writeFile(join(directory, "academicData.json"), component);
    await writeFile(
        join(directory, "manifest.json"),
        JSON.stringify({
            protocol: "pomi.academic-data.snapshot",
            version: 2,
            snapshotId: "new-snapshot",
            partition: { year: 2027, semester: 1, instituteCode: "FE" },
            status: "COMPLETE",
            components: {
                academicData: {
                    status: "COMPLETE",
                    schemaVersion: 2,
                    path: "academicData.json",
                    sha256: createHash("sha256")
                        .update(component)
                        .digest("hex"),
                    records: 1
                }
            }
        })
    );
    let course = {
        id: 1,
        code: "EX092",
        name: "Nome",
        credits: 4,
        unitId: 10,
        unit: { code: "FE" },
        classes: [{ id: 1 }]
    };
    type Audit = {
        id: bigint;
        operation: string;
        injectionName: string;
        before: unknown;
        after: unknown;
        auditContext: Record<string, unknown>;
    };
    let events: Audit[] = [
        {
            id: 1n,
            operation: "CREATE",
            injectionName: "academic-data-snapshot",
            before: null,
            after: { id: 1, code: "EX092", credits: 4 },
            auditContext: { source: "injection" }
        }
    ];
    let context: Record<string, unknown> = {};
    const tx = {
        course: {
            async findUnique() {
                return { ...course };
            },
            async findMany() {
                return [course];
            },
            async update(args: { data: { credits: number } }) {
                const before = { ...course };
                course = { ...course, ...args.data };
                events.push({
                    id: BigInt(events.length + 1),
                    operation: "UPDATE",
                    injectionName: "academic-credits-repair",
                    before,
                    after: { ...course },
                    auditContext: context
                });
                return course;
            }
        },
        dataAuditEvent: {
            async findMany() {
                return events;
            },
            async findFirst() {
                return events.at(-1);
            }
        },
        async $queryRaw(strings: TemplateStringsArray) {
            if (strings.join("").includes("pg_advisory_xact_lock"))
                throw new Error("Failed to deserialize column of type void");
            return [];
        },
        async $executeRaw(_strings: unknown, value: string) {
            if (value !== undefined) context = JSON.parse(value);
        }
    };
    const db = {
        ...tx,
        async $transaction(fn: (transaction: typeof tx) => Promise<unknown>) {
            const beforeCourse = structuredClone(course);
            const beforeEvents = structuredClone(events);
            try {
                return await fn(tx);
            } catch (error) {
                course = beforeCourse;
                events = beforeEvents;
                throw error;
            }
        }
    } as unknown as PrismaClient;
    return {
        directory,
        db,
        get course() {
            return course;
        },
        get events() {
            return events;
        },
        async preview() {
            const preview = await previewAcademicCredits(db, directory);
            const path = join(directory, "preview.json");
            await writeFile(path, JSON.stringify(preview));
            return path;
        },
        async dispose() {
            await rm(directory, { recursive: true, force: true });
        }
    };
}

test("prévia não altera o banco; aplicação auditada é idempotente", async () => {
    const f = await fixture();
    try {
        const path = await f.preview();
        assert.equal(f.course.credits, 4);
        assert.equal(f.events.length, 1);
        const first = await applyAcademicCredits(f.db, f.directory, path);
        assert.equal(first.updated, 1);
        assert.equal(f.course.credits, 2);
        assert.equal(f.events.at(-1)?.auditContext.snapshotId, "new-snapshot");
        const second = await applyAcademicCredits(f.db, f.directory, path);
        assert.equal(second.updated, 0);
        assert.equal(second.alreadyApplied, 1);
        assert.equal(f.events.length, 2);
        assert.equal(
            (await previewAcademicCredits(f.db, f.directory)).candidates.length,
            0
        );
    } finally {
        await f.dispose();
    }
});

test("rejeita prévia desatualizada sem alterar créditos", async () => {
    const f = await fixture();
    try {
        const path = await f.preview();
        f.course.name = "Alterado concorrentemente";
        await assert.rejects(
            applyAcademicCredits(f.db, f.directory, path),
            /Prévia desatualizada/
        );
        assert.equal(f.course.credits, 4);
        assert.equal(f.events.length, 1);
    } finally {
        await f.dispose();
    }
});

test("preserva divergências sem comprovação de criação pelo importador", async () => {
    const f = await fixture();
    try {
        f.events[0].injectionName = "manual";
        const result = await previewAcademicCredits(f.db, f.directory);
        assert.equal(result.candidates.length, 0);
        assert.equal(result.skipped.length, 1);
        assert.equal(f.course.credits, 4);
    } finally {
        await f.dispose();
    }
});

test("rejeita snapshot antigo, hash adulterado e prévia incompatível", async () => {
    const f = await fixture();
    try {
        const path = await f.preview();
        const preview = JSON.parse(await readFile(path, "utf8"));
        preview.candidates[0].credits = 3;
        await writeFile(path, JSON.stringify(preview));
        await assert.rejects(
            applyAcademicCredits(f.db, f.directory, path),
            /Prévia desatualizada/
        );
        await writeFile(join(f.directory, "academicData.json"), "{}");
        await assert.rejects(
            previewAcademicCredits(f.db, f.directory),
            /Hash inválido/
        );
        const manifest = JSON.parse(
            await readFile(join(f.directory, "manifest.json"), "utf8")
        );
        manifest.version = 1;
        await writeFile(
            join(f.directory, "manifest.json"),
            JSON.stringify(manifest)
        );
        await assert.rejects(
            previewAcademicCredits(f.db, f.directory),
            /Protocolo/
        );
        assert.equal(f.course.credits, 4);
    } finally {
        await f.dispose();
    }
});
