import { invitationStatus } from "./GroupInvitation.rules.js";
const date = (value: Date | null) => value?.toISOString() ?? null;
export function invitation(value: {
    id: number;
    groupId: number;
    recipientStudentId: number;
    inviterStudentId: number;
    status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
    expiresAt: Date;
    createdAt: Date;
    respondedAt: Date | null;
}) {
    return {
        id: value.id,
        groupId: value.groupId,
        recipientStudentId: value.recipientStudentId,
        inviterStudentId: value.inviterStudentId,
        status: invitationStatus(value.status, value.expiresAt, new Date()),
        expiresAt: value.expiresAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
        respondedAt: date(value.respondedAt)
    };
}
