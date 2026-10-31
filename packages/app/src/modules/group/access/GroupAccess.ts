import { ForbiddenError, NotFoundError } from "@pomi/api-core";
import type { GroupPermission, MyPrisma } from "@pomi/db";
export async function requirePermission(
    prisma: Pick<MyPrisma.TransactionClient, "group" | "groupMembershipRole">,
    groupId: number,
    studentId: number,
    permission: GroupPermission | GroupPermission[]
) {
    if (
        !(await prisma.group.count({
            where: { id: groupId, status: "ACTIVE" }
        }))
    )
        throw new NotFoundError("Grupo não encontrado.");
    const found = await prisma.groupMembershipRole.findFirst({
        where: {
            groupId,
            membership: { studentId, activeKey: "ACTIVE" },
            role: {
                permissions: {
                    some: {
                        permission: {
                            in: Array.isArray(permission)
                                ? permission
                                : [permission]
                        }
                    }
                }
            }
        },
        select: { roleId: true }
    });
    if (!found) throw new ForbiddenError("Permissão insuficiente neste grupo.");
}
