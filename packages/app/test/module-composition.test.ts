import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express from "express";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";
const { createModule } = await import("#/Module.js");
const { AuthRegistry, policies } = await import("#/auth.js");

test("module composition preserves route order, OpenAPI definitions and authorization", async () => {
    const empty = createModule({ controllers: [] });
    assert.deepEqual(empty.registry.definitions, []);
    assert.deepEqual(empty.authRegistry.rules, []);
    const firstRouter = express
        .Router()
        .get("/items/special", (_request, response) => response.send("first"));
    const secondRouter = express
        .Router()
        .get("/items/:id", (_request, response) => response.send("second"));
    const registry = new OpenAPIRegistry();
    registry.registerPath({
        method: "get",
        path: "/items/special",
        responses: { 200: { description: "item" } }
    });
    const authRegistry = new AuthRegistry();
    authRegistry.addPolicy("GET", "/items/special", policies.public);
    const controllers = [
        { router: firstRouter, registry, authRegistry },
        { router: secondRouter },
        {}
    ];
    const module = createModule({ controllers });
    const combined = createModule({ controllers: [module] });
    assert.deepEqual(combined.registry.definitions, registry.definitions);
    assert.equal(
        combined.authRegistry.findRule("GET", "/items/special")?.rule.policy,
        policies.public
    );
    assert.equal(module.controllers, controllers);
    const server = express().use(combined.router).listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        assert.equal(
            await (
                await fetch(`http://127.0.0.1:${address.port}/items/special`)
            ).text(),
            "first"
        );
        assert.equal(
            await (
                await fetch(`http://127.0.0.1:${address.port}/items/other`)
            ).text(),
            "second"
        );
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        );
    }
});

test("application composition registers each operation and authorization policy once", async () => {
    const { appControllers } = await import("#/Controllers.js");
    const ids = appControllers.all.flatMap((controller) =>
        Object.values(controller.contracts ?? {}).map(
            (contract) =>
                (contract as { meta: { operationId: string } }).meta.operationId
        )
    );
    assert.equal(new Set(ids).size, ids.length);
    const rules = appControllers.authRegistry.rules.map(
        (rule) => `${rule.method} ${rule.path}`
    );
    assert.equal(new Set(rules).size, rules.length);
});
