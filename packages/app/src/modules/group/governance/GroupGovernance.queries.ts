import type { MyPrisma } from "@pomi/db";
import type { GovernanceChange } from "./GroupGovernance.rules.js";

export async function loadGovernanceFacts(
    prisma: Pick<
        MyPrisma.TransactionClient,
        "groupMembershipRole" | "groupRole"
    >,
    groupId: number,
    change: GovernanceChange
) {
    const assignments = await prisma.groupMembershipRole.findMany({
        where: {
            groupId,
            membership: { activeKey: "ACTIVE" },
            role: { permissions: { some: { permission: "ROLE_MANAGE" } } }
        },
        select: { membershipId: true, roleId: true }
    });
    const addedManagerRoles =
        change.kind === "change-membership" &&
        !change.leave &&
        change.addRoleIds.length
            ? await prisma.groupRole.findMany({
                  where: {
                      groupId,
                      id: { in: [...change.addRoleIds] },
                      permissions: { some: { permission: "ROLE_MANAGE" } }
                  },
                  select: { id: true }
              })
            : [];
    return {
        assignments,
        addedManagerRoleIds: addedManagerRoles.map(({ id }) => id)
    };
}
