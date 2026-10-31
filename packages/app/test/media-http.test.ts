import { MediaUploadLimiter } from "#/media/MediaUploadLimiter.js";
import { PictRsClient, PictRsError } from "#/media/PictRsClient.js";
import { createPictRsStorage } from "#/media/PictRsStorage.js";
import { errorHandler } from "@pomi/api-core";
import express from "express";
import helmet from "helmet";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { mediaFixture, principal, uploaded } from "./fixtures/media.js";

process.env.DISABLED_AUTH = "true";

const { default: mediaController } =
    await import("#/media/Media.controller.js");
const { default: studentAvatarController } =
    await import("#/modules/planning/student/StudentAvatar.endpoints.js");
const { default: groupAvatarController } =
    await import("#/modules/group/GroupAvatar.endpoints.js");

test("media upload exposes stable validation and upstream failures", async () => {
    let failure: PictRsError = new PictRsError("Falha", "invalid-media");
    let expectedCrop = "square";
    let imageBody: Readable | undefined;
    const application = express();
    application.use(helmet());
    const storage = createPictRsStorage({
        upload: async (
            _input: Readable,
            _contentType: string,
            _signal: AbortSignal,
            crop: string
        ) => {
            assert.equal(crop, expectedCrop);
            throw failure;
        },
        readVariant: async () => imageBody ?? Promise.reject(failure)
    } as unknown as PictRsClient);
    const fixture = mediaFixture(storage);
    const mediaId = "123e4567-e89b-42d3-a456-426614174000";
    fixture.state().student.avatarMediaId = mediaId;
    fixture.state().assets[mediaId] = {
        alias: "valid.webp",
        status: "ACTIVE",
        nextDeleteAt: null
    };
    fixture.state().publicProfileEnabled = true;
    application.use((request, _response, next) => {
        request.scope = {
            cradle: new Proxy(
                {
                    principal: undefined,
                    studentAvatars: {
                        ...fixture.studentAvatars,
                        replace: (
                            input: Parameters<
                                typeof fixture.studentAvatars.replace
                            >[0]
                        ) =>
                            fixture.studentAvatars.replace({
                                ...input,
                                actor: principal
                            })
                    },
                    groupAvatars: {
                        ...fixture.groupAvatars,
                        replace: (
                            input: Parameters<
                                typeof fixture.groupAvatars.replace
                            >[0]
                        ) =>
                            fixture.groupAvatars.replace({
                                ...input,
                                actor: principal
                            })
                    },
                    mediaService: fixture.service
                },
                {
                    get(target, property) {
                        const expected = request.path.startsWith("/media/")
                            ? ["principal", "mediaService"]
                            : request.path.includes("/groups/")
                              ? ["principal", "groupAvatars"]
                              : ["principal", "studentAvatars"];
                        assert.ok(
                            expected.includes(String(property)),
                            `Unexpected dependency: ${String(property)}`
                        );
                        return Reflect.get(target, property);
                    }
                }
            )
        } as never;
        next();
    });
    application.use(
        studentAvatarController.router,
        groupAvatarController.router,
        mediaController.router
    );
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
            const response = await fetch(`${baseUrl}/student/42/avatar`, {
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
                `${baseUrl}/student/42/groups/3/${slot}`,
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
            "/student/42/groups/3/banner",
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
    const fixture = mediaFixture(
        {
            upload: async (input) => {
                forwarded += 1;
                for await (const chunk of input.stream) assert.ok(chunk);
                return uploaded;
            }
        },
        mediaUploadLimiter
    );
    application.use((request, _response, next) => {
        request.scope = {
            cradle: {
                principal,
                studentAvatars: fixture.studentAvatars,
                groupAvatars: fixture.groupAvatars,
                mediaService: fixture.service
            }
        } as never;
        next();
    });
    application.use(
        studentAvatarController.router,
        groupAvatarController.router,
        mediaController.router
    );
    application.use(errorHandler);
    const server = application.listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const url = `http://127.0.0.1:${address.port}/student/42/avatar`;
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

test("avatar contracts belong to their domains and media exposes only shared reads", () => {
    assert.deepEqual(Object.keys(studentAvatarController.contracts), [
        "putStudentAvatar",
        "deleteStudentAvatar"
    ]);
    assert.deepEqual(Object.keys(groupAvatarController.contracts), [
        "putGroupAvatar",
        "deleteGroupAvatar"
    ]);
    assert.deepEqual(Object.keys(mediaController.contracts), [
        "getImageVariant"
    ]);
});

test("application composition routes avatar removals through the owning domain context", async () => {
    const { appControllers } = await import("#/Controllers.js");
    const calls: { actor: unknown; target: unknown }[] = [];
    const application = express();
    application.use((request, _response, next) => {
        const dependency = request.path.includes("/groups/")
            ? "groupAvatars"
            : "studentAvatars";
        request.scope = {
            cradle: new Proxy(
                {},
                {
                    get(_target, property) {
                        if (property === "principal") return principal;
                        assert.equal(property, dependency);
                        return {
                            remove: async (input: {
                                actor: unknown;
                                target: unknown;
                            }) => {
                                calls.push(input);
                                return { revision: 1 };
                            }
                        };
                    }
                }
            )
        } as never;
        next();
    });
    application.use(appControllers.router);
    application.use(errorHandler);
    const server = application.listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        for (const path of [
            "/student/42/avatar",
            "/student/42/groups/7/avatar"
        ]) {
            const response = await fetch(
                `http://127.0.0.1:${address.port}${path}`,
                { method: "DELETE" }
            );
            assert.equal(response.status, 204);
            await response.arrayBuffer();
        }
        assert.deepEqual(calls, [
            { actor: principal, target: { studentId: 42 } },
            { actor: principal, target: { studentId: 42, groupId: 7 } }
        ]);
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        );
    }
});
