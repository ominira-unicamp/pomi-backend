import { createSocialFriendshipService } from "#/modules/social/friendship/SocialFriendship.service.js";
import assert from "node:assert/strict";
import test from "node:test";
import { socialPerson } from "./fixtures/social.js";

function fixture() {
    const own = socialPerson(7);
    const friend = socialPerson(8);
    const row = {
        id: 3,
        studentAId: 7,
        studentBId: 8,
        requestedById: 8,
        status: "PENDING" as "PENDING" | "ACCEPTED",
        acceptedAt: null as Date | null,
        createdAt: new Date("2026-01-01"),
        studentA: own,
        studentB: friend
    };
    return { own, friend, row };
}

test("friendship acceptance preserves atomic conditions, conflicts and removal ownership", async () => {
    const { row } = fixture();
    let update: unknown;
    let deletion: unknown;
    let updatedCount = 1;
    const service = createSocialFriendshipService({
        prisma: {
            studentFriendship: {
                findFirst: async () => row,
                updateMany: async (input: unknown) => {
                    update = input;
                    return { count: updatedCount };
                },
                findUnique: async () => ({
                    ...row,
                    status: "ACCEPTED",
                    acceptedAt: new Date("2026-01-02")
                }),
                deleteMany: async (input: unknown) => {
                    deletion = input;
                    return { count: 1 };
                }
            }
        }
    } as never);
    assert.equal(
        (await service.acceptFriendship(7, 3))._unsafeUnwrap().direction,
        "NONE"
    );
    assert.deepEqual((update as { where: unknown }).where, {
        id: 3,
        status: "PENDING",
        requestedById: { not: 7 },
        OR: [{ studentAId: 7 }, { studentBId: 7 }]
    });
    updatedCount = 0;
    assert.equal((await service.acceptFriendship(7, 3)).isErr(), true);
    assert.equal((await service.acceptFriendship(8, 3)).isErr(), true);
    assert.equal((await service.removeFriendship(7, 3)).isOk(), true);
    assert.deepEqual(deletion, {
        where: { id: 3, OR: [{ studentAId: 7 }, { studentBId: 7 }] }
    });
});

test("friendship creation orders the pair and translates duplicate requests", async () => {
    const { row } = fixture();
    let targetId = 8;
    let duplicate = false;
    let data: unknown;
    const service = createSocialFriendshipService({
        prisma: {
            student: { findFirst: async () => ({ id: targetId }) },
            studentFriendship: {
                create: async (input: { data: unknown }) => {
                    data = input.data;
                    if (duplicate) throw { code: "P2002" };
                    return row;
                }
            }
        }
    } as never);
    assert.equal(
        (await service.createFriendship(7, row.studentB.publicId)).isOk(),
        true
    );
    assert.deepEqual(data, { studentAId: 7, studentBId: 8, requestedById: 7 });
    duplicate = true;
    assert.equal(
        (await service.createFriendship(7, row.studentB.publicId)).isErr(),
        true
    );
    targetId = 7;
    assert.equal(
        (await service.createFriendship(7, row.studentB.publicId)).isErr(),
        true
    );
});

test("friendship lists preserve filters and hide private profile details", async () => {
    const { row } = fixture();
    row.studentB.publicProfileEnabled = false;
    let where: unknown;
    const service = createSocialFriendshipService({
        prisma: {
            studentFriendship: {
                findMany: async (input: { where: unknown }) => {
                    where = input.where;
                    return [row];
                }
            }
        }
    } as never);
    const result = await service.listFriendships(7, {
        filter: [{ path: ["direction"], operator: "eq", values: ["INCOMING"] }]
    });
    assert.deepEqual(where, {
        AND: [
            { OR: [{ studentAId: 7 }, { studentBId: 7 }] },
            { AND: [{ status: "PENDING" }, { requestedById: { not: 7 } }] }
        ]
    });
    assert.equal(result[0].direction, "INCOMING");
    assert.equal(result[0].friend.avatarMediaId, null);
    assert.deepEqual(result[0].friend.currentCourses, []);
});
