import type { OperationTelemetry } from "#/application/OperationTelemetry.js";
import { isTransactionConflict } from "#/application/transactions.js";
import type { Principal } from "#/Principal.js";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    UnauthenticatedError
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import { ImageResourceRegistry } from "./ImageResourceRegistry.js";
import type { ImageStorage, StoredImage } from "./ImageStorage.js";
import { MediaUploadLimiter } from "./MediaUploadLimiter.js";
import type {
    ImageResource,
    ImageResourceOperations,
    ImageSlot,
    ImageVariant
} from "./public.js";

export function createMediaService({
    prisma,
    imageResourceRegistry,
    imageStorage,
    mediaUploadLimiter,
    operationTelemetry
}: {
    prisma: PrismaClient;
    imageResourceRegistry: ImageResourceRegistry;
    imageStorage: ImageStorage | undefined;
    mediaUploadLimiter: MediaUploadLimiter;
    operationTelemetry?: OperationTelemetry;
}) {
    function requireStorage() {
        if (!imageStorage)
            throw new ServiceUnavailableError(
                "Serviço de imagens indisponível."
            );
        return imageStorage;
    }

    async function serializable<T>(
        work: (tx: MyPrisma.TransactionClient) => Promise<T>
    ) {
        try {
            return await prisma.$transaction(work, {
                isolationLevel: "Serializable",
                timeout: 5_000
            });
        } catch (error) {
            if (isTransactionConflict(error))
                throw new ConflictError("A imagem mudou durante a operação.");
            throw error;
        }
    }

    async function recordUnlinked(uploaded: StoredImage) {
        const existing = await prisma.mediaAsset.findUnique({
            where: { alias: uploaded.alias },
            select: { id: true }
        });
        if (existing) return;
        try {
            await prisma.mediaAsset.create({
                data: {
                    ...uploaded,
                    status: "PENDING_DELETE",
                    nextDeleteAt: new Date()
                }
            });
        } catch (error) {
            if ((error as { code?: string }).code !== "P2002") throw error;
        }
    }

    async function retirePrevious(
        tx: MyPrisma.TransactionClient,
        snapshot: ImageSlot
    ) {
        if (!snapshot.mediaId) return;
        const previous = await tx.mediaAsset.updateMany({
            where: { id: snapshot.mediaId, status: "ACTIVE" },
            data: { status: "PENDING_DELETE", nextDeleteAt: new Date() }
        });
        if (previous.count !== 1)
            throw new ConflictError(
                "A imagem anterior mudou durante a operação."
            );
    }

    return {
        forResource<Target>(
            resource: ImageResource<Target>
        ): ImageResourceOperations<Target> {
            imageResourceRegistry.assertRegistered(resource);
            return {
                async replace({ actor, target, upload }) {
                    const storage = requireStorage();
                    if (typeof upload.contentType !== "string")
                        throw new BadRequestError(
                            "Envie um arquivo multipart."
                        );
                    await resource.authorizeWrite({
                        db: prisma,
                        actor,
                        target
                    });
                    const expected = await resource.loadSlot({
                        db: prisma,
                        target
                    });
                    if (!actor)
                        throw new UnauthenticatedError(
                            "Autenticação necessária."
                        );
                    const release = mediaUploadLimiter.acquire(
                        actor.authIdentityId
                    );
                    try {
                        const uploaded = await storage.upload(
                            upload,
                            resource.profile
                        );
                        try {
                            const result = await serializable(async (tx) => {
                                await resource.authorizeWrite({
                                    db: tx,
                                    actor,
                                    target
                                });
                                const current = await resource.loadSlot({
                                    db: tx,
                                    target
                                });
                                if (
                                    current.revision !== expected.revision ||
                                    current.mediaId !== expected.mediaId
                                )
                                    throw new ConflictError(
                                        "A imagem mudou durante o upload."
                                    );
                                const created = await tx.mediaAsset.create({
                                    data: uploaded,
                                    select: { id: true }
                                });
                                if (
                                    !(await resource.compareAndSetSlot({
                                        tx,
                                        target,
                                        expected,
                                        nextMediaId: created.id
                                    }))
                                )
                                    throw new ConflictError(
                                        "A imagem mudou durante a operação."
                                    );
                                await retirePrevious(tx, expected);
                                return {
                                    mediaId: created.id,
                                    revision: expected.revision + 1
                                };
                            });
                            operationTelemetry?.({
                                operation: "media.replace",
                                outcome: "completed",
                                stage: "activation"
                            });
                            return result;
                        } catch (error) {
                            try {
                                await recordUnlinked(uploaded);
                                operationTelemetry?.({
                                    operation: "media.replace",
                                    outcome: "recovery-scheduled",
                                    stage: "compensation"
                                });
                            } catch {
                                operationTelemetry?.({
                                    operation: "media.replace",
                                    outcome: "recovery-pending",
                                    stage: "compensation"
                                });
                            }
                            throw error;
                        }
                    } finally {
                        release();
                    }
                },
                async remove({ actor, target }) {
                    await resource.authorizeWrite({
                        db: prisma,
                        actor,
                        target
                    });
                    const expected = await resource.loadSlot({
                        db: prisma,
                        target
                    });
                    return serializable(async (tx) => {
                        await resource.authorizeWrite({
                            db: tx,
                            actor,
                            target
                        });
                        const current = await resource.loadSlot({
                            db: tx,
                            target
                        });
                        if (
                            current.revision !== expected.revision ||
                            current.mediaId !== expected.mediaId
                        )
                            throw new ConflictError(
                                "A imagem mudou durante a operação."
                            );
                        if (
                            !(await resource.compareAndSetSlot({
                                tx,
                                target,
                                expected,
                                nextMediaId: null
                            }))
                        )
                            throw new ConflictError(
                                "A imagem mudou durante a operação."
                            );
                        await retirePrevious(tx, expected);
                        return { revision: expected.revision + 1 };
                    });
                }
            };
        },
        async read(
            actor: Principal | undefined,
            mediaId: string,
            variant: ImageVariant,
            signal: AbortSignal
        ) {
            const asset = await prisma.mediaAsset.findUnique({
                where: { id: mediaId },
                select: { alias: true, status: true }
            });
            if (!asset || asset.status !== "ACTIVE")
                throw new NotFoundError("Imagem não encontrada.");
            const references =
                (
                    await imageResourceRegistry.findReferences(prisma, [
                        mediaId
                    ])
                ).get(mediaId) ?? [];
            if (
                references.length !== 1 ||
                !(await references[0].canRead({ db: prisma, actor }))
            )
                throw new NotFoundError("Imagem não encontrada.");
            return requireStorage().readVariant(asset.alias, variant, signal);
        }
    };
}

export type MediaService = ReturnType<typeof createMediaService>;
