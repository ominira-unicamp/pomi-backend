import { PictRsClient, PictRsError } from "#/media/PictRsClient.js";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";

const validResponse = {
    files: [
        {
            file: "abc123.webp",
            delete_token: "private-token",
            details: {
                width: 400,
                height: 300,
                content_type: "image/webp",
                format: "Image"
            }
        }
    ],
    msg: "ok"
};

test("upload forwards a bounded multipart stream without user credentials", async () => {
    let received = 0;
    const fetchImpl = (async (input: URL, init: RequestInit) => {
        assert.equal(input.origin, "http://pict-rs:8080");
        assert.equal(input.pathname, "/image");
        assert.equal(input.searchParams.has("crop"), false);
        assert.equal(input.searchParams.get("allow_animation"), "false");
        assert.equal(input.searchParams.get("allow_video"), "false");
        assert.equal(input.searchParams.get("max_area"), "4000000");
        assert.equal(input.searchParams.get("max_file_size"), "6");
        assert.equal(init.redirect, "manual");
        assert.equal(init.headers && "Authorization" in init.headers, false);
        for await (const chunk of init.body as Readable) {
            received += Buffer.byteLength(chunk);
        }
        return Response.json(validResponse, { status: 201 });
    }) as typeof fetch;
    const client = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        fetchImpl
    );

    const result = await client.upload(
        Readable.from([Buffer.from("one"), Buffer.from("two")]),
        "multipart/form-data; boundary=example",
        new AbortController().signal
    );

    assert.equal(received, 6);
    assert.deepEqual(result, {
        alias: "abc123.webp",
        width: 400,
        height: 300,
        contentType: "image/webp"
    });
    assert.equal("delete_token" in result, false);
});

test("avatar uploads request a centered square crop before storage", async () => {
    const client = new PictRsClient("http://pict-rs:8080", "admin-key", (async (
        input: URL,
        init: RequestInit
    ) => {
        assert.equal(input.pathname, "/image");
        assert.equal(input.searchParams.get("crop"), "1x1");
        for await (const chunk of init.body as Readable) assert.ok(chunk);
        return Response.json(
            {
                files: [
                    {
                        ...validResponse.files[0],
                        details: {
                            ...validResponse.files[0]!.details,
                            width: 300,
                            height: 300
                        }
                    }
                ]
            },
            { status: 201 }
        );
    }) as typeof fetch);
    const uploaded = await client.upload(
        Readable.from([Buffer.from("image")]),
        "multipart/form-data; boundary=example",
        new AbortController().signal,
        "square"
    );
    assert.equal(uploaded.width, 300);
    assert.equal(uploaded.height, 300);
});

test("upload rejects oversize bodies before the upstream receives more bytes", async () => {
    let received = 0;
    const fetchImpl = (async (_input: URL, init: RequestInit) => {
        for await (const chunk of init.body as Readable) {
            received += Buffer.byteLength(chunk);
        }
        return Response.json(validResponse, { status: 201 });
    }) as typeof fetch;
    const client = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        fetchImpl
    );

    await assert.rejects(
        client.upload(
            Readable.from([
                Buffer.alloc(4 * 1024 * 1024),
                Buffer.alloc(2 * 1024 * 1024)
            ]),
            "multipart/form-data; boundary=example",
            new AbortController().signal
        ),
        (error: unknown) =>
            error instanceof PictRsError && error.kind === "payload-too-large"
    );
    assert.equal(received, 4 * 1024 * 1024);
});

test("upload cancellation closes the client stream and upstream request", async () => {
    const controller = new AbortController();
    const input = new PassThrough();
    input.on("error", () => {});
    let upstreamSignal: AbortSignal | undefined;
    const client = new PictRsClient("http://pict-rs:8080", "admin-key", (async (
        _url: URL,
        init: RequestInit
    ) => {
        upstreamSignal = init.signal ?? undefined;
        await new Promise<never>((_resolve, reject) =>
            init.signal?.addEventListener(
                "abort",
                () => reject(init.signal?.reason),
                {
                    once: true
                }
            )
        );
        throw new Error("unreachable");
    }) as typeof fetch);
    const pending = client.upload(
        input,
        "multipart/form-data; boundary=example",
        controller.signal
    );
    controller.abort();
    await assert.rejects(pending);
    assert.equal(upstreamSignal?.aborted, true);
    assert.equal(input.destroyed, true);
});

test("upload closes the input when the client already canceled", async () => {
    const controller = new AbortController();
    controller.abort();
    const input = new PassThrough();
    input.on("error", () => {});
    const client = new PictRsClient("http://pict-rs:8080", "admin-key", (async (
        _url: URL,
        init: RequestInit
    ) => {
        assert.equal(init.signal?.aborted, true);
        throw new Error("aborted");
    }) as typeof fetch);

    await assert.rejects(
        client.upload(
            input,
            "multipart/form-data; boundary=example",
            controller.signal
        )
    );
    assert.equal(input.destroyed, true);
});

test("upload can respond on the client HTTP connection", async () => {
    let mode: "accept" | "reject" | "oversize" = "accept";
    const client = new PictRsClient("http://pict-rs:8080", "admin-key", (async (
        _url: URL,
        init: RequestInit
    ) => {
        if (mode === "reject") return new Response(null, { status: 422 });
        for await (const _chunk of init.body as Readable) {
            assert.ok(_chunk);
        }
        return Response.json(validResponse, { status: 201 });
    }) as typeof fetch);
    const server = createServer((request, response) => {
        void client
            .upload(
                request,
                request.headers["content-type"] ?? "",
                new AbortController().signal
            )
            .then(() => {
                response.statusCode = 200;
                response.end("uploaded");
            })
            .catch((error: unknown) => {
                response.statusCode =
                    error instanceof PictRsError
                        ? error.kind === "invalid-media"
                            ? 422
                            : error.kind === "payload-too-large"
                              ? 413
                              : 500
                        : 500;
                response.end("rejected");
            });
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
    );
    const { port } = server.address() as AddressInfo;
    try {
        const send = (body: string | Buffer) =>
            fetch(`http://127.0.0.1:${port}/image`, {
                method: "POST",
                headers: {
                    "Content-Type": "multipart/form-data; boundary=example"
                },
                body
            });
        const accepted = await send("multipart-body");
        assert.equal(accepted.status, 200);
        assert.equal(await accepted.text(), "uploaded");

        mode = "reject";
        const rejected = await send("multipart-body");
        assert.equal(rejected.status, 422);
        assert.equal(await rejected.text(), "rejected");

        mode = "oversize";
        const oversized = await send(
            Buffer.alloc(5 * 1024 * 1024 + 64 * 1024 + 1)
        );
        assert.equal(oversized.status, 413);
        assert.equal(await oversized.text(), "rejected");
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});

test("upload rejects malformed and oversized pict-rs responses", async () => {
    const invalid = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        (async () => new Response("not-json", { status: 201 })) as typeof fetch
    );
    await assert.rejects(
        invalid.upload(
            Readable.from(["body"]),
            "multipart/form-data; boundary=example",
            new AbortController().signal
        ),
        PictRsError
    );

    const oversized = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        (async () =>
            new Response("x".repeat(65 * 1024), {
                status: 201
            })) as typeof fetch
    );
    await assert.rejects(
        oversized.upload(
            Readable.from(["body"]),
            "multipart/form-data; boundary=example",
            new AbortController().signal
        ),
        PictRsError
    );
});

test("upload rejects animation, excessive area and multiple files", async () => {
    for (const response of [
        {
            ...validResponse,
            files: [
                {
                    ...validResponse.files[0],
                    details: {
                        ...validResponse.files[0]!.details,
                        frames: 2
                    }
                }
            ]
        },
        {
            ...validResponse,
            files: [
                {
                    ...validResponse.files[0],
                    details: {
                        ...validResponse.files[0]!.details,
                        width: 4000,
                        height: 4000
                    }
                }
            ]
        },
        {
            ...validResponse,
            files: [...validResponse.files, ...validResponse.files]
        }
    ]) {
        const client = new PictRsClient(
            "http://pict-rs:8080",
            "admin-key",
            (async () =>
                Response.json(response, { status: 201 })) as typeof fetch
        );
        await assert.rejects(
            client.upload(
                Readable.from(["body"]),
                "multipart/form-data; boundary=example",
                new AbortController().signal
            ),
            PictRsError
        );
    }
});

test("upload classifies rejected and unsupported media without accepting an alias", async () => {
    for (const [status, kind] of [
        [400, "invalid-media"],
        [413, "payload-too-large"],
        [422, "invalid-media"],
        [503, "upstream"]
    ] as const) {
        const client = new PictRsClient(
            "http://pict-rs:8080",
            "admin-key",
            (async () =>
                Response.json({ msg: "rejected" }, { status })) as typeof fetch
        );
        await assert.rejects(
            client.upload(
                Readable.from(["body"]),
                "multipart/form-data; boundary=example",
                new AbortController().signal
            ),
            (error: unknown) =>
                error instanceof PictRsError && error.kind === kind
        );
    }

    const unsupported = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        (async () =>
            Response.json(
                {
                    files: [
                        {
                            file: "abc123.avif",
                            details: {
                                width: 100,
                                height: 100,
                                content_type: "image/avif",
                                format: "Image"
                            }
                        }
                    ]
                },
                { status: 201 }
            )) as typeof fetch
    );
    await assert.rejects(
        unsupported.upload(
            Readable.from(["body"]),
            "multipart/form-data; boundary=example",
            new AbortController().signal
        ),
        (error: unknown) =>
            error instanceof PictRsError && error.kind === "invalid-media"
    );
});

test("admin operations send only the private service key to fixed pict-rs paths", async () => {
    const calls: { path: string; key: string | null }[] = [];
    const fetchImpl = (async (input: URL, init: RequestInit) => {
        calls.push({
            path: input.pathname,
            key: new Headers(init.headers).get("X-Api-Token")
        });
        if (input.pathname === "/internal/hashes") {
            return Response.json({
                page: {
                    hashes: [
                        {
                            aliases: ["abc123.webp"],
                            details: { created_at: "2025-01-01T00:00:00Z" }
                        }
                    ],
                    next: "next-page"
                }
            });
        }
        return Response.json({ msg: "ok" });
    }) as typeof fetch;
    const client = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        fetchImpl
    );

    assert.deepEqual(
        await client.listAliases(undefined, new AbortController().signal),
        {
            aliases: [
                {
                    alias: "abc123.webp",
                    createdAt: new Date("2025-01-01T00:00:00Z")
                }
            ],
            next: "next-page"
        }
    );
    await client.deleteAlias("abc123.webp", new AbortController().signal);
    assert.deepEqual(calls, [
        { path: "/internal/hashes", key: "admin-key" },
        { path: "/internal/delete", key: "admin-key" }
    ]);
});

test("readiness checks the private pict-rs health endpoint", async () => {
    const paths: string[] = [];
    const client = new PictRsClient("http://pict-rs:8080", "admin-key", (async (
        input: URL
    ) => {
        paths.push(input.pathname);
        return new Response(null, { status: 200 });
    }) as typeof fetch);
    await client.health();
    assert.deepEqual(paths, ["/healthz"]);
    const unhealthy = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        (async () => new Response(null, { status: 500 })) as typeof fetch
    );
    await assert.rejects(unhealthy.health(), PictRsError);
});

test("alias enumeration accepts the final page without a next cursor", async () => {
    const client = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        (async () =>
            Response.json({ page: { hashes: [], next: null } })) as typeof fetch
    );
    assert.deepEqual(
        await client.listAliases(undefined, new AbortController().signal),
        { aliases: [], next: undefined }
    );
});

test("administrative requests discard upstream error bodies", async () => {
    const canceled: string[] = [];
    const client = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        (async (input: URL) =>
            new Response(
                new ReadableStream({
                    cancel() {
                        canceled.push(input.pathname);
                    }
                }),
                { status: 503 }
            )) as typeof fetch
    );

    await assert.rejects(
        client.listAliases(undefined, new AbortController().signal),
        PictRsError
    );
    await assert.rejects(
        client.deleteAlias("abc123.webp", new AbortController().signal),
        PictRsError
    );
    assert.deepEqual(canceled, ["/internal/hashes", "/internal/delete"]);
});

test("variant reads use a closed processing preset and bound the response stream", async () => {
    const paths: string[] = [];
    const fetchImpl = (async (input: URL, init: RequestInit) => {
        paths.push(`${input.pathname}${input.search}`);
        assert.equal(init.redirect, "manual");
        return new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array(5 * 1024 * 1024));
                    controller.enqueue(new Uint8Array(4 * 1024 * 1024));
                    controller.close();
                }
            }),
            { headers: { "Content-Type": "image/webp" } }
        );
    }) as typeof fetch;
    const client = new PictRsClient(
        "http://pict-rs:8080",
        "admin-key",
        fetchImpl
    );
    const stream = await client.readVariant(
        "abc123.webp",
        "avatarSmall",
        new AbortController().signal
    );
    await assert.rejects(async () => {
        for await (const chunk of stream) assert.ok(chunk);
    }, PictRsError);
    assert.deepEqual(paths, [
        "/image/process.webp?alias=abc123.webp&thumbnail=128"
    ]);
    await assert.rejects(
        client.readVariant(
            "../other.webp",
            "avatarSmall",
            new AbortController().signal
        ),
        PictRsError
    );
});
