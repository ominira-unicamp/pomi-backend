import type { PrismaClient } from "@pomi/db";

import type { ImageResourceRegistry } from "./ImageResourceRegistry.js";
import type { ImageStorage } from "./ImageStorage.js";

const MAX_DELETE_ATTEMPTS = 8;
const DELETE_BATCH_SIZE = 50;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const MAX_HASH_PAGES = 1_000;

export function createMediaCleanup({
    prisma,
    imageStorage,
    imageResourceRegistry
}: {
    prisma: PrismaClient;
    imageStorage: ImageStorage;
    imageResourceRegistry: ImageResourceRegistry;
}) {
    return {
        async retireUnlinked(now = new Date()): Promise<{ count: number }> {
            const cutoff = new Date(now.getTime() - ORPHAN_GRACE_MS);
            let cursor: string | undefined;
            let count = 0;
            for (;;) {
                const candidates = await prisma.mediaAsset.findMany({
                    where: {
                        status: "ACTIVE",
                        createdAt: { lt: cutoff },
                        ...(cursor ? { id: { gt: cursor } } : {})
                    },
                    select: { id: true },
                    orderBy: { id: "asc" },
                    take: DELETE_BATCH_SIZE
                });
                if (!candidates.length) break;
                count += await prisma.$transaction(
                    async (tx) => {
                        const references =
                            await imageResourceRegistry.findReferences(
                                tx,
                                candidates.map((asset) => asset.id)
                            );
                        const ids = candidates
                            .filter((asset) => !references.has(asset.id))
                            .map((asset) => asset.id);
                        if (!ids.length) return 0;
                        const result = await tx.mediaAsset.updateMany({
                            where: {
                                id: { in: ids },
                                status: "ACTIVE",
                                createdAt: { lt: cutoff }
                            },
                            data: {
                                status: "PENDING_DELETE",
                                nextDeleteAt: now
                            }
                        });
                        return result.count;
                    },
                    { isolationLevel: "Serializable", timeout: 5_000 }
                );
                cursor = candidates[candidates.length - 1].id;
                if (candidates.length < DELETE_BATCH_SIZE) break;
            }
            return { count };
        },
        async deleteDue(now = new Date()) {
            const candidates = await prisma.mediaAsset.findMany({
                where: {
                    status: "PENDING_DELETE",
                    deleteAttempts: { lt: MAX_DELETE_ATTEMPTS },
                    OR: [{ nextDeleteAt: null }, { nextDeleteAt: { lte: now } }]
                },
                select: {
                    id: true,
                    alias: true,
                    deleteAttempts: true,
                    nextDeleteAt: true
                },
                orderBy: { createdAt: "asc" },
                take: DELETE_BATCH_SIZE
            });
            let deleted = 0;
            let failed = 0;
            let skipped = 0;
            const references = await imageResourceRegistry.findReferences(
                prisma,
                candidates.map((asset) => asset.id)
            );
            for (const asset of candidates) {
                if (references.has(asset.id)) {
                    skipped += 1;
                    continue;
                }
                const leaseUntil = new Date(now.getTime() + 2 * 60 * 1000);
                const claimed = await prisma.mediaAsset.updateMany({
                    where: {
                        id: asset.id,
                        status: "PENDING_DELETE",
                        deleteAttempts: asset.deleteAttempts,
                        nextDeleteAt: asset.nextDeleteAt
                    },
                    data: {
                        deleteAttempts: { increment: 1 },
                        nextDeleteAt: leaseUntil
                    }
                });
                if (claimed.count !== 1) {
                    skipped += 1;
                    continue;
                }
                try {
                    await imageStorage.deleteAlias(
                        asset.alias,
                        AbortSignal.timeout(30_000)
                    );
                    await prisma.mediaAsset.updateMany({
                        where: { id: asset.id, status: "PENDING_DELETE" },
                        data: {
                            status: "DELETED",
                            deletedAt: new Date(),
                            nextDeleteAt: null,
                            lastDeleteError: null
                        }
                    });
                    deleted += 1;
                } catch (error) {
                    const attempts = asset.deleteAttempts + 1;
                    const delay = Math.min(
                        24 * 60 * 60 * 1000,
                        60_000 * 2 ** Math.min(attempts, 10)
                    );
                    await prisma.mediaAsset.updateMany({
                        where: { id: asset.id, status: "PENDING_DELETE" },
                        data: {
                            nextDeleteAt:
                                attempts >= MAX_DELETE_ATTEMPTS
                                    ? null
                                    : new Date(now.getTime() + delay),
                            lastDeleteError: String(
                                error instanceof Error ? error.name : "unknown"
                            ).slice(0, 200)
                        }
                    });
                    failed += 1;
                }
            }
            return { inspected: candidates.length, deleted, failed, skipped };
        },

        async reconcileOrphans(now = new Date()) {
            const cutoff = new Date(now.getTime() - ORPHAN_GRACE_MS);
            const seen = new Set<string>();
            const candidates: string[] = [];
            let slug: string | undefined;
            for (let page = 0; page < MAX_HASH_PAGES; page += 1) {
                const result = await imageStorage.listAliases(
                    slug,
                    AbortSignal.timeout(30_000)
                );
                for (const entry of result.aliases) {
                    if (
                        seen.has(entry.alias) ||
                        !entry.createdAt ||
                        entry.createdAt > cutoff
                    ) {
                        continue;
                    }
                    seen.add(entry.alias);
                    const existing = await prisma.mediaAsset.findUnique({
                        where: { alias: entry.alias },
                        select: { id: true }
                    });
                    if (!existing) candidates.push(entry.alias);
                }
                if (!result.next) break;
                if (result.next === slug || page === MAX_HASH_PAGES - 1) {
                    throw new Error(
                        "Paginação de aliases do pict-rs não terminou."
                    );
                }
                slug = result.next;
            }
            let deleted = 0;
            let failed = 0;
            for (const alias of candidates) {
                const existing = await prisma.mediaAsset.findUnique({
                    where: { alias },
                    select: { id: true }
                });
                if (existing) continue;
                try {
                    await imageStorage.deleteAlias(
                        alias,
                        AbortSignal.timeout(30_000)
                    );
                    deleted += 1;
                } catch {
                    failed += 1;
                }
            }
            return {
                inspected: seen.size,
                candidates: candidates.length,
                deleted,
                failed
            };
        }
    };
}
