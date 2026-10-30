import { ImageResourceRegistry } from "#/media/ImageResourceRegistry.js";
import type { ImageStorage } from "#/media/ImageStorage.js";
import { createMediaCleanup } from "#/media/MediaCleanup.js";
import { createAppImageResourceRegistry } from "#/MediaResources.js";
import type { PrismaClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";
import { mediaFixture } from "./fixtures/media.js";

const now = new Date("2026-10-15T12:00:00Z");

test("claims pending deletion and marks it complete after pict-rs confirms", async () => {
    const asset = {
        id: "asset-id",
        alias: "prior.webp",
        status: "PENDING_DELETE",
        deleteAttempts: 0,
        nextDeleteAt: now,
        studentAvatar: null,
        groupAvatar: null
    };
    const deleted: string[] = [];
    const prisma = {
        mediaAsset: {
            findMany: async () => [asset],
            updateMany: async ({ data }: { data: Record<string, unknown> }) => {
                if (typeof data.status === "string") asset.status = data.status;
                if (data.deleteAttempts) asset.deleteAttempts += 1;
                return { count: 1 };
            }
        }
    } as unknown as PrismaClient;
    const imageStorage = {
        deleteAlias: async (alias: string) => {
            deleted.push(alias);
        }
    } as unknown as ImageStorage;

    const result = await createMediaCleanup({
        prisma,
        imageStorage,
        imageResourceRegistry: noReferences()
    }).deleteDue(now);

    assert.deepEqual(result, {
        inspected: 1,
        deleted: 1,
        failed: 0,
        skipped: 0
    });
    assert.deepEqual(deleted, ["prior.webp"]);
    assert.equal(asset.status, "DELETED");
    assert.equal(asset.deleteAttempts, 1);
});

test("keeps a pending record and schedules a bounded retry when pict-rs fails", async () => {
    const updates: Record<string, unknown>[] = [];
    const prisma = {
        mediaAsset: {
            findMany: async () => [
                {
                    id: "asset-id",
                    alias: "prior.webp",
                    deleteAttempts: 0,
                    nextDeleteAt: now,
                    studentAvatar: null,
                    groupAvatar: null
                }
            ],
            updateMany: async ({ data }: { data: Record<string, unknown> }) => {
                updates.push(data);
                return { count: 1 };
            }
        }
    } as unknown as PrismaClient;
    const imageStorage = {
        deleteAlias: async () => {
            throw new Error("upstream failed");
        }
    } as unknown as ImageStorage;

    const result = await createMediaCleanup({
        prisma,
        imageStorage,
        imageResourceRegistry: noReferences()
    }).deleteDue(now);

    assert.equal(result.failed, 1);
    assert.ok(updates[1]?.nextDeleteAt instanceof Date);
    assert.ok((updates[1].nextDeleteAt as Date) > now);
    assert.equal(updates[1]?.lastDeleteError, "Error");
    assert.equal(updates[1]?.status, undefined);
});

test("reconciliation deletes only old unknown aliases after a second database check", async () => {
    const deleted: string[] = [];
    const reads = new Map<string, number>();
    const old = new Date("2026-10-13T00:00:00Z");
    const young = new Date("2026-10-15T11:00:00Z");
    const prisma = {
        mediaAsset: {
            findUnique: async ({ where }: { where: { alias: string } }) => {
                const count = (reads.get(where.alias) ?? 0) + 1;
                reads.set(where.alias, count);
                if (where.alias === "active.webp") return { id: "active" };
                if (where.alias === "linked-late.webp" && count === 2) {
                    return { id: "late" };
                }
                return null;
            }
        }
    } as unknown as PrismaClient;
    const imageStorage = {
        listAliases: async () => ({
            aliases: [
                { alias: "orphan.webp", createdAt: old },
                { alias: "active.webp", createdAt: old },
                { alias: "linked-late.webp", createdAt: old },
                { alias: "young.webp", createdAt: young },
                { alias: "unknown-age.webp" }
            ]
        }),
        deleteAlias: async (alias: string) => {
            deleted.push(alias);
        }
    } as unknown as ImageStorage;

    const result = await createMediaCleanup({
        prisma,
        imageStorage,
        imageResourceRegistry: noReferences()
    }).reconcileOrphans(now);

    assert.deepEqual(deleted, ["orphan.webp"]);
    assert.deepEqual(result, {
        inspected: 3,
        candidates: 2,
        deleted: 1,
        failed: 0
    });
    assert.equal(reads.has("young.webp"), false);
    assert.equal(reads.has("unknown-age.webp"), false);
});

test("retires old unlinked assets without touching linked avatars or recent uploads", async () => {
    let input: unknown;
    let selection: unknown;
    const prisma = {
        student: {
            findMany: async () => [
                {
                    avatarMediaId: "private",
                    id: 42,
                    publicProfileEnabled: false
                }
            ]
        },
        group: {
            findMany: async () => [
                { avatarMediaId: "archived", status: "ARCHIVED" }
            ]
        },
        $transaction: async (work: (db: unknown) => Promise<unknown>) =>
            work(prisma),
        mediaAsset: {
            findMany: async (value: unknown) => {
                selection = value;
                return [
                    { id: "private" },
                    { id: "archived" },
                    { id: "unlinked" }
                ];
            },
            updateMany: async (value: unknown) => {
                input = value;
                return { count: 1 };
            }
        }
    } as unknown as PrismaClient;
    const result = await createMediaCleanup({
        prisma,
        imageStorage: {} as ImageStorage,
        imageResourceRegistry: createAppImageResourceRegistry()
    }).retireUnlinked(now);
    assert.deepEqual(result, { count: 1 });
    assert.deepEqual(selection, {
        where: {
            status: "ACTIVE",
            createdAt: { lt: new Date("2026-10-14T12:00:00Z") }
        },
        select: { id: true },
        orderBy: { id: "asc" },
        take: 50
    });
    assert.deepEqual(input, {
        where: {
            id: { in: ["unlinked"] },
            status: "ACTIVE",
            createdAt: { lt: new Date("2026-10-14T12:00:00Z") }
        },
        data: { status: "PENDING_DELETE", nextDeleteAt: now }
    });
});

function noReferences() {
    return new ImageResourceRegistry([
        { key: "test", findReferences: async () => [] }
    ]);
}

test("cleanup skips references even when private, archived or pending deletion", async () => {
    const fixture = mediaFixture();
    fixture.database.mediaAsset.findMany = (async () => [
        { id: "old-id" },
        { id: "old-group-id" }
    ]) as typeof fixture.database.mediaAsset.findMany;
    fixture.state().groupStatus = "ARCHIVED";
    fixture.storage.deleteAlias = async () =>
        assert.fail("Linked media was deleted");
    const result = await createMediaCleanup({
        prisma: fixture.database,
        imageStorage: fixture.storage,
        imageResourceRegistry: fixture.registry
    }).deleteDue(now);
    assert.deepEqual(result, {
        inspected: 2,
        deleted: 0,
        failed: 0,
        skipped: 2
    });
});

test("reference lookup failure prevents retirement and physical deletion", async () => {
    const fixture = mediaFixture();
    fixture.database.mediaAsset.findMany = (async () => [
        { id: "old-id" }
    ]) as typeof fixture.database.mediaAsset.findMany;
    fixture.database.mediaAsset.updateMany = (() =>
        assert.fail(
            "Media mutated after reference failure"
        )) as typeof fixture.database.mediaAsset.updateMany;
    fixture.storage.deleteAlias = async () =>
        assert.fail("Media deleted after reference failure");
    const registry = new ImageResourceRegistry([
        {
            key: "failed",
            findReferences: async () => {
                throw new Error("reference lookup failed");
            }
        }
    ]);
    const cleanup = createMediaCleanup({
        prisma: fixture.database,
        imageStorage: fixture.storage,
        imageResourceRegistry: registry
    });
    await assert.rejects(
        cleanup.retireUnlinked(now),
        /reference lookup failed/
    );
    await assert.rejects(cleanup.deleteDue(now), /reference lookup failed/);
});
