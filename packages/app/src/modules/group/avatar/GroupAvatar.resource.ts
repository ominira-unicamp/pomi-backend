import { defineImageResource, imageProfiles } from "#/media/public.js";
import { hasUserAccess } from "#/modules/identity/User.access.js";
import { ForbiddenError, NotFoundError } from "@pomi/api-core";

export type GroupAvatarTarget = { groupId: number; userId: number };
type GroupOwner = { status: string };

export const groupAvatarResource = defineImageResource<
    GroupAvatarTarget,
    GroupOwner
>({
    key: "group-avatar",
    profile: imageProfiles.avatar,
    async authorizeWrite({ db, actor, target }) {
        if (
            !(await hasUserAccess(
                db,
                actor,
                target.userId,
                "USER_PROFILE_WRITE"
            ))
        )
            throw new ForbiddenError("Acesso não permitido.");
        const user = await db.user.findUniqueOrThrow({
            where: { id: target.userId },
            select: { id: true }
        });
        const granted = await db.groupMembershipRole.findFirst({
            where: {
                groupId: target.groupId,
                membership: {
                    userId: user.id,
                    activeKey: "ACTIVE"
                },
                role: { permissions: { some: { permission: "GROUP_EDIT" } } }
            },
            select: { roleId: true }
        });
        if (!granted)
            throw new ForbiddenError("Permissão insuficiente neste grupo.");
    },
    async loadSlot({ db, target }) {
        const group = await db.group.findFirst({
            where: { id: target.groupId, status: "ACTIVE" },
            select: { avatarMediaId: true, avatarRevision: true }
        });
        if (!group) throw new NotFoundError("Grupo não encontrado.");
        return { mediaId: group.avatarMediaId, revision: group.avatarRevision };
    },
    async compareAndSetSlot({ tx, target, expected, nextMediaId }) {
        const updated = await tx.group.updateMany({
            where: {
                id: target.groupId,
                status: "ACTIVE",
                avatarMediaId: expected.mediaId,
                avatarRevision: expected.revision
            },
            data: {
                avatarMediaId: nextMediaId,
                avatarRevision: { increment: 1 }
            }
        });
        return updated.count === 1;
    },
    async findReferences({ db, mediaIds }) {
        const groups = await db.group.findMany({
            where: { avatarMediaId: { in: [...mediaIds] } },
            select: { status: true, avatarMediaId: true }
        });
        return groups.flatMap((group) =>
            group.avatarMediaId
                ? [{ mediaId: group.avatarMediaId, owner: group }]
                : []
        );
    },
    async authorizeRead({ owner }) {
        return owner.status === "ACTIVE";
    }
});
