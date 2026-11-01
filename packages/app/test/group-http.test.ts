import { errorHandler } from "@pomi/api-core";
import express from "express";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DISABLED_AUTH = "true";
const controllers = [
    [
        "groupService",
        "/groups",
        (await import("#/modules/group/Group.controller.js")).default,
        "list"
    ],
    [
        "groupMembershipService",
        "/group-memberships",
        (
            await import("#/modules/group/membership/GroupMembership.controller.js")
        ).default,
        "listPublicMemberships"
    ],
    [
        "groupInvitationService",
        "/student/42/group-invitations",
        (
            await import("#/modules/group/invitation/GroupInvitation.controller.js")
        ).default,
        "listInvitations"
    ],
    [
        "groupRoleService",
        "/student/42/group-roles",
        (await import("#/modules/group/role/GroupRole.controller.js")).default,
        "listRoles"
    ],
    [
        "groupEventService",
        "/group-events",
        (await import("#/modules/group/event/GroupEvent.controller.js"))
            .default,
        "listPublicEvents"
    ]
] as const;

for (const [dependency, path, controller, method] of controllers) {
    test(`${dependency} controller resolves only its local service`, async () => {
        const application = express();
        let called = false;
        application.use((request, _response, next) => {
            request.scope = {
                cradle: new Proxy(
                    {},
                    {
                        get(_target, key) {
                            assert.equal(key, dependency);
                            return {
                                [method]: async () => {
                                    called = true;
                                    return [];
                                }
                            };
                        }
                    }
                )
            } as never;
            next();
        });
        application.use(controller.router);
        application.use(errorHandler);
        const server = application.listen(0, "127.0.0.1");
        try {
            await new Promise<void>((resolve) =>
                server.once("listening", resolve)
            );
            const address = server.address();
            assert.ok(address && typeof address !== "string");
            const response = await fetch(
                `http://127.0.0.1:${address.port}${path}`
            );
            assert.equal(response.status, 200);
            await response.json();
            assert.equal(called, true);
        } finally {
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve()))
            );
        }
    });
}

test("group mutation controllers preserve public failure status, type and detail", async () => {
    const { err } = await import("@pomi/api-core");
    for (const [dependency, path, controller, method] of [
        [
            "groupRoleService",
            "/student/42/group-roles/3",
            controllers[3][2],
            "patchRole"
        ],
        [
            "groupMembershipService",
            "/student/42/managed-group-memberships/3",
            controllers[1][2],
            "patchManagedMembership"
        ]
    ] as const) {
        for (const [kind, status, type] of [
            ["not-found", 404, "resource-not-found"],
            ["forbidden", 403, "forbidden"],
            ["conflict", 409, "conflict"]
        ] as const) {
            const application = express();
            application.use(express.json());
            application.use((request, _response, next) => {
                request.scope = {
                    cradle: {
                        [dependency]: {
                            [method]: async () =>
                                err({ kind, message: "Mensagem preservada." })
                        }
                    }
                } as never;
                next();
            });
            application.use(controller.router);
            application.use(errorHandler);
            const server = application.listen(0, "127.0.0.1");
            try {
                await new Promise<void>((resolve) =>
                    server.once("listening", resolve)
                );
                const address = server.address();
                assert.ok(address && typeof address !== "string");
                const response = await fetch(
                    `http://127.0.0.1:${address.port}${path}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: "{}"
                    }
                );
                assert.equal(response.status, status);
                const problem = await response.json();
                assert.ok(
                    typeof problem === "object" &&
                        problem !== null &&
                        "type" in problem &&
                        "detail" in problem
                );
                assert.equal(problem.type, `urn:pomi:problem:${type}`);
                assert.equal(problem.detail, "Mensagem preservada.");
            } finally {
                await new Promise<void>((resolve, reject) =>
                    server.close((error) => (error ? reject(error) : resolve()))
                );
            }
        }
    }
});
