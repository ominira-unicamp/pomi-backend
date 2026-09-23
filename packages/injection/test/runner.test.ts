import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { InjectionConfig } from "../src/config.js";
import { databasePoolMax, runInjection } from "../src/runner.js";

test("dimensiona o pool pelo paralelismo da injection", () => {
    assert.equal(databasePoolMax({ databaseConcurrency: 4 }), 4);
    assert.equal(databasePoolMax({ databaseConcurrency: 0 }), 1);
    assert.equal(databasePoolMax({}), 1);
});

test("obtains input before running the configured injection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-injection-"));
    const config: InjectionConfig = {
        version: 1,
        rootDirectory: directory,
        configDirectory: directory,
        injections: [],
        workflows: []
    };
    const definition = {
        name: "example",
        input: { directory: "data", fileName: "input.json" },
        obtain: {
            command: process.execPath,
            args: [
                "-e",
                "require('node:fs').writeFileSync(process.env.POMI_PROVIDER_OUTPUT, '{\"ok\":true}')"
            ],
            cwd: ".",
            env: {},
            timeoutMs: 10_000
        },
        options: {},
        allowIssues: false
    };

    try {
        let injectedPath = "";
        const result = await runInjection(
            config,
            definition,
            undefined,
            () => ({
                async run({ inputPath }) {
                    injectedPath = inputPath;
                    assert.equal(
                        await readFile(inputPath, "utf8"),
                        '{"ok":true}'
                    );
                }
            })
        );
        assert.equal(await readFile(result.inputPath, "utf8"), '{"ok":true}');
        assert.equal(injectedPath, result.inputPath);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("promove snapshot genérico validado para diretório imutável", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-calendar-snapshot-"));
    const config: InjectionConfig = {
        version: 1,
        rootDirectory: directory,
        configDirectory: directory,
        injections: [],
        workflows: []
    };
    const definition = {
        name: "calendar-snapshot",
        input: { directory: "data/snapshots/calendar", fileName: "snapshot" },
        snapshot: { provider: "calendar", partition: "current-year" as const },
        obtain: {
            command: process.execPath,
            args: [
                "-e",
                "const fs=require('node:fs'),p=process.env.POMI_PROVIDER_OUTPUT,c=Buffer.from('{\\\"data\\\":[]}\\n'),h=require('node:crypto').createHash('sha256').update(c).digest('hex');fs.mkdirSync(p,{recursive:true});fs.writeFileSync(p+'/events.json',c);fs.writeFileSync(p+'/manifest.json',JSON.stringify({protocol:'pomi.calendar.snapshot',version:1,snapshotId:process.env.POMI_SNAPSHOT_ID,partition:{year:new Date().getFullYear()},status:'COMPLETE',components:{events:{status:'COMPLETE',path:'events.json',sha256:h,schemaVersion:1,records:0}},issues:[]}))"
            ],
            cwd: ".",
            env: {},
            timeoutMs: 10_000
        },
        options: {},
        allowIssues: false
    };
    try {
        const result = await runInjection(
            config,
            definition,
            undefined,
            () => ({ async run() {} }),
            "obtain"
        );
        assert.match(result.inputPath, /data\/snapshots\/calendar\/\d{4}\//);
        assert.equal(
            JSON.parse(
                await readFile(join(result.inputPath, "manifest.json"), "utf8")
            ).snapshotId,
            result.inputPath.split("/").at(-1)
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("lê issues.json quando a entrada da injection é um diretório", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-injection-snapshot-"));
    const snapshotDirectory = join(
        directory,
        "data",
        "snapshots",
        "catalog-programs",
        "2026",
        "snapshot-1"
    );
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
        originalDatabaseUrl ?? "postgresql://user:password@localhost:5432/pomi";
    try {
        await mkdir(snapshotDirectory, { recursive: true });
        await writeFile(
            join(snapshotDirectory, "manifest.json"),
            JSON.stringify({
                protocol: "pomi.catalog-programs.snapshot",
                version: 1,
                snapshotId: "snapshot-1",
                partition: { year: 2026 },
                profile: "complete",
                status: "COMPLETE",
                components: {},
                issues: []
            })
        );
        await writeFile(
            join(snapshotDirectory, "issues.json"),
            JSON.stringify({ issues: [{ code: "example" }] })
        );

        const config: InjectionConfig = {
            version: 1,
            rootDirectory: directory,
            configDirectory: directory,
            injections: [],
            workflows: []
        };
        const definition = {
            name: "catalog-programs-snapshot",
            input: {
                directory: "data/snapshots/catalog-programs",
                fileName: "snapshot"
            },
            obtain: {
                command: process.execPath,
                args: [],
                cwd: ".",
                env: {},
                timeoutMs: 10_000
            },
            options: {},
            allowIssues: true
        };
        await runInjection(
            config,
            definition,
            undefined,
            () => ({
                async run() {}
            }),
            "inject",
            {
                workflowName: "catalog-programs",
                workflowStage: "catalog-programs-snapshot",
                workflowYear: 2026,
                workflowProfile: "complete",
                workflowAttempt: 1,
                snapshotId: "snapshot-1"
            }
        );

        const report = JSON.parse(
            await readFile(`${snapshotDirectory}.issues.json`, "utf8")
        ) as { issues: unknown[] };
        assert.deepEqual(report.issues, [{ code: "example" }]);
    } finally {
        if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = originalDatabaseUrl;
        await rm(directory, { recursive: true, force: true });
    }
});
