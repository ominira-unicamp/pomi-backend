import {
    observeOperation,
    type OperationEvent
} from "#/application/OperationTelemetry.js";
import { err, ok } from "@pomi/api-core";
import type { Request } from "express";
import assert from "node:assert/strict";
import test from "node:test";

test("operation telemetry waits for completion and records only a safe result summary", async () => {
    const events: OperationEvent[] = [];
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
        complete = resolve;
    });
    const result = observeOperation(
        "group.role.patch",
        async () => {
            await pending;
            return ok({ privatePayload: "not logged" });
        },
        (event) => events.push(event)
    );
    assert.equal(events.length, 0);
    complete();
    assert.equal((await result).isOk(), true);
    assert.equal(events[0]?.outcome, "completed");
    assert.equal(events[0]?.operation, "group.role.patch");
    assert.ok(events[0]!.durationMs! >= 0);
    assert.equal(JSON.stringify(events).includes("privatePayload"), false);
});

test("operation telemetry separates local rejection and concurrency without logging technical failures twice", async () => {
    const events: OperationEvent[] = [];
    for (const kind of ["manager-required", "concurrent-change"]) {
        await observeOperation(
            "group.membership.patch",
            async () => err({ kind }),
            (event) => events.push(event)
        );
    }
    assert.deepEqual(
        events.map(({ outcome, failureKind }) => ({ outcome, failureKind })),
        [
            { outcome: "rejected", failureKind: "manager-required" },
            { outcome: "conflict", failureKind: "concurrent-change" }
        ]
    );
    const failure = new Error("unexpected database failure");
    await assert.rejects(
        observeOperation(
            "group.membership.patch",
            async () => {
                throw failure;
            },
            (event) => events.push(event)
        ),
        (error) => error === failure
    );
    assert.equal(events.length, 2);
});

test("request scopes adapt operation events through the existing correlated request logger", async () => {
    process.env.DISABLED_AUTH = "true";
    const [{ createAppContainer, appScopeMiddleware }, { loadAppConfig }] =
        await Promise.all([import("#/Container.js"), import("#/Config.js")]);
    const container = createAppContainer(
        loadAppConfig({
            DATABASE_URL: "postgresql://test.invalid/pomi",
            DISABLED_AUTH: "true"
        }),
        {} as never
    );
    const records: unknown[] = [];
    const request = {} as Request;
    try {
        appScopeMiddleware(container)(
            request,
            {
                locals: {
                    pomiLogger: {
                        info: (event: unknown) => records.push(event),
                        warn: (event: unknown) => records.push(event)
                    }
                }
            } as never,
            () => {}
        );
        request.scope.resolve("operationTelemetry")?.({
            operation: "group.role.patch",
            outcome: "completed",
            durationMs: 1
        });
        assert.deepEqual(records, [
            {
                event: "application.operation.completed",
                operation: "group.role.patch",
                outcome: "completed",
                durationMs: 1
            }
        ]);
        assert.equal(container.resolve("operationTelemetry"), undefined);
    } finally {
        await request.scope?.dispose();
        await container.dispose();
    }
});
