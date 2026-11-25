import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
    resolveOpenApiOutput,
    writeOpenApiDocument
} from "../scripts/openApiExport.js";

test("resolveOpenApiOutput preserves the default workspace artifact", () => {
    const scriptUrl = pathToFileURL(
        "/workspace/pomi-backend/packages/data/scripts/exportOpenApi.ts"
    ).href;

    assert.equal(
        resolveOpenApiOutput([], scriptUrl, "/ignored"),
        "/workspace/openapi.json"
    );
});

test("resolveOpenApiOutput resolves an explicit path from the current directory", () => {
    const scriptUrl = pathToFileURL(
        "/workspace/pomi-backend/packages/data/scripts/exportOpenApi.ts"
    ).href;

    assert.equal(
        resolveOpenApiOutput(
            ["--output", "artifacts/data.json"],
            scriptUrl,
            "/workspace/pomi-docs"
        ),
        "/workspace/pomi-docs/artifacts/data.json"
    );
});

test("writeOpenApiDocument creates parent directories and valid JSON", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-openapi-export-"));
    const output = join(directory, "nested", "data.json");

    await writeOpenApiDocument(output, { openapi: "3.0.0" });

    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), {
        openapi: "3.0.0"
    });
    assert.equal((await stat(output)).isFile(), true);
});

test("writeOpenApiDocument reports a destination that cannot be replaced", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pomi-openapi-export-"));

    await assert.rejects(writeOpenApiDocument(directory, { openapi: "3.0.0" }));
});
