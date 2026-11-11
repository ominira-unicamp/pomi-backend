import { defineImageResource, imageProfiles } from "#/media/public.js";
import { hasUserAccess } from "#/modules/identity/User.access.js";
import { ForbiddenError, NotFoundError } from "@pomi/api-core";

export type StudentAvatarTarget = { userId: number };
type StudentOwner = { id: number; publicProfileEnabled: boolean };

export const studentAvatarResource = defineImageResource<
    StudentAvatarTarget,
    StudentOwner
>({
    key: "student-avatar",
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
    },
    async loadSlot({ db, target }) {
        const student = await db.user.findUnique({
            where: { id: target.userId },
            select: { avatarMediaId: true, avatarRevision: true }
        });
        if (!student) throw new NotFoundError("Estudante não encontrado.");
        return {
            mediaId: student.avatarMediaId,
            revision: student.avatarRevision
        };
    },
    async compareAndSetSlot({ tx, target, expected, nextMediaId }) {
        const updated = await tx.user.updateMany({
            where: {
                id: target.userId,
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
        const students = await db.user.findMany({
            where: { avatarMediaId: { in: [...mediaIds] } },
            select: {
                id: true,
                publicProfileEnabled: true,
                avatarMediaId: true
            }
        });
        return students.flatMap((student) =>
            student.avatarMediaId
                ? [{ mediaId: student.avatarMediaId, owner: student }]
                : []
        );
    },
    async authorizeRead({ db, actor, owner }) {
        return (
            owner.publicProfileEnabled ||
            hasUserAccess(db, actor, owner.id, "USER_PROFILE_READ")
        );
    }
});
