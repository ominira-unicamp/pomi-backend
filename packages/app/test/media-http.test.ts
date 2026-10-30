import { MediaUploadLimiter } from "#/media/MediaUploadLimiter.js";
import { PictRsError } from "#/media/PictRsClient.js";
import { errorHandler } from "@pomi/api-core";
import express from "express";
import helmet from "helmet";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

process.env.DISABLED_AUTH = "true";

const { default: mediaController } =
    await import("#/media/Media.controller.js");

test("media upload exposes stable validation and upstream failures", async () => {
    let failure: PictRsError = new PictRsError("Falha", "invalid-media");
    let expectedCrop = "square";
    let imageBody: Readable | undefined;
    const application = express();
    application.use(helmet());
    application.use((request, _response, next) => {
        request.scope = {
            cradle: {
                principal: { authUserId: 1 },
                mediaService: {
                    prepare: async () => ({
                        target: { kind: "student-avatar", studentId: 7 },
                        mediaId: null,
                        revision: 0
                    }),
                    resolveRead: async () => ({ alias: "valid.webp" })
                },
                pictRsClient: {
                    upload: async (
                        _input: Readable,
                        _contentType: string,
                        _signal: AbortSignal,
                        crop: string
                    ) => {
                        assert.equal(crop, expectedCrop);
                        throw failure;
                    },
                    readVariant: async () =>
                        imageBody ?? Promise.reject(failure)
                },
                mediaUploadLimiter: { acquire: () => () => {} }
            }
        } as never;
        next();
    });
    application.use(mediaController.router);
    application.use(errorHandler);
    const server = application.listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const baseUrl = `http://127.0.0.1:${address.port}`;
        for (const [kind, status] of [
            ["invalid-request", 400],
            ["payload-too-large", 413],
            ["invalid-media", 422],
            ["upstream", 503]
        ] as const) {
            failure = new PictRsError("Falha", kind);
            const response = await fetch(`${baseUrl}/student/7/avatar`, {
                method: "POST",
                headers: {
                    "Content-Type": "multipart/form-data; boundary=example"
                },
                body: "--example--\r\n"
            });
            assert.equal(response.status, status, kind);
            assert.equal(
                response.headers
                    .get("Content-Type")
                    ?.includes("application/problem+json"),
                true
            );
        }
        failure = new PictRsError("Falha", "upstream");
        for (const slot of ["avatar"]) {
            expectedCrop = "square";
            const response = await fetch(
                `${baseUrl}/student/7/groups/3/${slot}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "multipart/form-data; boundary=example"
                    },
                    body: "--example--\r\n"
                }
            );
            assert.equal(response.status, 503);
            await response.arrayBuffer();
        }
        for (const path of [
            "/student/7/groups/3/banner",
            "/media/123e4567-e89b-42d3-a456-426614174000/banner"
        ]) {
            const response = await fetch(`${baseUrl}${path}`, {
                method: path.startsWith("/student") ? "POST" : "GET"
            });
            assert.ok([400, 404].includes(response.status));
            await response.arrayBuffer();
        }
        const imageResponse = await fetch(
            `${baseUrl}/media/123e4567-e89b-42d3-a456-426614174000/avatarSmall`
        );
        assert.equal(imageResponse.status, 503);
        imageBody = Readable.from([Buffer.from("RIFF0000WEBP")]);
        const publicImageResponse = await fetch(
            `${baseUrl}/media/123e4567-e89b-42d3-a456-426614174000/avatarSmall`
        );
        assert.equal(publicImageResponse.status, 200);
        assert.equal(
            publicImageResponse.headers.get("Cross-Origin-Resource-Policy"),
            "cross-origin"
        );
        assert.equal(
            publicImageResponse.headers.get("Cache-Control"),
            "private, no-store"
        );
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        );
    }
});

test("media upload rejects a rate-limited identity before forwarding the body", async () => {
    let forwarded = 0;
    const mediaUploadLimiter = new MediaUploadLimiter(2, 1, 60_000);
    const application = express();
    application.use((request, _response, next) => {
        request.scope = {
            cradle: {
                principal: { authUserId: 1 },
                mediaService: {
                    prepare: async () => ({
                        target: { kind: "student-avatar", studentId: 7 },
                        mediaId: null,
                        revision: 0
                    }),
                    activate: async () => ({
                        mediaId: "123e4567-e89b-42d3-a456-426614174000",
                        revision: 1
                    })
                },
                pictRsClient: {
                    upload: async (input: Readable) => {
                        forwarded += 1;
                        for await (const _chunk of input) {
                            assert.ok(_chunk);
                        }
                        return {
                            alias: "valid.webp",
                            contentType: "image/webp",
                            width: 1,
                            height: 1
                        };
                    }
                },
                mediaUploadLimiter
            }
        } as never;
        next();
    });
    application.use(mediaController.router);
    application.use(errorHandler);
    const server = application.listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const url = `http://127.0.0.1:${address.port}/student/7/avatar`;
        const options = {
            method: "POST",
            headers: {
                "Content-Type": "multipart/form-data; boundary=example"
            },
            body: "--example--\r\n"
        };
        const accepted = await fetch(url, options);
        assert.equal(accepted.status, 200);
        await accepted.arrayBuffer();
        const limited = await fetch(url, options);
        assert.equal(limited.status, 429);
        assert.equal(limited.headers.get("Retry-After"), "60");
        const problem = (await limited.json()) as {
            type: string;
            retryAfterSeconds: number;
        };
        assert.equal(problem.type, "urn:pomi:problem:media-upload-rate-limit");
        assert.equal(problem.retryAfterSeconds, 60);
        assert.equal(forwarded, 1);
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        );
    }
});
