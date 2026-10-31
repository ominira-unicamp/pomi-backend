import { ConflictError } from "@pomi/api-core";
import type { MyPrisma } from "@pomi/db";
export async function requireManagerRemains(
    prisma: Pick<MyPrisma.TransactionClient, "groupMembershipRole">,
    groupId: number,
    excludedMembershipId?: number,
    excludedRoleIds: number[] = []
) {
    const other = await prisma.groupMembershipRole.findFirst({
        where: {
            groupId,
            membershipId:
                excludedMembershipId === undefined
                    ? undefined
                    : { not: excludedMembershipId },
            membership: { activeKey: "ACTIVE" },
            roleId: excludedRoleIds.length
                ? { notIn: excludedRoleIds }
                : undefined,
            role: { permissions: { some: { permission: "ROLE_MANAGE" } } }
        },
        select: { membershipId: true }
    });
    if (!other)
        throw new ConflictError("O grupo precisa manter um gestor de roles.");
}
