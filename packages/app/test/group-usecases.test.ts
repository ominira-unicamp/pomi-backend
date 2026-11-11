import { createGroupEventService } from "#/modules/group/event/GroupEvent.service.js";
import {
    invitation,
    managedInvitation
} from "#/modules/group/invitation/GroupInvitation.contract.js";
import { createGroupInvitationService } from "#/modules/group/invitation/GroupInvitation.service.js";
import { publicMembership } from "#/modules/group/membership/GroupMembership.contract.js";
import { createGroupMembershipService } from "#/modules/group/membership/GroupMembership.service.js";
import { createGroupRoleService } from "#/modules/group/role/GroupRole.service.js";
import { ConflictError, ForbiddenError, NotFoundError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";
test("public membership queries exclude hidden, former and archived memberships", async () => {
    let where: unknown;
    const prisma = {
        groupMembership: {
            findMany: async (query: { where: unknown }) => {
                where = query.where;
                return [];
            }
        }
    } as unknown as PrismaClient;

    const result = await createGroupMembershipService({
        prisma
    }).listPublicMemberships(42);
    assert.deepEqual(result, []);
    assert.deepEqual(where, {
        groupId: 42,
        isPublic: true,
        activeKey: "ACTIVE",
        group: { status: "ACTIVE" }
    });
});
test("public memberships expose profile links only for enabled active profiles", async () => {
    let where: unknown;
    const publicId = "a375fdb0-45d9-4a79-8415-89fcb64157b6";
    const member = {
        id: 3,
        groupId: 42,
        joinedAt: new Date("2026-10-01T00:00:00.000Z"),
        positions: [],
        roles: [],
        user: {
            name: "Ana",
            publicId,
            publicProfileEnabled: true,
            publicDisplayName: "Ana do Coletivo",
            avatarMediaId: "8bf172b7-6e70-47e4-ad19-353292f77d34",
            principal: { identities: [{ id: 1 }] },
            id: 9,
            studentId: 9,
            student: { name: "Ana" }
        }
    };
    const prisma = {
        groupMembership: {
            findMany: async (query: { where: unknown }) => {
                where = query.where;
                if ((query.where as { user?: unknown }).user) return [];
                return [
                    member,
                    {
                        ...member,
                        id: 4,
                        user: {
                            ...member.user,
                            publicProfileEnabled: false
                        }
                    },
                    {
                        ...member,
                        id: 5,
                        user: { ...member.user, principal: { identities: [] } }
                    }
                ];
            }
        }
    } as unknown as PrismaClient;

    const service = createGroupMembershipService({ prisma });
    const values = await service.listPublicMemberships();
    assert.deepEqual(
        values.map((value) => value.profilePublicId),
        [publicId, null, null]
    );
    assert.deepEqual(
        values.map((value) => value.avatarMediaId),
        [member.user.avatarMediaId, null, null]
    );
    assert.deepEqual(
        values.map((value) => value.displayName),
        ["Ana do Coletivo", "Ana", "Ana"]
    );
    assert.ok(
        values.every((value) => publicMembership.safeParse(value).success)
    );
    assert.deepEqual(
        await service.listPublicMemberships(undefined, publicId),
        []
    );
    assert.deepEqual(where, {
        groupId: undefined,
        isPublic: true,
        activeKey: "ACTIVE",
        group: { status: "ACTIVE" },
        user: {
            publicId,
            publicProfileEnabled: true,
            principal: {
                identities: { some: { status: "ACTIVE" } }
            }
        }
    });
});
test("own membership includes the union of role permissions", async () => {
    const prisma = {
        groupMembership: {
            findMany: async () => [
                {
                    id: 3,
                    groupId: 42,
                    userId: 9,
                    joinedAt: new Date("2026-10-01T00:00:00.000Z"),
                    leftAt: null,
                    isPublic: false,
                    positions: [],
                    roles: [
                        {
                            role: {
                                id: 1,
                                name: "Organização",
                                permissions: [
                                    { permission: "EVENT_CREATE" },
                                    { permission: "EVENT_EDIT" }
                                ]
                            }
                        },
                        {
                            role: {
                                id: 2,
                                name: "Eventos",
                                permissions: [{ permission: "EVENT_CREATE" }]
                            }
                        }
                    ],
                    user: { id: 9, studentId: 9 }
                }
            ]
        }
    } as unknown as PrismaClient;

    const [membership] = await createGroupMembershipService({
        prisma
    }).listOwnMemberships(9);
    assert.deepEqual(membership.permissions, ["EVENT_CREATE", "EVENT_EDIT"]);
});
test("group managers cannot discover private or inactive member avatars", async () => {
    const avatarMediaId = "8bf172b7-6e70-47e4-ad19-353292f77d34";
    const row = {
        id: 3,
        groupId: 42,
        userId: 9,
        joinedAt: new Date(),
        leftAt: null,
        isPublic: true,
        positions: [],
        roles: [],
        user: {
            name: "Ana",
            publicId: "8bf172b7-6e70-47e4-ad19-353292f77d34",
            publicProfileEnabled: true,
            avatarMediaId,
            principal: { identities: [{ id: 1 }] },
            id: 9,
            studentId: 9,
            student: { name: "Ana" }
        }
    };
    const prisma = {
        group: { count: async () => 1 },
        groupMembershipRole: { findFirst: async () => ({ roleId: 1 }) },
        groupMembership: { findMany: async () => [row] }
    } as unknown as PrismaClient;
    const service = createGroupMembershipService({ prisma });
    assert.equal(
        (await service.listManagedMemberships(1, 42))[0]!.avatarMediaId,
        avatarMediaId
    );
    row.user.publicProfileEnabled = false;
    assert.equal(
        (await service.listManagedMemberships(1, 42))[0]!.avatarMediaId,
        null
    );
    row.user.publicProfileEnabled = true;
    row.user.principal.identities = [];
    assert.equal(
        (await service.listManagedMemberships(1, 42))[0]!.avatarMediaId,
        null
    );
});
test("role managers can read memberships to assign roles", async () => {
    let permissionFilter: unknown;
    const prisma = {
        group: { count: async () => 1 },
        groupMembershipRole: {
            findFirst: async (query: {
                where: {
                    role: { permissions: { some: { permission: unknown } } };
                };
            }) => {
                permissionFilter = query.where.role.permissions.some.permission;
                return { roleId: 2 };
            }
        },
        groupMembership: { findMany: async () => [] }
    } as unknown as PrismaClient;

    assert.deepEqual(
        await createGroupMembershipService({ prisma }).listManagedMemberships(
            9,
            42
        ),
        []
    );
    assert.deepEqual(permissionFilter, {
        in: ["MEMBER_MANAGE", "ROLE_MANAGE"]
    });
});
test("invitations resolve the recipient by public id", async () => {
    let requestedPublicId: unknown;
    const prisma = {
        group: { count: async () => 1 },
        groupMembershipRole: { findFirst: async () => ({ roleId: 2 }) },
        user: {
            findUnique: async (query: { where: { publicId: string } }) => {
                requestedPublicId = query.where.publicId;
                return null;
            }
        }
    } as unknown as PrismaClient;

    await assert.rejects(
        createGroupInvitationService({ prisma }).createInvitation(
            9,
            42,
            "4c7ba34f-dc7b-48d7-90cd-e76a315ab037"
        ),
        NotFoundError
    );
    assert.equal(requestedPublicId, "4c7ba34f-dc7b-48d7-90cd-e76a315ab037");
});
test("managed invitations require group permission and expose recipients", async () => {
    let requestedGroupId: unknown;
    let requestedPermission: unknown;
    let publicProfileEnabled = true;
    let active = true;
    const prisma = {
        group: { count: async () => 1 },
        groupMembershipRole: {
            findFirst: async (query: {
                where: {
                    role: { permissions: { some: { permission: unknown } } };
                };
            }) => {
                requestedPermission =
                    query.where.role.permissions.some.permission;
                return { roleId: 2 };
            }
        },
        groupInvitation: {
            findMany: async (query: { where: { groupId: number } }) => {
                requestedGroupId = query.where.groupId;
                return [
                    {
                        id: 7,
                        groupId: 42,
                        recipientUserId: 9,
                        inviterUserId: 1,
                        status: "PENDING",
                        expiresAt: new Date("2099-10-20T00:00:00.000Z"),
                        createdAt: new Date("2026-10-01T00:00:00.000Z"),
                        respondedAt: null,
                        recipientUser: {
                            name: "Bia",
                            publicProfileEnabled,
                            principal: {
                                identities: active ? [{ id: 2 }] : []
                            },
                            avatarMediaId:
                                "8bf172b7-6e70-47e4-ad19-353292f77d34",
                            publicId: "4c7ba34f-dc7b-48d7-90cd-e76a315ab037",
                            id: 9,
                            studentId: 9,
                            student: { name: "Bia" }
                        },
                        inviterUser: { id: 1, studentId: 1 }
                    }
                ];
            }
        }
    } as unknown as PrismaClient;
    const [result] = await createGroupInvitationService({
        prisma
    }).listManagedInvitations(1, 42);
    assert.equal(requestedGroupId, 42);
    assert.deepEqual(requestedPermission, { in: ["MEMBER_MANAGE"] });
    assert.equal(result.recipientName, "Bia");
    assert.equal(
        result.recipientAvatarMediaId,
        "8bf172b7-6e70-47e4-ad19-353292f77d34"
    );
    publicProfileEnabled = false;
    const [hidden] = await createGroupInvitationService({
        prisma
    }).listManagedInvitations(1, 42);
    assert.equal(hidden.recipientAvatarMediaId, null);
    publicProfileEnabled = true;
    active = false;
    const [inactive] = await createGroupInvitationService({
        prisma
    }).listManagedInvitations(1, 42);
    assert.equal(inactive.recipientAvatarMediaId, null);
    assert.equal(managedInvitation.safeParse(result).success, true);
});
test("managed invitations are hidden without member management permission", async () => {
    const prisma = {
        group: { count: async () => 1 },
        groupMembershipRole: { findFirst: async () => null },
        groupInvitation: {
            findMany: async () => assert.fail("Unauthorized invitation read")
        }
    } as unknown as PrismaClient;
    await assert.rejects(
        createGroupInvitationService({ prisma }).listManagedInvitations(1, 42),
        ForbiddenError
    );
});
test("expired invitations cannot create memberships", async () => {
    const prisma = {
        groupInvitation: {
            findUnique: async () => ({
                id: 7,
                groupId: 42,
                recipientUserId: 9,
                status: "PENDING",
                expiresAt: new Date(Date.now() - 1000)
            })
        },
        $transaction: async () =>
            assert.fail("Expired invitation started a transaction")
    } as unknown as PrismaClient;

    await assert.rejects(
        createGroupInvitationService({ prisma }).acceptInvitation(9, 7),
        ConflictError
    );
});
test("published event requires a start date", async () => {
    const prisma = {
        groupEvent: {
            findUnique: async () => ({
                id: 15,
                groupId: 42,
                name: "Encontro",
                description: "Descrição",
                status: "DRAFT",
                startsAt: null,
                endsAt: null
            })
        },
        group: { count: async () => 1 },
        groupMembershipRole: { findFirst: async () => ({ roleId: 2 }) }
    } as unknown as PrismaClient;

    await assert.rejects(
        createGroupEventService({ prisma }).publishEvent(9, 42, 15),
        ConflictError
    );
});
test("private memberships have no public detail", async () => {
    const prisma = {
        groupMembership: {
            findUnique: async () => ({
                id: 4,
                groupId: 42,
                isPublic: false,
                activeKey: "ACTIVE"
            })
        }
    } as unknown as PrismaClient;

    await assert.rejects(
        createGroupMembershipService({ prisma }).getPublicMembership(4),
        NotFoundError
    );
});
test("managed group resources are hidden when they do not belong to the path group", async () => {
    const prisma = {
        groupRole: {
            findUnique: async () => ({ id: 3, groupId: 42 })
        },
        groupMembership: {
            findUnique: async () => ({ id: 4, groupId: 42 })
        },
        groupEvent: {
            findUnique: async () => ({ id: 5, groupId: 42 })
        }
    } as unknown as PrismaClient;

    await assert.rejects(
        createGroupRoleService({ prisma }).patchRole(9, 99, 3, {}),
        NotFoundError
    );
    await assert.rejects(
        createGroupRoleService({ prisma }).deleteRole(9, 99, 3),
        NotFoundError
    );
    await assert.rejects(
        createGroupMembershipService({ prisma }).patchManagedMembership(
            9,
            99,
            4,
            {}
        ),
        NotFoundError
    );
    await assert.rejects(
        createGroupEventService({ prisma }).patchEvent(9, 99, 5, {}),
        NotFoundError
    );
    await assert.rejects(
        createGroupEventService({ prisma }).publishEvent(9, 99, 5),
        NotFoundError
    );
    await assert.rejects(
        createGroupEventService({ prisma }).cancelEvent(9, 99, 5),
        NotFoundError
    );
});
test("expired invitations have the public status and no persistence keys", async () => {
    const prisma = {
        groupInvitation: {
            findMany: async () => [
                {
                    id: 7,
                    groupId: 42,
                    recipientUserId: 9,
                    inviterUserId: 1,
                    status: "PENDING",
                    pendingKey: "PENDING",
                    expiresAt: new Date(Date.now() - 1000),
                    createdAt: new Date("2026-10-01T00:00:00.000Z"),
                    respondedAt: null,
                    recipientUser: { id: 9, studentId: 9 },
                    inviterUser: { id: 1, studentId: 1 }
                }
            ]
        }
    } as unknown as PrismaClient;

    const [result] = await createGroupInvitationService({
        prisma
    }).listInvitations(9);
    assert.equal(result.status, "EXPIRED");
    assert.equal(invitation.safeParse(result).success, true);
    assert.equal("pendingKey" in result, false);
});
test("removing the last manager role is rejected before changing assignments", async () => {
    const tx = {
        group: { count: async () => 1 },
        groupMembership: {
            findUnique: async () => ({
                id: 4,
                groupId: 42,
                activeKey: "ACTIVE",
                positions: [],
                roles: []
            })
        },
        groupMembershipRole: {
            findFirst: async () => ({ roleId: 2 }),
            findMany: async () => [{ membershipId: 4, roleId: 2 }],
            deleteMany: async () => assert.fail("Last manager role was removed")
        },
        groupRole: { count: async () => 1 },
        groupPosition: { count: async () => 0 }
    };
    const prisma = {
        groupMembership: tx.groupMembership,
        $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
            work(tx)
    } as unknown as PrismaClient;
    const result = await createGroupMembershipService({
        prisma
    }).patchManagedMembership(9, 42, 4, { roles: { remove: [2] } });
    assert.deepEqual(result._unsafeUnwrapErr(), {
        kind: "conflict",
        message: "O grupo precisa manter um gestor de roles."
    });
});

test("role mutations reject repeated and opposing permissions before writes", async () => {
    let writes = 0;
    const row = { id: 3, groupId: 42, name: "Gestor", permissions: [] };
    const tx = {
        group: { count: async () => 1 },
        groupMembershipRole: { findFirst: async () => ({ roleId: 3 }) },
        groupRole: {
            findUnique: async () => row,
            create: async () => {
                writes++;
                return row;
            }
        }
    };
    const prisma = {
        ...tx,
        $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
            work(tx)
    } as unknown as PrismaClient;
    const service = createGroupRoleService({ prisma });
    await assert.rejects(
        service.createRole(7, 42, "Gestor", ["ROLE_MANAGE", "ROLE_MANAGE"]),
        ConflictError
    );
    const result = await service.patchRole(7, 42, 3, {
        permissions: { add: ["ROLE_MANAGE"], remove: ["ROLE_MANAGE"] }
    });
    assert.deepEqual(result._unsafeUnwrapErr(), {
        kind: "conflict",
        message: "Permissão repetida."
    });
    assert.equal(writes, 0);
    assert.deepEqual(
        await service.createRole(7, 42, "Gestor", ["ROLE_MANAGE"]),
        row
    );
    assert.equal(writes, 1);
});

test("group mutations translate Prisma and adapter serialization conflicts without hiding technical errors", async () => {
    for (const failure of [
        { code: "P2034" },
        { cause: { kind: "TransactionWriteConflict", originalCode: "40001" } }
    ]) {
        const prisma = {
            groupRole: {
                findUnique: async () => ({ id: 3, groupId: 42 })
            },
            groupMembership: {
                findUnique: async () => ({ id: 3, groupId: 42 })
            },
            $transaction: async () => {
                throw failure;
            }
        } as unknown as PrismaClient;
        assert.deepEqual(
            (
                await createGroupRoleService({ prisma }).patchRole(7, 42, 3, {})
            )._unsafeUnwrapErr(),
            {
                kind: "concurrent-change",
                message: "O grupo mudou durante a operação. Tente novamente."
            }
        );
        assert.equal(
            (
                await createGroupMembershipService({
                    prisma
                }).patchManagedMembership(7, 42, 3, {})
            )._unsafeUnwrapErr().kind,
            "concurrent-change"
        );
    }
    const failure = new Error("technical error");
    const prisma = {
        groupRole: {
            findUnique: async () => ({ id: 3, groupId: 42 })
        },
        $transaction: async () => {
            throw failure;
        }
    } as unknown as PrismaClient;
    await assert.rejects(
        createGroupRoleService({ prisma }).patchRole(7, 42, 3, {}),
        (error) => error === failure
    );
});

test("invitation representation uses the injected instant at the expiration boundary", async () => {
    let now = new Date("2026-11-01T00:00:00Z");
    const service = createGroupInvitationService({
        prisma: {
            groupInvitation: {
                findMany: async () => [
                    {
                        id: 1,
                        groupId: 7,
                        recipientUserId: 42,
                        inviterUserId: 9,
                        status: "PENDING",
                        expiresAt: new Date("2026-11-01T00:00:01Z"),
                        createdAt: now,
                        respondedAt: null,
                        recipientUser: {
                            id: 42,
                            studentId: 42
                        },
                        inviterUser: { id: 9, studentId: 9 }
                    }
                ]
            }
        } as never,
        clock: { now: () => now }
    });
    assert.equal((await service.listInvitations(42))[0]?.status, "PENDING");
    now = new Date("2026-11-01T00:00:01Z");
    assert.equal((await service.listInvitations(42))[0]?.status, "EXPIRED");
});
