import { canonicalUserId } from "#/modules/identity/UserContext.js";
import type { MyPrisma } from "@pomi/db";
const date = (value: Date | null) => value?.toISOString() ?? null;
export const membershipInclude = {
    user: {
        select: {
            name: true,
            id: true,
            studentId: true,
            student: { select: { name: true } },
            publicId: true,
            publicProfileEnabled: true,
            publicDisplayName: true,
            avatarMediaId: true,
            principal: {
                select: {
                    identities: {
                        where: {
                            status: "ACTIVE" as const
                        },
                        take: 1,
                        select: { id: true }
                    }
                }
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
            value.user.publicProfileEnabled &&
            value.user.principal.identities.length
                ? (value.user.publicDisplayName ??
                  value.user.name ??
                  "Usuário do POMI")
                : (value.user.name ?? "Usuário do POMI"),
        profilePublicId:
            value.user.publicProfileEnabled &&
            value.user.principal.identities.length
                ? value.user.publicId
                : null,
        avatarMediaId:
            value.user.publicProfileEnabled &&
            value.user.principal.identities.length
                ? value.user.avatarMediaId
                : null
    };
}
export function ownMember(value: Membership) {
    return {
        ...memberBase(value),
        userId: canonicalUserId(value.user),
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
        studentName: value.user.name ?? "Usuário do POMI",
        avatarMediaId: publicMember(value).avatarMediaId
    };
}
