import type { Request, Response } from "express";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { connect } from "node:net";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import z from "zod";

import { ResponseSchemaBuilder } from "../src/http/ApiResponse.js";
import { buildEndpointHandler } from "../src/http/RequestHandler.js";
import { pathSeg } from "../src/PathSegment.js";

function request() {
    return Object.assign(new PassThrough(), {
        query: {},
        params: {},
        body: undefined,
        headers: {},
        path: "/image"
    }) as unknown as Request;
}

function response() {
    const stream = new PassThrough();
    const headers = new Map<string, string>();
    return Object.assign(stream, {
        status(value: number) {
            this.statusCode = value;
            return this;
        },
        setHeader(name: string, value: string) {
            headers.set(name.toLowerCase(), value);
            return this;
        },
        hasHeader(name: string) {
            return headers.has(name.toLowerCase());
        },
        getHeader(name: string) {
            return headers.get(name.toLowerCase());
        }
    }) as unknown as Response;
}

test("streams a binary endpoint through the registered handler", async () => {
    const contract = {
        meta: {
            method: "get" as const,
            path: [pathSeg.literal("image")],
            tags: ["image"],
            authorization: { kind: "public" as const },
            operationId: "readImage",
            sdk: false as const,
            transport: { responseBody: "stream" as const }
        },
        request: z.object({}),
        response: new ResponseSchemaBuilder()
            .ok(z.custom<Readable>(), "Image", { mediaType: "image/webp" })
            .build()
    };
    const outgoing = response();
    const chunks: Buffer[] = [];
    outgoing.on("data", (chunk: Buffer) => chunks.push(chunk));
    let signal: AbortSignal | undefined;
    const handler = buildEndpointHandler(
        contract,
        async (_context, _input, transport) => {
            signal = transport.signal;
            return {
                status: 200 as const,
                body: Readable.from([
                    Buffer.from("first"),
                    Buffer.from("second")
                ])
            };
        },
        () => ({})
    );

    await handler(request(), outgoing);

    assert.equal(outgoing.statusCode, 200);
    assert.equal(outgoing.getHeader("Content-Type"), "image/webp");
    assert.equal(Buffer.concat(chunks).toString(), "firstsecond");
    assert.equal(signal?.aborted, false);
});

test("destroys the response when the upstream fails after streaming begins", async () => {
    const contract = {
        meta: {
            method: "get" as const,
            path: [pathSeg.literal("image")],
            tags: ["image"],
            authorization: { kind: "public" as const },
            operationId: "readBrokenImage",
            sdk: false as const,
            transport: { responseBody: "stream" as const }
        },
        request: z.object({}),
        response: new ResponseSchemaBuilder()
            .ok(z.custom<Readable>(), "Image", { mediaType: "image/webp" })
            .build()
    };
    const outgoing = response();
    const chunks: Buffer[] = [];
    outgoing.on("data", (chunk: Buffer) => chunks.push(chunk));
    const handler = buildEndpointHandler(
        contract,
        async () => ({
            status: 200 as const,
            body: Readable.from(
                (async function* () {
                    yield Buffer.from("first");
                    throw new Error("upstream closed");
                })()
            )
        }),
        () => ({})
    );

    await assert.rejects(handler(request(), outgoing), /upstream closed/);
    assert.equal(Buffer.concat(chunks).toString(), "first");
    assert.equal(outgoing.destroyed, true);
});

test("aborts the source when the client closes a streamed response", async () => {
    const contract = {
        meta: {
            method: "get" as const,
            path: [pathSeg.literal("image")],
            tags: ["image"],
            authorization: { kind: "public" as const },
            operationId: "readInterruptedImage",
            sdk: false as const,
            transport: { responseBody: "stream" as const }
        },
        request: z.object({}),
        response: new ResponseSchemaBuilder()
            .ok(z.custom<Readable>(), "Image", { mediaType: "image/webp" })
            .build()
    };
    const outgoing = response();
    const source = new PassThrough();
    let signal: AbortSignal | undefined;
    const handler = buildEndpointHandler(
        contract,
        async (_context, _input, transport) => {
            signal = transport.signal;
            return { status: 200 as const, body: source };
        },
        () => ({})
    );
    const pending = handler(request(), outgoing);
    await new Promise<void>((resolve) => setImmediate(resolve));
    outgoing.destroy();
    await assert.rejects(pending);
    assert.equal(signal?.aborted, true);
    assert.equal(source.destroyed, true);
});

test("returns an error before closing a slow multipart request", async () => {
    const contract = {
        meta: {
            method: "post" as const,
            path: [pathSeg.literal("image")],
            tags: ["image"],
            authorization: { kind: "public" as const },
            operationId: "uploadImage",
            sdk: false as const,
            transport: {
                requestBody: {
                    mediaType: "multipart/form-data" as const,
                    schema: z.object({ "images[]": z.string() })
                }
            }
        },
        request: z.object({}),
        response: new ResponseSchemaBuilder()
            .ok(z.object({}), "Uploaded")
            .build()
    };
    const handler = buildEndpointHandler(
        contract,
        async () => {
            throw new Error("upstream rejected");
        },
        () => ({})
    );
    const server = createServer((incoming, outgoing) => {
        Object.assign(incoming, {
            query: {},
            params: {},
            body: undefined,
            path: "/image"
        });
        void handler(incoming as Request, outgoing as Response).catch(() => {
            outgoing.statusCode = 422;
            outgoing.end("rejected");
        });
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
    );
    const { port } = server.address() as AddressInfo;
    const socket = connect(port, "127.0.0.1");
    try {
        await once(socket, "connect");
        const response = once(socket, "data");
        const closed = once(socket, "close").then(() => true);
        socket.write(
            "POST /image HTTP/1.1\r\n" +
                "Host: localhost\r\n" +
                "Content-Type: multipart/form-data; boundary=example\r\n" +
                "Content-Length: 1000000\r\n\r\nx"
        );
        const [chunk] = await response;
        assert.match(String(chunk), /^HTTP\/1\.1 422 /);
        assert.match(String(chunk), /Connection: close/i);
        assert.equal(
            await Promise.race([closed, delay(1000).then(() => false)]),
            true
        );
    } finally {
        socket.destroy();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
