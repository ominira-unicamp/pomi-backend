import { createSocialFriendshipService } from "#/modules/social/friendship/SocialFriendship.service.js";
import { errorHandler } from "@pomi/api-core";
import express from "express";
import assert from "node:assert/strict";
import test from "node:test";
import { friendshipFixture } from "./fixtures/friendship.js";

process.env.DISABLED_AUTH = "true";
const { default: controller } =
    await import("#/modules/social/friendship/SocialFriendship.controller.js");

test("friendship acceptance preserves the HTTP success and problem contract", async (t) => {
    let fixture = friendshipFixture();
    const app = express();
    app.use((request, _response, next) => {
        request.scope = {
            cradle: {
                resolveUserContext: async (studentId: number) => studentId,
                socialFriendshipService: createSocialFriendshipService(fixture)
            }
        } as never;
        next();
    });
    app.use(controller.router);
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const request = (studentId = 7) =>
            fetch(
                `http://127.0.0.1:${address.port}/users/${studentId}/friendships/3/accept`,
                { method: "POST" }
            );
        await t.test(
            "success retains the friendship representation",
            async () => {
                fixture = friendshipFixture();
                const response = await request();
                assert.equal(response.status, 200);
                assert.deepEqual(await response.json(), {
                    id: 3,
                    status: "ACCEPTED",
                    direction: "NONE",
                    friend: {
                        publicId: fixture.row.userB.publicId,
                        displayName: "Ada Lovelace",
                        avatarMediaId: null,
                        bio: null,
                        interests: [],
                        currentCourses: [],
                        program: null,
                        specialization: null,
                        entryYear: 2026
                    },
                    createdAt: fixture.row.createdAt.toISOString(),
                    acceptedAt: fixture.instant.toISOString()
                });
            }
        );
        const scenarios: {
            name: string;
            setup(fixture: ReturnType<typeof friendshipFixture>): void;
            studentId?: number;
            status: number;
            type: string;
            detail: string;
        }[] = [
            {
                name: "unknown request",
                setup: (fixture) => {
                    fixture.state.existing = null;
                },
                status: 404,
                type: "resource-not-found",
                detail: "A solicitação não foi encontrada."
            },
            {
                name: "nonparticipant",
                setup: () => {},
                studentId: 9,
                status: 404,
                type: "resource-not-found",
                detail: "A solicitação não foi encontrada."
            },
            {
                name: "requester",
                setup: () => {},
                studentId: 8,
                status: 409,
                type: "unique-constraint-conflict",
                detail: "A solicitação não pode ser aceita por este aluno."
            },
            {
                name: "already accepted",
                setup: (fixture) => {
                    fixture.row.status = "ACCEPTED";
                },
                status: 409,
                type: "unique-constraint-conflict",
                detail: "A solicitação não pode ser aceita por este aluno."
            },
            {
                name: "conditional write lost",
                setup: (fixture) => {
                    fixture.state.changedCount = 0;
                },
                status: 409,
                type: "unique-constraint-conflict",
                detail: "A solicitação já foi alterada e não pode mais ser aceita."
            },
            {
                name: "record disappears after write",
                setup: (fixture) => {
                    fixture.state.finalRow = null;
                },
                status: 404,
                type: "resource-not-found",
                detail: "A solicitação não foi encontrada."
            }
        ];
        for (const scenario of scenarios)
            await t.test(scenario.name, async () => {
                fixture = friendshipFixture();
                scenario.setup(fixture);
                const response = await request(scenario.studentId);
                assert.equal(response.status, scenario.status);
                assert.match(
                    response.headers.get("content-type") ?? "",
                    /application\/problem\+json/
                );
                const body = (await response.json()) as {
                    type: string;
                    detail: string;
                    status: number;
                };
                assert.equal(body.type, `urn:pomi:problem:${scenario.type}`);
                assert.equal(body.detail, scenario.detail);
                assert.equal(body.status, scenario.status);
            });
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        );
    }
});
