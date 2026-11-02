import { runAtomic } from "#/application/transactions.js";
import { patchManagedGroupMembership } from "#/modules/group/membership/PatchManagedGroupMembership.use-case.js";
import { patchGroupRole } from "#/modules/group/role/PatchGroupRole.use-case.js";
import { err, ok } from "@pomi/api-core";
import {
    createDatabaseClient,
    type MyPrisma,
    type PrismaClient
} from "@pomi/db";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.POMI_APP_TEST_DATABASE_URL;
const instant = new Date("2026-11-01T12:00:00.000Z");
const clock = { now: () => instant };

function rendezvous() {
    let arrived = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
        release = resolve;
    });
    return async () => {
        if (++arrived === 2) release();
        await ready;
    };
}

function interceptTransactions(
    prisma: PrismaClient,
    hook: (tx: MyPrisma.TransactionClient) => MyPrisma.TransactionClient
): PrismaClient {
    return new Proxy(prisma, {
        get(target, key) {
            if (key === "$transaction")
                return (
                    work: (tx: MyPrisma.TransactionClient) => Promise<unknown>,
                    options: {
                        isolationLevel?: MyPrisma.TransactionIsolationLevel;
                    }
                ) =>
                    target.$transaction((tx) => work(hook(tx)), {
                        ...options,
                        timeout: 15000
                    });
            return Reflect.get(target, key);
        }
    });
}

async function fixture(prisma: PrismaClient) {
    const suffix = randomUUID();
    const academicStudents = await Promise.all(
        [0, 1, 2].map((index) =>
            prisma.student.create({
                data: {
                    name: `Architecture ${index}`,
                    ra: `${suffix}-${index}`
                }
            })
        )
    );
    const principals = await Promise.all(
        academicStudents.map((student) =>
            prisma.principal.create({
                data: {
                    kind: "HUMAN",
                    user: {
                        create: {
                            name: student.name,
                            studentId: student.id,
                            legacyStudentId: student.id
                        }
                    }
                },
                include: { user: true }
            })
        )
    );
    const users = principals.map((principal) => principal.user!);
    const group = await prisma.group.create({
        data: { name: `Architecture ${suffix}` }
    });
    const roles = await Promise.all(
        [0, 1, 2].map((index) =>
            prisma.groupRole.create({
                data: {
                    groupId: group.id,
                    name: `Role ${index}`,
                    permissions: {
                        create: [
                            { permission: "ROLE_MANAGE" },
                            { permission: "MEMBER_MANAGE" }
                        ]
                    }
                }
            })
        )
    );
    const members = await Promise.all(
        users.map((student) =>
            prisma.groupMembership.create({
                data: { groupId: group.id, userId: student.id }
            })
        )
    );
    await prisma.groupMembershipRole.createMany({
        data: members.slice(0, 2).map((member, index) => ({
            groupId: group.id,
            membershipId: member.id,
            roleId: roles[index]!.id
        }))
    });
    return {
        group,
        users,
        roles,
        members,
        async cleanup() {
            await prisma.groupMembershipRole.deleteMany({
                where: { groupId: group.id }
            });
            await prisma.groupPosition.deleteMany({
                where: { membership: { groupId: group.id } }
            });
            await prisma.groupMembership.deleteMany({
                where: { groupId: group.id }
            });
            await prisma.groupRolePermission.deleteMany({
                where: { role: { groupId: group.id } }
            });
            await prisma.groupRole.deleteMany({ where: { groupId: group.id } });
            await prisma.group.delete({ where: { id: group.id } });
            await prisma.user.deleteMany({
                where: { id: { in: users.map(({ id }) => id) } }
            });
            await prisma.principal.deleteMany({
                where: { id: { in: principals.map(({ id }) => id) } }
            });
            await prisma.student.deleteMany({
                where: { id: { in: academicStudents.map(({ id }) => id) } }
            });
        }
    };
}

test(
    "group transactions preserve rollback and governance on PostgreSQL",
    { skip: !databaseUrl, timeout: 90000 },
    async (t) => {
        assert.match(new URL(databaseUrl!).pathname, /_test$/);
        const prisma = createDatabaseClient(databaseUrl!, { max: 6 });
        try {
            await t.test(
                "atomic execution commits success and rolls back returned failures and technical exceptions",
                async () => {
                    const f = await fixture(prisma);
                    try {
                        const failed = await runAtomic(prisma, async (tx) => {
                            await tx.group.update({
                                where: { id: f.group.id },
                                data: { name: "Rejected" }
                            });
                            return err({ kind: "rejected" });
                        });
                        assert.equal(failed.isErr(), true);
                        assert.equal(
                            (
                                await prisma.group.findUniqueOrThrow({
                                    where: { id: f.group.id }
                                })
                            ).name,
                            f.group.name
                        );
                        const failure = new Error("technical failure");
                        await assert.rejects(
                            runAtomic(prisma, async (tx) => {
                                await tx.group.update({
                                    where: { id: f.group.id },
                                    data: { name: "Thrown" }
                                });
                                throw failure;
                            }),
                            (error) => error === failure
                        );
                        assert.equal(
                            (
                                await prisma.group.findUniqueOrThrow({
                                    where: { id: f.group.id }
                                })
                            ).name,
                            f.group.name
                        );
                        assert.equal(
                            (
                                await runAtomic(prisma, async (tx) =>
                                    ok(
                                        await tx.group.update({
                                            where: { id: f.group.id },
                                            data: { name: "Committed" }
                                        })
                                    )
                                )
                            ).isOk(),
                            true
                        );
                        assert.equal(
                            (
                                await prisma.group.findUniqueOrThrow({
                                    where: { id: f.group.id }
                                })
                            ).name,
                            "Committed"
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "removing a shared role assignment affects only its target membership",
                async () => {
                    const f = await fixture(prisma);
                    try {
                        await prisma.groupMembershipRole.update({
                            where: {
                                membershipId_roleId: {
                                    membershipId: f.members[1]!.id,
                                    roleId: f.roles[1]!.id
                                }
                            },
                            data: { roleId: f.roles[0]!.id }
                        });
                        const result = await patchManagedGroupMembership(
                            { prisma, clock },
                            {
                                userId: f.users[0]!.id,
                                id: f.members[0]!.id,
                                input: { roles: { remove: [f.roles[0]!.id] } }
                            }
                        );
                        assert.equal(result.isOk(), true);
                        assert.equal(
                            await prisma.groupMembershipRole.count({
                                where: { roleId: f.roles[0]!.id }
                            }),
                            1
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "a sole manager can atomically replace its management role, but an ended membership cannot retain management",
                async () => {
                    const f = await fixture(prisma);
                    try {
                        await prisma.groupMembership.update({
                            where: { id: f.members[1]!.id },
                            data: { activeKey: null }
                        });
                        const replaced = await patchManagedGroupMembership(
                            { prisma, clock },
                            {
                                userId: f.users[0]!.id,
                                id: f.members[0]!.id,
                                input: {
                                    roles: {
                                        remove: [f.roles[0]!.id],
                                        add: [f.roles[2]!.id]
                                    }
                                }
                            }
                        );
                        assert.equal(replaced.isOk(), true);
                        assert.equal(
                            replaced._unsafeUnwrap().roles[0]?.id,
                            f.roles[2]!.id
                        );
                        const rejected = await patchManagedGroupMembership(
                            { prisma, clock },
                            {
                                userId: f.users[0]!.id,
                                id: f.members[0]!.id,
                                input: {
                                    leave: true,
                                    positions: {
                                        add: [{ title: "Must roll back" }]
                                    }
                                }
                            }
                        );
                        assert.equal(
                            rejected._unsafeUnwrapErr().kind,
                            "conflict"
                        );
                        assert.equal(
                            await prisma.groupPosition.count({
                                where: { membershipId: f.members[0]!.id }
                            }),
                            0
                        );
                        const roleRejected = await patchGroupRole(
                            { prisma },
                            {
                                userId: f.users[0]!.id,
                                id: f.roles[2]!.id,
                                input: {
                                    name: "Rejected",
                                    permissions: { remove: ["ROLE_MANAGE"] }
                                }
                            }
                        );
                        assert.equal(
                            roleRejected._unsafeUnwrapErr().kind,
                            "conflict"
                        );
                        assert.equal(
                            (
                                await prisma.groupRole.findUniqueOrThrow({
                                    where: { id: f.roles[2]!.id }
                                })
                            ).name,
                            f.roles[2]!.name
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "successful membership ending uses the injected instant and returns its transaction snapshot",
                async () => {
                    const f = await fixture(prisma);
                    try {
                        const result = await patchManagedGroupMembership(
                            { prisma, clock },
                            {
                                userId: f.users[0]!.id,
                                id: f.members[0]!.id,
                                input: { leave: true }
                            }
                        );
                        assert.equal(
                            result._unsafeUnwrap().leftAt,
                            instant.toISOString()
                        );
                        assert.equal(result._unsafeUnwrap().isPublic, false);
                        assert.equal(
                            (
                                await prisma.groupMembership.findUniqueOrThrow({
                                    where: { id: f.members[0]!.id }
                                })
                            ).activeKey,
                            null
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "two concurrent manager departures cannot both commit",
                async () => {
                    const f = await fixture(prisma);
                    const meet = rendezvous();
                    const concurrent = interceptTransactions(
                        prisma,
                        (tx) =>
                            new Proxy(tx, {
                                get(target, key) {
                                    if (key === "groupMembershipRole")
                                        return new Proxy(
                                            target.groupMembershipRole,
                                            {
                                                get(delegate, operation) {
                                                    if (
                                                        operation === "findMany"
                                                    )
                                                        return async (
                                                            query: MyPrisma.GroupMembershipRoleFindManyArgs
                                                        ) => {
                                                            const rows =
                                                                await delegate.findMany(
                                                                    query
                                                                );
                                                            await meet();
                                                            return rows;
                                                        };
                                                    return Reflect.get(
                                                        delegate,
                                                        operation
                                                    );
                                                }
                                            }
                                        );
                                    return Reflect.get(target, key);
                                }
                            })
                    );
                    try {
                        const results = await Promise.all(
                            [0, 1].map((index) =>
                                patchManagedGroupMembership(
                                    { prisma: concurrent, clock },
                                    {
                                        userId: f.users[index]!.id,
                                        id: f.members[index]!.id,
                                        input: { leave: true }
                                    }
                                )
                            )
                        );
                        assert.equal(
                            results.filter((result) => result.isOk()).length,
                            1
                        );
                        assert.deepEqual(
                            results
                                .find((result) => result.isErr())!
                                ._unsafeUnwrapErr(),
                            {
                                kind: "concurrent-change",
                                message:
                                    "O grupo mudou durante a operação. Tente novamente."
                            }
                        );
                        assert.equal(
                            await prisma.groupMembership.count({
                                where: {
                                    groupId: f.group.id,
                                    activeKey: "ACTIVE",
                                    roles: {
                                        some: {
                                            role: {
                                                permissions: {
                                                    some: {
                                                        permission:
                                                            "ROLE_MANAGE"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }),
                            1
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "role permission removal considers other roles and rolls back failures after a write",
                async () => {
                    const f = await fixture(prisma);
                    try {
                        await prisma.groupMembershipRole.create({
                            data: {
                                groupId: f.group.id,
                                membershipId: f.members[0]!.id,
                                roleId: f.roles[2]!.id
                            }
                        });
                        const removed = await patchGroupRole(
                            { prisma },
                            {
                                userId: f.users[0]!.id,
                                id: f.roles[0]!.id,
                                input: {
                                    permissions: { remove: ["ROLE_MANAGE"] }
                                }
                            }
                        );
                        assert.equal(removed.isOk(), true);
                        assert.equal(
                            removed
                                ._unsafeUnwrap()
                                .permissions.includes("ROLE_MANAGE"),
                            false
                        );
                        let reads = 0;
                        const missingResponse = interceptTransactions(
                            prisma,
                            (tx) =>
                                new Proxy(tx, {
                                    get(target, key) {
                                        if (key === "groupRole")
                                            return new Proxy(target.groupRole, {
                                                get(delegate, operation) {
                                                    if (
                                                        operation ===
                                                        "findUnique"
                                                    )
                                                        return async (
                                                            query: MyPrisma.GroupRoleFindUniqueArgs
                                                        ) =>
                                                            ++reads === 1
                                                                ? delegate.findUnique(
                                                                      query
                                                                  )
                                                                : null;
                                                    return Reflect.get(
                                                        delegate,
                                                        operation
                                                    );
                                                }
                                            });
                                        return Reflect.get(target, key);
                                    }
                                })
                        );
                        const result = await patchGroupRole(
                            { prisma: missingResponse },
                            {
                                userId: f.users[0]!.id,
                                id: f.roles[2]!.id,
                                input: { name: "Must roll back" }
                            }
                        );
                        assert.equal(
                            result._unsafeUnwrapErr().kind,
                            "not-found"
                        );
                        assert.equal(
                            (
                                await prisma.groupRole.findUniqueOrThrow({
                                    where: { id: f.roles[2]!.id }
                                })
                            ).name,
                            f.roles[2]!.name
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "membership reference and date checks run before writes using transactional facts",
                async () => {
                    const f = await fixture(prisma);
                    try {
                        const position = await prisma.groupPosition.create({
                            data: {
                                membershipId: f.members[0]!.id,
                                title: "Cargo",
                                startedAt: new Date("2026-01-01T00:00:00Z")
                            }
                        });
                        const invalidDate = await patchManagedGroupMembership(
                            { prisma, clock },
                            {
                                userId: f.users[0]!.id,
                                id: f.members[0]!.id,
                                input: {
                                    positions: {
                                        update: [
                                            {
                                                id: position.id,
                                                endedAt: "2025-12-31T00:00:00Z"
                                            }
                                        ],
                                        add: [{ title: "Rejected" }]
                                    }
                                }
                            }
                        );
                        assert.equal(
                            invalidDate._unsafeUnwrapErr().kind,
                            "conflict"
                        );
                        const otherMembership =
                            await patchManagedGroupMembership(
                                { prisma, clock },
                                {
                                    userId: f.users[0]!.id,
                                    id: f.members[1]!.id,
                                    input: {
                                        positions: { remove: [position.id] }
                                    }
                                }
                            );
                        assert.equal(
                            otherMembership._unsafeUnwrapErr().kind,
                            "not-found"
                        );
                        assert.equal(
                            await prisma.groupPosition.count({
                                where: { membershipId: position.membershipId }
                            }),
                            1
                        );
                        await prisma.group.update({
                            where: { id: f.group.id },
                            data: { status: "ARCHIVED" }
                        });
                        const archived = await patchGroupRole(
                            { prisma },
                            {
                                userId: f.users[0]!.id,
                                id: f.roles[0]!.id,
                                input: { name: "Denied" }
                            }
                        );
                        assert.equal(
                            archived._unsafeUnwrapErr().kind,
                            "not-found"
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "concurrent removal of management from different roles preserves a manager",
                async () => {
                    const f = await fixture(prisma);
                    const meet = rendezvous();
                    const concurrent = interceptTransactions(
                        prisma,
                        (tx) =>
                            new Proxy(tx, {
                                get(target, key) {
                                    if (key === "groupMembershipRole")
                                        return new Proxy(
                                            target.groupMembershipRole,
                                            {
                                                get(delegate, operation) {
                                                    if (
                                                        operation === "findMany"
                                                    )
                                                        return async (
                                                            query: MyPrisma.GroupMembershipRoleFindManyArgs
                                                        ) => {
                                                            const rows =
                                                                await delegate.findMany(
                                                                    query
                                                                );
                                                            await meet();
                                                            return rows;
                                                        };
                                                    return Reflect.get(
                                                        delegate,
                                                        operation
                                                    );
                                                }
                                            }
                                        );
                                    return Reflect.get(target, key);
                                }
                            })
                    );
                    try {
                        const results = await Promise.all(
                            [0, 1].map((index) =>
                                patchGroupRole(
                                    { prisma: concurrent },
                                    {
                                        userId: f.users[index]!.id,
                                        id: f.roles[index]!.id,
                                        input: {
                                            permissions: {
                                                remove: ["ROLE_MANAGE"]
                                            }
                                        }
                                    }
                                )
                            )
                        );
                        assert.equal(
                            results.filter((result) => result.isOk()).length,
                            1
                        );
                        assert.equal(
                            results
                                .find((result) => result.isErr())!
                                ._unsafeUnwrapErr().kind,
                            "concurrent-change"
                        );
                        assert.equal(
                            await prisma.groupMembership.count({
                                where: {
                                    groupId: f.group.id,
                                    activeKey: "ACTIVE",
                                    roles: {
                                        some: {
                                            role: {
                                                permissions: {
                                                    some: {
                                                        permission:
                                                            "ROLE_MANAGE"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }),
                            1
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "concurrent access revocation and a mutation do not both confirm incompatible snapshots",
                async () => {
                    const f = await fixture(prisma);
                    const meet = rendezvous();
                    const concurrent = interceptTransactions(prisma, (tx) => {
                        let firstRead = true;
                        return new Proxy(tx, {
                            get(target, key) {
                                if (key === "groupMembership")
                                    return new Proxy(target.groupMembership, {
                                        get(delegate, operation) {
                                            if (operation === "findUnique")
                                                return async (
                                                    query: MyPrisma.GroupMembershipFindUniqueArgs
                                                ) => {
                                                    const row =
                                                        await delegate.findUnique(
                                                            query
                                                        );
                                                    if (firstRead) {
                                                        firstRead = false;
                                                        await meet();
                                                    }
                                                    return row;
                                                };
                                            return Reflect.get(
                                                delegate,
                                                operation
                                            );
                                        }
                                    });
                                return Reflect.get(target, key);
                            }
                        });
                    });
                    try {
                        const [mutation, revocation] = await Promise.all([
                            patchManagedGroupMembership(
                                { prisma: concurrent, clock },
                                {
                                    userId: f.users[0]!.id,
                                    id: f.members[0]!.id,
                                    input: {
                                        positions: {
                                            add: [{ title: "Concurrent" }]
                                        }
                                    }
                                }
                            ),
                            patchManagedGroupMembership(
                                { prisma: concurrent, clock },
                                {
                                    userId: f.users[1]!.id,
                                    id: f.members[0]!.id,
                                    input: {
                                        roles: { remove: [f.roles[0]!.id] }
                                    }
                                }
                            )
                        ]);
                        assert.equal(
                            mutation.isOk() && revocation.isOk(),
                            false
                        );
                        assert.equal(
                            await prisma.groupPosition.count({
                                where: { membershipId: f.members[0]!.id }
                            }),
                            mutation.isOk() ? 1 : 0
                        );
                        assert.equal(
                            await prisma.groupMembershipRole.count({
                                where: { membershipId: f.members[0]!.id }
                            }),
                            revocation.isOk() ? 0 : 1
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );

            await t.test(
                "completed access revocation is observed inside the next mutation",
                async () => {
                    const f = await fixture(prisma);
                    try {
                        await patchManagedGroupMembership(
                            { prisma, clock },
                            {
                                userId: f.users[1]!.id,
                                id: f.members[0]!.id,
                                input: { roles: { remove: [f.roles[0]!.id] } }
                            }
                        );
                        const denied = await patchManagedGroupMembership(
                            { prisma, clock },
                            {
                                userId: f.users[0]!.id,
                                id: f.members[0]!.id,
                                input: {
                                    positions: { add: [{ title: "Denied" }] }
                                }
                            }
                        );
                        assert.equal(
                            denied._unsafeUnwrapErr().kind,
                            "forbidden"
                        );
                        assert.equal(
                            await prisma.groupPosition.count({
                                where: { membershipId: f.members[0]!.id }
                            }),
                            0
                        );
                    } finally {
                        await f.cleanup();
                    }
                }
            );
        } finally {
            await prisma.$disconnect();
        }
    }
);
