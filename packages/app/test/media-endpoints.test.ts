import {
    createImageActions,
    createImageContracts,
    type ImageEndpointsDefinition
} from "#/media/http.js";
import { ImageStorageError } from "#/media/ImageStorage.js";
import { MediaUploadRateLimitError } from "#/media/MediaUploadLimiter.js";
import type { ImageResourceOperations } from "#/media/public.js";

import type { GroupAvatarTarget } from "#/modules/group/avatar/GroupAvatar.js";

import type { Principal } from "#/Principal.js";
import {
    BadRequestError,
    ForbiddenError,
    PayloadTooLargeError,
    ServiceUnavailableError,
    UnprocessableEntityError
} from "@pomi/api-core";
import type { Request } from "express";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

process.env.DISABLED_AUTH = "true";
const { groupAvatarEndpoints } =
    await import("#/modules/group/avatar/GroupAvatar.endpoints.js");
const { studentAvatarEndpoints } =
    await import("#/modules/student/avatar/StudentAvatar.endpoints.js");

type Context = {
    principal: Principal | undefined;
    images: ImageResourceOperations<GroupAvatarTarget>;
};
const actions = createImageActions(groupAvatarEndpoints, {
    operations: (context: Context) => context.images,
    actor: (context: Context) => context.principal
});
const actor: Principal = {
    authUserId: 1,
    issuer: "test",
    subject: "test",
    email: null,
    roles: new Set(),
    capabilities: new Set(),
    studentId: 42
};
const input = { path: { sid: 42, id: 7 } };
const transport = {
    request: Object.assign(Readable.from(["image"]), {
        headers: { "content-type": "multipart/form-data; boundary=test" }
    }) as Request,
    signal: new AbortController().signal
};

test("image definitions preserve operation keys, validated paths and resource targets", () => {
    type Input = Parameters<typeof actions.putGroupAvatar>[1];
    type Definition = ImageEndpointsDefinition<
        GroupAvatarTarget,
        typeof groupAvatarEndpoints.pathSchema
    >;
    const checks: {
        keys: keyof typeof actions extends
            | "putGroupAvatar"
            | "deleteGroupAvatar"
            ? true
            : false;
        missingParameter: { path: { sid: number } } extends Input
            ? true
            : false;
        unknownParameter: "missing" extends keyof Input["path"] ? true : false;
        wrongTarget: (() => {
            studentId: string;
            groupId: number;
        }) extends Definition["target"]
            ? true
            : false;
    } = {
        keys: true,
        missingParameter: false,
        unknownParameter: false,
        wrongTarget: false
    };
    assert.deepEqual(checks, {
        keys: true,
        missingParameter: false,
        unknownParameter: false,
        wrongTarget: false
    });
    assert.deepEqual(groupAvatarEndpoints.target(input), {
        studentId: 42,
        groupId: 7
    });
    assert.deepEqual(studentAvatarEndpoints.target({ path: { sid: 42 } }), {
        studentId: 42
    });
    assert.equal(
        groupAvatarEndpoints.pathSchema.safeParse({ sid: -1, id: 7 }).success,
        false
    );
});

test("image contract builders preserve HTTP and SDK metadata for both domains", () => {
    for (const definition of [groupAvatarEndpoints, studentAvatarEndpoints]) {
        const contracts = createImageContracts(definition);
        const replace = contracts[definition.operations.replace];
        const remove = contracts[definition.operations.remove];
        assert.deepEqual(
            Object.keys(contracts),
            Object.values(definition.operations)
        );
        assert.deepEqual(replace.meta.path, definition.path);
        assert.equal(replace.meta.authorization, definition.authorization);
        assert.equal(remove.meta.authorization, definition.authorization);
        assert.equal(replace.meta.method, "post");
        assert.equal(remove.meta.method, "delete");
        assert.equal(
            replace.meta.transport.requestBody.mediaType,
            "multipart/form-data"
        );
        assert.equal(replace.meta.sdk.method, definition.operations.replace);
        assert.equal(remove.meta.sdk.method, definition.operations.remove);
        assert.deepEqual(
            replace.meta.sdk.pathParameters,
            definition.sdk.pathParameters
        );
        assert.deepEqual(
            replace.response.options.map((option) => option.shape.status.value),
            [200, 400, 401, 403, 404, 409, 413, 422, 429, 503]
        );
        assert.deepEqual(
            remove.response.options.map((option) => option.shape.status.value),
            [204, 401, 403, 404, 409]
        );
    }
});

test("image actions forward actor, domain target and the original upload transport", async () => {
    const result = {
        mediaId: "80c77b80-acd5-4210-81fe-0d688fe42cee",
        revision: 2
    };
    const calls: unknown[] = [];
    const context: Context = {
        principal: actor,
        images: {
            replace: async (value) => {
                calls.push(value);
                return result;
            },
            remove: async (value) => {
                calls.push(value);
                return { revision: 3 };
            }
        }
    };
    const uploaded = await actions.putGroupAvatar(context, input, transport);
    assert.equal(uploaded.status, 200);
    assert.deepEqual(uploaded.body, result);
    const removed = await actions.deleteGroupAvatar(context, input);
    assert.equal(removed.status, 204);
    assert.deepEqual(calls, [
        {
            actor,
            target: { studentId: 42, groupId: 7 },
            upload: {
                stream: transport.request,
                contentType: transport.request.headers["content-type"],
                signal: transport.signal
            }
        },
        { actor, target: { studentId: 42, groupId: 7 } }
    ]);
});

test("image actions preserve upload error translation, retry headers and domain failures", async () => {
    let failure: Error = new ForbiddenError("denied");
    const context: Context = {
        principal: undefined,
        images: {
            replace: async () => {
                throw failure;
            },
            remove: async () => {
                throw failure;
            }
        }
    };
    await assert.rejects(
        actions.putGroupAvatar(context, input, transport),
        (error) => error === failure
    );
    await assert.rejects(
        actions.deleteGroupAvatar(context, input),
        (error) => error === failure
    );
    for (const [kind, expected] of [
        ["invalid-request", BadRequestError],
        ["payload-too-large", PayloadTooLargeError],
        ["invalid-media", UnprocessableEntityError],
        ["upstream", ServiceUnavailableError]
    ] as const) {
        failure = new ImageStorageError(kind);
        await assert.rejects(
            actions.putGroupAvatar(context, input, transport),
            expected
        );
    }
    failure = new MediaUploadRateLimitError(30);
    const limited = await actions.putGroupAvatar(context, input, transport);
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.effects, [
        { type: "set-header", name: "Retry-After", value: "30" }
    ]);
});
