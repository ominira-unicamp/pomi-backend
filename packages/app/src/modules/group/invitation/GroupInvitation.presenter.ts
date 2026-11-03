import { requireLegacyStudentId } from "#/modules/identity/LegacyStudentContext.js";
import { invitationStatus } from "./GroupInvitation.rules.js";
const date = (value: Date | null) => value?.toISOString() ?? null;
export function invitation(
    value: {
        id: number;
        groupId: number;
        recipientUser: {
            studentId: number | null;
            legacyStudentId: number | null;
        };
        inviterUser: {
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
        recipientStudentId: requireLegacyStudentId(value.recipientUser),
        inviterStudentId: requireLegacyStudentId(value.inviterUser),
        status: invitationStatus(value.status, value.expiresAt, now),
        expiresAt: value.expiresAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
        respondedAt: date(value.respondedAt)
    };
}

export const invitationInclude = {
    recipientUser: {
        select: {
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
    inviterUser: { select: { studentId: true, legacyStudentId: true } }
} as const;
