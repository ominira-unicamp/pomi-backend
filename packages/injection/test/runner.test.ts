import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
        injections: []
    };
    const definition = {
        name: "example",
        input: { directory: "data", fileName: "input.json" },
        obtain: {
            command: process.execPath,
            args: [
                "-e",
                "require('node:fs').writeFileSync(process.env.POMI_INJECTION_OUTPUT, '{\"ok\":true}')"
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
