import assert from "node:assert/strict";
import test from "node:test";

import type { NextFunction, Request, Response } from "express";

import { AuthRegistry, policies } from "#/auth.js";

function response() {
    const result = { status: 200, body: undefined as unknown };
    const value = {
        status(status: number) {
            result.status = status;
            return value;
        },
        json(body: unknown) {
            result.body = body;
            return value;
        }
    } as Response;
    return { value, result };
}

function request(path: string, authorization?: string) {
    return {
        method: "POST",
        path,
        headers: { authorization }
    } as Request;
}

function restoreServiceToken(value: string | undefined) {
    if (value === undefined) delete process.env.POMI_DATA_ADMIN_TOKEN;
    else process.env.POMI_DATA_ADMIN_TOKEN = value;
}

test("allows public routes without a service token", () => {
    const registry = new AuthRegistry();
    registry.addPolicy("POST", "/public", policies.public);
    let called = false;

    registry.middleware()(request("/public"), response().value, (() => {
        called = true;
    }) as NextFunction);

    assert.equal(called, true);
});

test("disables administrative routes when no service token is configured", () => {
    const previous = process.env.POMI_DATA_ADMIN_TOKEN;
    delete process.env.POMI_DATA_ADMIN_TOKEN;
    const target = response();

    new AuthRegistry().middleware()(
        request("/catalogs"),
        target.value,
        (() => undefined) as NextFunction
    );

    assert.equal(target.result.status, 503);
    restoreServiceToken(previous);
});

test("accepts only the configured service token on administrative routes", () => {
    const previous = process.env.POMI_DATA_ADMIN_TOKEN;
    process.env.POMI_DATA_ADMIN_TOKEN = "expected-token";
    const unauthorized = response();
    const authorized = response();
    let called = false;
    const middleware = new AuthRegistry().middleware();

    middleware(
        request("/catalogs", "Bearer other-token"),
        unauthorized.value,
        (() => undefined) as NextFunction
    );
    middleware(
        request("/catalogs", "Bearer expected-token"),
        authorized.value,
        (() => {
            called = true;
        }) as NextFunction
    );

    assert.equal(unauthorized.result.status, 401);
    assert.equal(called, true);
    restoreServiceToken(previous);
});
