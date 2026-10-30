import type { Principal } from "#/auth.js";
import type { UploadedImage } from "#/media/PictRsClient.js";
import { ConflictError, ForbiddenError, NotFoundError } from "@pomi/api-core";
import type { MyPrisma, PrismaClient, StudentCapability } from "@pomi/db";

export type MediaTarget =
    | { kind: "student-avatar"; studentId: number }
    | {
          kind: "group-avatar";
          groupId: number;
          studentId: number;
      };

export type MediaMutationSnapshot = {
    target: MediaTarget;
    mediaId: string | null;
    revision: number;
};

type PermissionClient = Pick<
    MyPrisma.TransactionClient,
    "authUser" | "botGrant" | "groupMembershipRole"
>;

async function hasStudentAccess(
    database: PermissionClient,
    principal: Principal | undefined,
    studentId: number,
    capability: StudentCapability
) {
    if (!principal) return false;
    const user = await database.authUser.findUnique({
        where: { id: principal.authUserId },
        select: {
            status: true,
            studentId: true,
            roles: { select: { role: true } }
        }
    });
    if (!user || user.status !== "ACTIVE") return false;
    if (user.roles.some(({ role }) => role === "ADMIN")) return true;
    if (user.studentId === studentId) return true;
    if (user.roles.some(({ role }) => role === "BOT")) {
        const grant = await database.botGrant.findFirst({
            where: {
                studentId,
                botAuthUserId: principal.authUserId,
                capability,
                revokedAt: null
            },
            select: { id: true }
        });
        if (grant) return true;
    }
    return false;
}

async function requireEditPermission(
    database: PermissionClient,
    principal: Principal | undefined,
    target: MediaTarget
) {
    if (
        !(await hasStudentAccess(
            database,
            principal,
            target.studentId,
            "STUDENT_PROFILE_WRITE"
        ))
    ) {
        throw new ForbiddenError("Acesso não permitido.");
    }
    if (target.kind === "student-avatar") return;
    const granted = await database.groupMembershipRole.findFirst({
        where: {
            groupId: target.groupId,
            membership: {
                studentId: target.studentId,
                activeKey: "ACTIVE"
            },
            role: { permissions: { some: { permission: "GROUP_EDIT" } } }
        },
        select: { roleId: true }
    });
    if (!granted) {
        throw new ForbiddenError("Permissão insuficiente neste grupo.");
    }
}

async function readSnapshot(
    database: PrismaClient | MyPrisma.TransactionClient,
    target: MediaTarget
): Promise<MediaMutationSnapshot> {
    if (target.kind === "student-avatar") {
        const student = await database.student.findUnique({
            where: { id: target.studentId },
            select: { avatarMediaId: true, avatarRevision: true }
        });
        if (!student) throw new NotFoundError("Estudante não encontrado.");
        return {
            target,
            mediaId: student.avatarMediaId,
            revision: student.avatarRevision
        };
    }
    const group = await database.group.findFirst({
        where: { id: target.groupId, status: "ACTIVE" },
        select: {
            avatarMediaId: true,
            avatarRevision: true
        }
    });
    if (!group) throw new NotFoundError("Grupo não encontrado.");
    return {
        target,
        mediaId: group.avatarMediaId,
        revision: group.avatarRevision
    };
}

async function updateSlot(
    database: MyPrisma.TransactionClient,
    snapshot: MediaMutationSnapshot,
    mediaId: string | null
) {
    const { target, revision } = snapshot;
    let count: number;
    if (target.kind === "student-avatar") {
        const result = await database.student.updateMany({
            where: {
                id: target.studentId,
                avatarMediaId: snapshot.mediaId,
                avatarRevision: revision
            },
            data: {
                avatarMediaId: mediaId,
                avatarRevision: { increment: 1 }
            }
        });
        count = result.count;
    } else {
        const result = await database.group.updateMany({
            where: {
                id: target.groupId,
                status: "ACTIVE",
                avatarMediaId: snapshot.mediaId,
                avatarRevision: revision
            },
            data: {
                avatarMediaId: mediaId,
                avatarRevision: { increment: 1 }
            }
        });
        count = result.count;
    }
    if (count !== 1) {
        throw new ConflictError("A imagem mudou durante a operação.");
    }
    if (snapshot.mediaId) {
        const previous = await database.mediaAsset.updateMany({
            where: { id: snapshot.mediaId, status: "ACTIVE" },
            data: { status: "PENDING_DELETE", nextDeleteAt: new Date() }
        });
        if (previous.count !== 1) {
            throw new ConflictError(
                "A imagem anterior mudou durante a operação."
            );
        }
    }
}

async function serializable<T>(
    database: PrismaClient,
    work: (transaction: MyPrisma.TransactionClient) => Promise<T>
) {
    try {
        return await database.$transaction(work, {
            isolationLevel: "Serializable",
            timeout: 5_000
        });
    } catch (error) {
        if ((error as { code?: string }).code === "P2034") {
            throw new ConflictError("A imagem mudou durante a operação.");
        }
        throw error;
    }
}

export function createMediaService({ prisma }: { prisma: PrismaClient }) {
    return {
        async recordUnlinked(uploaded: UploadedImage) {
            const existing = await prisma.mediaAsset.findUnique({
                where: { alias: uploaded.alias },
                select: { id: true }
            });
            if (existing) return;
            try {
                await prisma.mediaAsset.create({
                    data: {
                        alias: uploaded.alias,
                        contentType: uploaded.contentType,
                        width: uploaded.width,
                        height: uploaded.height,
                        status: "PENDING_DELETE",
                        nextDeleteAt: new Date()
                    }
                });
            } catch (error) {
                if ((error as { code?: string }).code !== "P2002") throw error;
            }
        },
        async resolveRead(principal: Principal | undefined, mediaId: string) {
            const asset = await prisma.mediaAsset.findUnique({
                where: { id: mediaId },
                select: {
                    alias: true,
                    status: true,
                    studentAvatar: {
                        select: { id: true, publicProfileEnabled: true }
                    },
                    groupAvatar: { select: { status: true } }
                }
            });
            if (!asset || asset.status !== "ACTIVE") {
                throw new NotFoundError("Imagem não encontrada.");
            }
            const links = [asset.studentAvatar, asset.groupAvatar].filter(
                Boolean
            );
            if (links.length !== 1) {
                throw new NotFoundError("Imagem não encontrada.");
            }
            if (asset.studentAvatar) {
                if (
                    !asset.studentAvatar.publicProfileEnabled &&
                    !(await hasStudentAccess(
                        prisma,
                        principal,
                        asset.studentAvatar.id,
                        "STUDENT_PROFILE_READ"
                    ))
                ) {
                    throw new NotFoundError("Imagem não encontrada.");
                }
                return { alias: asset.alias };
            }
            if (asset.groupAvatar) {
                if (asset.groupAvatar.status !== "ACTIVE") {
                    throw new NotFoundError("Imagem não encontrada.");
                }
                return { alias: asset.alias };
            }
            throw new NotFoundError("Imagem não encontrada.");
        },
        async prepare(
            principal: Principal | undefined,
            target: MediaTarget
        ): Promise<MediaMutationSnapshot> {
            await requireEditPermission(prisma, principal, target);
            return readSnapshot(prisma, target);
        },
        async activate(
            principal: Principal | undefined,
            snapshot: MediaMutationSnapshot,
            uploaded: UploadedImage
        ) {
            return serializable(prisma, async (transaction) => {
                await requireEditPermission(
                    transaction,
                    principal,
                    snapshot.target
                );
                const current = await readSnapshot(
                    transaction,
                    snapshot.target
                );
                if (
                    current.revision !== snapshot.revision ||
                    current.mediaId !== snapshot.mediaId
                ) {
                    throw new ConflictError("A imagem mudou durante o upload.");
                }
                const created = await transaction.mediaAsset.create({
                    data: {
                        alias: uploaded.alias,
                        contentType: uploaded.contentType,
                        width: uploaded.width,
                        height: uploaded.height
                    },
                    select: { id: true }
                });
                await updateSlot(transaction, snapshot, created.id);
                return { mediaId: created.id, revision: snapshot.revision + 1 };
            });
        },
        async remove(
            principal: Principal | undefined,
            snapshot: MediaMutationSnapshot
        ) {
            return serializable(prisma, async (transaction) => {
                await requireEditPermission(
                    transaction,
                    principal,
                    snapshot.target
                );
                const current = await readSnapshot(
                    transaction,
                    snapshot.target
                );
                if (
                    current.revision !== snapshot.revision ||
                    current.mediaId !== snapshot.mediaId
                ) {
                    throw new ConflictError(
                        "A imagem mudou durante a operação."
                    );
                }
                await updateSlot(transaction, snapshot, null);
                return { revision: snapshot.revision + 1 };
            });
        }
    };
}

export type MediaService = ReturnType<typeof createMediaService>;
