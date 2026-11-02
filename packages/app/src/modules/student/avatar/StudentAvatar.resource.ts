import { defineImageResource, imageProfiles } from "#/media/public.js";
import {
    hasStudentAccess,
    hasUserAccess
} from "#/modules/identity/Student.access.js";
import { ForbiddenError, NotFoundError } from "@pomi/api-core";

export type StudentAvatarTarget = { studentId: number };
type StudentOwner = { id: number; publicProfileEnabled: boolean };

export const studentAvatarResource = defineImageResource<
    StudentAvatarTarget,
    StudentOwner
>({
    key: "student-avatar",
    profile: imageProfiles.avatar,
    async authorizeWrite({ db, actor, target }) {
        if (
            !(await hasStudentAccess(
                db,
                actor,
                target.studentId,
                "STUDENT_PROFILE_WRITE"
            ))
        )
            throw new ForbiddenError("Acesso não permitido.");
    },
    async loadSlot({ db, target }) {
        const student = await db.user.findUnique({
            where: { studentId: target.studentId },
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
                studentId: target.studentId,
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
            hasUserAccess(db, actor, owner.id, "STUDENT_PROFILE_READ")
        );
    }
});
