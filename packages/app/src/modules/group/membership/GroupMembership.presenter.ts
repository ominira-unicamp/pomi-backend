import type { MyPrisma } from "@pomi/db";
const date = (value: Date | null) => value?.toISOString() ?? null;
export const membershipInclude = {
    student: {
        select: {
            name: true,
            publicId: true,
            publicProfileEnabled: true,
            publicDisplayName: true,
            avatarMediaId: true,
            authUsers: {
                where: { status: "ACTIVE" as const },
                select: { id: true },
                take: 1
            }
        }
    },
    positions: {
        orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }]
    },
    roles: { include: { role: { include: { permissions: true } } } }
};
export type Membership = MyPrisma.GroupMembershipGetPayload<{
    include: typeof membershipInclude;
}>;
export function memberBase(value: Membership) {
    return {
        id: value.id,
        groupId: value.groupId,
        joinedAt: value.joinedAt.toISOString(),
        positions: value.positions.map((position) => ({
            id: position.id,
            title: position.title,
            startedAt: date(position.startedAt),
            endedAt: date(position.endedAt),
            sortOrder: position.sortOrder
        }))
    };
}
export function publicMember(value: Membership) {
    return {
        ...memberBase(value),
        displayName:
            value.student.publicProfileEnabled && value.student.authUsers.length
                ? (value.student.publicDisplayName ?? value.student.name)
                : value.student.name,
        profilePublicId:
            value.student.publicProfileEnabled && value.student.authUsers.length
                ? value.student.publicId
                : null,
        avatarMediaId:
            value.student.publicProfileEnabled && value.student.authUsers.length
                ? value.student.avatarMediaId
                : null
    };
}
export function ownMember(value: Membership) {
    return {
        ...memberBase(value),
        studentId: value.studentId,
        isPublic: value.isPublic,
        leftAt: date(value.leftAt),
        roles: value.roles.map(({ role }) => ({
            id: role.id,
            name: role.name
        })),
        permissions: [
            ...new Set(
                value.roles.flatMap(({ role }) =>
                    role.permissions.map(({ permission }) => permission)
                )
            )
        ].sort()
    };
}
export function managedMember(value: Membership) {
    return {
        ...ownMember(value),
        studentName: value.student.name,
        avatarMediaId: publicMember(value).avatarMediaId
    };
}
