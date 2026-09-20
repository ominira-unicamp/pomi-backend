import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import type { Request, Response } from "express";
import type { Logger } from "pino";

import { createHttpTelemetryMiddleware } from "../src/telemetry/logger.js";

test("logs HTTP completion with a request identifier and route template", () => {
    const records: unknown[] = [];
    const logger = {
        child(context: unknown) {
            records.push(context);
            return logger;
        },
        info(attributes: unknown) {
            records.push(attributes);
        },
        warn(attributes: unknown) {
            records.push(attributes);
        },
        error(attributes: unknown) {
            records.push(attributes);
        }
    } as unknown as Logger;
    const response = new EventEmitter() as EventEmitter & {
        locals: Record<string, unknown>;
        statusCode: number;
        setHeader(name: string, value: string): void;
        getHeader(name: string): number | undefined;
    };
    response.locals = {};
    response.statusCode = 200;
    response.setHeader = (name, value) => {
        response.locals[name] = value;
    };
    response.getHeader = () => 42;

    createHttpTelemetryMiddleware(logger)(
        {
            header: () => "request-123",
            method: "GET",
            route: { path: "/courses/:id" }
        } as unknown as Request,
        response as unknown as Response,
        () => undefined
    );
    response.emit("finish");

    assert.equal(response.locals["x-request-id"], "request-123");
    assert.deepEqual(records[0], { requestId: "request-123" });
    assert.deepEqual(records[1], {
        event: "http.request.completed",
        method: "GET",
        route: "/courses/:id",
        statusCode: 200,
        durationMs: (records[1] as { durationMs: number }).durationMs,
        responseContentLength: 42
    });
});

test("does not log successful health probes", () => {
    const records: unknown[] = [];
    const logger = {
        child() {
            return logger;
        },
        info(attributes: unknown) {
            records.push(attributes);
        },
        warn() {},
        error() {}
    } as unknown as Logger;
    const response = new EventEmitter() as EventEmitter & {
        locals: Record<string, unknown>;
        statusCode: number;
        setHeader(): void;
        getHeader(): undefined;
    };
    response.locals = {};
    response.statusCode = 200;
    response.setHeader = () => undefined;
    response.getHeader = () => undefined;

    createHttpTelemetryMiddleware(logger)(
        {
            header: () => undefined,
            method: "GET",
            route: { path: "/ready" }
        } as unknown as Request,
        response as unknown as Response,
        () => undefined
    );
    response.emit("finish");

    assert.equal(records.length, 0);
});

test("keeps failed health probes visible", () => {
    const records: unknown[] = [];
    const logger = {
        child() {
            return logger;
        },
        info() {},
        warn() {},
        error(attributes: unknown) {
            records.push(attributes);
        }
    } as unknown as Logger;
    const response = new EventEmitter() as EventEmitter & {
        locals: Record<string, unknown>;
        statusCode: number;
        setHeader(): void;
        getHeader(): undefined;
    };
    response.locals = {};
    response.statusCode = 503;
    response.setHeader = () => undefined;
    response.getHeader = () => undefined;

    createHttpTelemetryMiddleware(logger)(
        {
            header: () => undefined,
            method: "GET",
            route: { path: "/ready" }
        } as unknown as Request,
        response as unknown as Response,
        () => undefined
    );
    response.emit("finish");

    assert.equal(records.length, 1);
});
