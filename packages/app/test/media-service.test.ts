import type { Principal } from "#/auth.js";
import { createMediaService, type MediaTarget } from "#/media/MediaService.js";
import type { UploadedImage } from "#/media/PictRsClient.js";
import { ConflictError, ForbiddenError, NotFoundError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";

const principal: Principal = {
    authUserId: 9,
    issuer: "test",
    subject: "student",
    email: null,
    roles: new Set(["STUDENT"]),
    capabilities: new Set(),
    studentId: 42
};

const uploaded: UploadedImage = {
    alias: "new.webp",
    width: 300,
    height: 300,
    contentType: "image/webp"
};

function fixture() {
    let state = {
        userStatus: "ACTIVE",
        userStudentId: 42,
        canEditGroup: true,
        groupStatus: "ACTIVE",
        student: {
            avatarMediaId: "old-id" as string | null,
            avatarRevision: 3
        },
        group: {
            avatarMediaId: "old-group-id" as string | null,
            avatarRevision: 7
        },
        assets: {
            "old-id": { status: "ACTIVE", nextDeleteAt: null as Date | null },
            "old-group-id": {
                status: "ACTIVE",
                nextDeleteAt: null as Date | null
            }
        } as Record<string, { status: string; nextDeleteAt: Date | null }>,
        created: 0
    };
    const database = {
        authUser: {
            findUnique: async () => ({
                status: state.userStatus,
                studentId: state.userStudentId,
                roles: [{ role: "STUDENT" }]
            })
        },
        botGrant: { findFirst: async () => null },
        groupMembershipRole: {
            findFirst: async () => (state.canEditGroup ? { roleId: 1 } : null)
        },
        student: {
            findUnique: async () => ({ ...state.student }),
            updateMany: async ({
                where,
                data
            }: {
                where: { avatarRevision: number; avatarMediaId: string | null };
                data: { avatarMediaId: string | null };
            }) => {
                if (
                    where.avatarRevision !== state.student.avatarRevision ||
                    where.avatarMediaId !== state.student.avatarMediaId
                ) {
                    return { count: 0 };
                }
                state.student.avatarMediaId = data.avatarMediaId;
                state.student.avatarRevision += 1;
                return { count: 1 };
            }
        },
        group: {
            findFirst: async () =>
                state.groupStatus === "ACTIVE" ? { ...state.group } : null,
            updateMany: async ({
                where,
                data
            }: {
                where: {
                    avatarRevision: number;
                    avatarMediaId: string | null;
                };
                data: { avatarMediaId: string | null };
            }) => {
                if (state.groupStatus !== "ACTIVE") return { count: 0 };
                if (
                    where.avatarRevision !== state.group.avatarRevision ||
                    where.avatarMediaId !== state.group.avatarMediaId
                )
                    return { count: 0 };
                state.group.avatarMediaId = data.avatarMediaId;
                state.group.avatarRevision += 1;
                return { count: 1 };
            }
        },
        mediaAsset: {
            create: async () => {
                state.created += 1;
                return { id: `created-${state.created}` };
            },
            updateMany: async ({
                where,
                data
            }: {
                where: { id: string; status: string };
                data: { status: string; nextDeleteAt: Date };
            }) => {
                const asset = state.assets[where.id];
                if (!asset || asset.status !== where.status)
                    return { count: 0 };
                asset.status = data.status;
                asset.nextDeleteAt = data.nextDeleteAt;
                return { count: 1 };
            }
        },
        $transaction: async (work: (db: unknown) => Promise<unknown>) => {
            const before = structuredClone(state);
            try {
                return await work(database);
            } catch (error) {
                state = before;
                throw error;
            }
        }
    } as unknown as PrismaClient;
    return {
        service: createMediaService({ prisma: database }),
        state: () => state,
        disableUser: () => (state.userStatus = "DISABLED"),
        revokeGroupEdit: () => (state.canEditGroup = false),
        archiveGroup: () => (state.groupStatus = "ARCHIVED")
    };
}

test("replacement advances the slot revision and queues only the prior alias", async () => {
    const { service, state } = fixture();
    const target: MediaTarget = { kind: "student-avatar", studentId: 42 };
    const snapshot = await service.prepare(principal, target);

    assert.deepEqual(snapshot, { target, mediaId: "old-id", revision: 3 });
    assert.deepEqual(await service.activate(principal, snapshot, uploaded), {
        mediaId: "created-1",
        revision: 4
    });
    assert.deepEqual(state().student, {
        avatarMediaId: "created-1",
        avatarRevision: 4
    });
    assert.equal(state().assets["old-id"]?.status, "PENDING_DELETE");
    assert.ok(state().assets["old-id"]?.nextDeleteAt instanceof Date);
});

test("records a failed activation for cleanup without marking an active alias for deletion", async () => {
    const created: unknown[] = [];
    let existing: { id: string } | null = { id: "already-linked" };
    const database = {
        mediaAsset: {
            findUnique: async () => existing,
            create: async (input: unknown) => {
                created.push(input);
            }
        }
    } as unknown as PrismaClient;
    const service = createMediaService({ prisma: database });

    await service.recordUnlinked(uploaded);
    assert.equal(created.length, 0);
    existing = null;
    await service.recordUnlinked(uploaded);
    const data = (created[0] as { data: Record<string, unknown> }).data;
    assert.equal(data.alias, "new.webp");
    assert.equal(data.status, "PENDING_DELETE");
    assert.ok(data.nextDeleteAt instanceof Date);
});

test("a stale upload cannot replace a newer image", async () => {
    const { service, state } = fixture();
    const target: MediaTarget = { kind: "student-avatar", studentId: 42 };
    const first = await service.prepare(principal, target);
    const second = await service.prepare(principal, target);
    await service.activate(principal, first, uploaded);

    await assert.rejects(
        service.activate(principal, second, {
            ...uploaded,
            alias: "other.webp"
        }),
        ConflictError
    );
    assert.equal(state().student.avatarMediaId, "created-1");
    assert.equal(state().created, 1);
});

test("revoked permission during upload leaves the active image intact", async () => {
    const { service, state, disableUser } = fixture();
    const snapshot = await service.prepare(principal, {
        kind: "student-avatar",
        studentId: 42
    });
    disableUser();

    await assert.rejects(
        service.activate(principal, snapshot, uploaded),
        ForbiddenError
    );
    assert.equal(state().student.avatarMediaId, "old-id");
    assert.equal(state().assets["old-id"]?.status, "ACTIVE");
    assert.equal(state().created, 0);
});

test("group editing is rechecked and archived groups cannot activate images", async () => {
    const { service, revokeGroupEdit, state } = fixture();
    const target: MediaTarget = {
        kind: "group-avatar",
        groupId: 7,
        studentId: 42
    };
    const snapshot = await service.prepare(principal, target);
    revokeGroupEdit();
    await assert.rejects(
        service.activate(principal, snapshot, uploaded),
        ForbiddenError
    );
    assert.equal(state().group.avatarMediaId, "old-group-id");

    const second = fixture();
    const fresh = await second.service.prepare(principal, target);
    second.archiveGroup();
    await assert.rejects(
        second.service.activate(principal, fresh, uploaded),
        NotFoundError
    );
});

test("removal detaches before scheduling physical deletion", async () => {
    const { service, state } = fixture();
    const snapshot = await service.prepare(principal, {
        kind: "student-avatar",
        studentId: 42
    });
    assert.deepEqual(await service.remove(principal, snapshot), {
        revision: 4
    });
    assert.equal(state().student.avatarMediaId, null);
    assert.equal(state().assets["old-id"]?.status, "PENDING_DELETE");
});

test("read access follows the current profile flag and current identity", async () => {
    let publicProfileEnabled = false;
    let activeUser = true;
    const database = {
        mediaAsset: {
            findUnique: async () => ({
                alias: "private.webp",
                status: "ACTIVE",
                studentAvatar: { id: 42, publicProfileEnabled },
                groupAvatar: null
            })
        },
        authUser: {
            findUnique: async () => ({
                status: activeUser ? "ACTIVE" : "DISABLED",
                studentId: 42,
                roles: [{ role: "STUDENT" }]
            })
        },
        botGrant: { findFirst: async () => null }
    } as unknown as PrismaClient;
    const service = createMediaService({ prisma: database });

    await assert.rejects(
        service.resolveRead(undefined, "media-id"),
        NotFoundError
    );
    assert.deepEqual(await service.resolveRead(principal, "media-id"), {
        alias: "private.webp"
    });
    activeUser = false;
    await assert.rejects(
        service.resolveRead(principal, "media-id"),
        NotFoundError
    );
    publicProfileEnabled = true;
    assert.deepEqual(await service.resolveRead(undefined, "media-id"), {
        alias: "private.webp"
    });
});

test("only an active, singly linked asset exposes a group avatar", async () => {
    const asset = {
        alias: "group.webp",
        status: "ACTIVE",
        studentAvatar: null as {
            id: number;
            publicProfileEnabled: boolean;
        } | null,
        groupAvatar: { status: "ACTIVE" } as { status: string } | null
    };
    const database = {
        mediaAsset: { findUnique: async () => asset }
    } as unknown as PrismaClient;
    const service = createMediaService({ prisma: database });
    assert.deepEqual(await service.resolveRead(undefined, "media-id"), {
        alias: "group.webp"
    });
    asset.studentAvatar = { id: 42, publicProfileEnabled: true };
    await assert.rejects(
        service.resolveRead(undefined, "media-id"),
        NotFoundError
    );
    asset.studentAvatar = null;
    asset.groupAvatar!.status = "ARCHIVED";
    await assert.rejects(
        service.resolveRead(undefined, "media-id"),
        NotFoundError
    );
    asset.groupAvatar!.status = "ACTIVE";
    asset.status = "PENDING_DELETE";
    await assert.rejects(
        service.resolveRead(undefined, "media-id"),
        NotFoundError
    );
    asset.status = "ACTIVE";
    asset.groupAvatar = null;
    await assert.rejects(
        service.resolveRead(undefined, "media-id"),
        NotFoundError
    );
});
