import { canonicalUserId } from "#/modules/identity/UserContext.js";
import { invitationStatus } from "./GroupInvitation.rules.js";
const date = (value: Date | null) => value?.toISOString() ?? null;
export function invitation(
    value: {
        id: number;
        groupId: number;
        recipientUser: {
            id: number;
            studentId: number | null;
            legacyStudentId: number | null;
        };
        inviterUser: {
            id: number;
            studentId: number | null;
            legacyStudentId: number | null;
        };
        status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
        expiresAt: Date;
        createdAt: Date;
        respondedAt: Date | null;
    },
    now: Date
) {
    return {
        id: value.id,
        groupId: value.groupId,
        recipientUserId: canonicalUserId(value.recipientUser),
        inviterUserId: canonicalUserId(value.inviterUser),
        status: invitationStatus(value.status, value.expiresAt, now),
        expiresAt: value.expiresAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
        respondedAt: date(value.respondedAt)
    };
}

export const invitationInclude = {
    recipientUser: {
        select: {
            id: true,
            studentId: true,
            legacyStudentId: true,
            name: true,
            student: { select: { name: true } },
            publicId: true,
            publicProfileEnabled: true,
            avatarMediaId: true,
            principal: {
                select: {
                    identities: {
                        where: {
                            status: "ACTIVE" as const
                        },
                        select: { id: true },
                        take: 1
                    }
                }
            }
        }
    },
    inviterUser: {
        select: { id: true, studentId: true, legacyStudentId: true }
    }
} as const;
