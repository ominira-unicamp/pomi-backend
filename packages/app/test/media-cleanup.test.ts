import { createMediaCleanup } from "#/media/MediaCleanup.js";
import type { PictRsClient } from "#/media/PictRsClient.js";
import type { PrismaClient } from "@pomi/db";
import assert from "node:assert/strict";
import test from "node:test";

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
    const pictRsClient = {
        deleteAlias: async (alias: string) => {
            deleted.push(alias);
        }
    } as unknown as PictRsClient;

    const result = await createMediaCleanup({ prisma, pictRsClient }).deleteDue(
        now
    );

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
    const pictRsClient = {
        deleteAlias: async () => {
            throw new Error("upstream failed");
        }
    } as unknown as PictRsClient;

    const result = await createMediaCleanup({ prisma, pictRsClient }).deleteDue(
        now
    );

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
    const pictRsClient = {
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
    } as unknown as PictRsClient;

    const result = await createMediaCleanup({
        prisma,
        pictRsClient
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
    const prisma = {
        mediaAsset: {
            updateMany: async (value: unknown) => {
                input = value;
                return { count: 2 };
            }
        }
    } as unknown as PrismaClient;
    const result = await createMediaCleanup({
        prisma,
        pictRsClient: {} as PictRsClient
    }).retireUnlinked(now);
    assert.deepEqual(result, { count: 2 });
    assert.deepEqual(input, {
        where: {
            status: "ACTIVE",
            createdAt: { lt: new Date("2026-10-14T12:00:00Z") },
            studentAvatar: null,
            groupAvatar: null
        },
        data: { status: "PENDING_DELETE", nextDeleteAt: now }
    });
});
