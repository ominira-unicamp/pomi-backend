import assert from "node:assert/strict";
import test from "node:test";
import { createInjectionService } from "../src/registry.js";

const command = {
    command: "node",
    args: [],
    cwd: ".",
    env: {},
    timeoutMs: 1_000
};

test("resolve todas as injections predefinidas", () => {
    for (const name of [
        "academic-data",
        "calendar",
        "catalogs",
        "catalog-disciplines",
        "daily-menus",
        "exchange-notices",
        "suggestions"
    ]) {
        const service = createInjectionService({
            name,
            obtain: command,
            input: { directory: "data", fileName: "input.json" },
            options: {},
            allowIssues: false
        });
        assert.equal(typeof service.run, "function");
    }
});

test("rejeita injection sem implementação predefinida", () => {
    assert.throws(
        () =>
            createInjectionService({
                name: "unknown",
                obtain: command,
                input: { directory: "data", fileName: "input.json" },
                options: {},
                allowIssues: false
            }),
        /Injection predefinida não encontrada/
    );
});
