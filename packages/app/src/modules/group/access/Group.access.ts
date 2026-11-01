import { err, ok } from "@pomi/api-core";
import type { GroupPermission, MyPrisma } from "@pomi/db";
export async function checkGroupPermission(
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
        return err<never, GroupAccessFailure>({
            kind: "not-found",
            message: "Grupo não encontrado."
        });
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
    if (!found)
        return err<never, GroupAccessFailure>({
            kind: "forbidden",
            message: "Permissão insuficiente neste grupo."
        });
    return ok(undefined);
}

export type GroupAccessFailure =
    | { kind: "not-found"; message: string }
    | { kind: "forbidden"; message: string };
