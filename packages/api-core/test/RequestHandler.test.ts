import assert from "node:assert/strict";
import test from "node:test";

import type { Request, Response } from "express";
import z from "zod";

import {
    ApiResponse,
    buildEndpointHandler,
    pathSeg,
    ResponseEffects,
    ResponseSchemaBuilder
} from "../src/index.js";

const contract = {
    meta: {
        method: "post" as const,
        path: [pathSeg.literal("items")],
        tags: ["items"],
        authorization: { kind: "public" as const }
    },
    request: z.object({ body: z.object({ name: z.string().min(1) }) }),
    response: new ResponseSchemaBuilder()
        .created(z.object({ name: z.string() }), "Created")
        .build()
};

function responseRecorder() {
    const recorded: { status?: number; body?: unknown; cookies: string[] } = {
        cookies: []
    };
    const response = {
        status(status: number) {
            recorded.status = status;
            return response;
        },
        json(body: unknown) {
            recorded.body = body;
            return response;
        },
        type() {
            return response;
        },
        send() {
            return response;
        },
        cookie(name: string) {
            recorded.cookies.push(name);
            return response;
        },
        clearCookie() {
            return response;
        }
    } as unknown as Response;
    return { response, recorded };
}

test("validates requests and executes a declarative action", async () => {
    const { response, recorded } = responseRecorder();
    const handler = buildEndpointHandler(
        contract,
        async (_context, request) =>
            ApiResponse.created({ name: request.body.name }, [
                ResponseEffects.setCookie("session", "value", {})
            ]),
        () => ({})
    );

    await handler(
        {
            body: { name: "POMI" },
            query: {},
            params: {},
            headers: {}
        } as Request,
        response
    );

    assert.equal(recorded.status, 201);
    assert.deepEqual(recorded.body, { name: "POMI" });
    assert.deepEqual(recorded.cookies, ["session"]);
});

test("serializes invalid requests as Problem Details", async () => {
    const { response, recorded } = responseRecorder();
    const handler = buildEndpointHandler(
        contract,
        async () => ApiResponse.created({ name: "unreachable" }),
        () => ({})
    );

    await handler(
        { body: { name: "" }, query: {}, params: {}, headers: {} } as Request,
        response
    );

    assert.equal(recorded.status, 400);
    assert.deepEqual(recorded.body, {
        type: "urn:pomi:problem:invalid-request",
        title: "Dados da requisição inválidos",
        status: 400,
        detail: "Revise os campos informados e tente novamente.",
        fields: [
            {
                code: "INVALID_VALUE",
                path: ["body", "name"],
                message: "Too small: expected string to have >=1 characters"
            }
        ]
    });
});

test("rejects a filter on an endpoint that does not declare support", async () => {
    const { response, recorded } = responseRecorder();
    let called = false;
    const handler = buildEndpointHandler(
        {
            ...contract,
            meta: {
                ...contract.meta,
                method: "get" as const,
                path: [pathSeg.literal("items")]
            },
            request: z.object({ query: z.object({}) })
        },
        async () => {
            called = true;
            return { status: 201 as const, body: { name: "unreachable" } };
        },
        () => ({})
    );

    await handler(
        {
            body: {},
            query: { filter: { code: "MC202" } },
            params: {},
            headers: {},
            path: "/items"
        } as unknown as Request,
        response
    );

    assert.equal(called, false);
    assert.equal(recorded.status, 400);
    assert.deepEqual(recorded.body, {
        type: "urn:pomi:problem:invalid-request",
        title: "Dados da requisição inválidos",
        status: 400,
        detail: "Revise os campos informados e tente novamente.",
        fields: [
            {
                code: "FILTER_UNSUPPORTED_ENDPOINT",
                path: ["query", "filter"],
                message: "Este endpoint não aceita filtros.",
                details: { feature: "filter" }
            }
        ],
        instance: "/items"
    });
});
