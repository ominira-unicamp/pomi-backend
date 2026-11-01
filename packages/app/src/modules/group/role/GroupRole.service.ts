import {
    observeOperation,
    type OperationTelemetry
} from "#/application/OperationTelemetry.js";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
    err,
    ok
} from "@pomi/api-core";
import type { GroupPermission, MyPrisma, PrismaClient } from "@pomi/db";
import type { GroupRuleIssue } from "../Group.errors.js";
import { requireGroupRule, requirePermission } from "../Group.problems.js";
import { role, roleInclude } from "./GroupRole.presenter.js";
import type { RolePatch } from "./GroupRole.schemas.js";
import { patchGroupRole } from "./PatchGroupRole.use-case.js";

type Permission = GroupPermission;
async function loadRole(
    prisma: Pick<MyPrisma.TransactionClient, "groupRole">,
    id: number
) {
    const value = await prisma.groupRole.findUnique({
        where: { id },
        include: roleInclude
    });
    if (!value) throw new NotFoundError("Role não encontrada.");
    return value;
}

function validateRolePermissions(
    added: readonly string[],
    removed: readonly string[] = []
) {
    const permissions = [...added, ...removed];
    return permissions.length !== new Set(permissions).size
        ? err<never, GroupRuleIssue>({
              code: "DUPLICATE_PERMISSION",
              message: "Permissão repetida."
          })
        : ok(undefined);
}

export function createGroupRoleService({
    prisma,
    operationTelemetry
}: {
    prisma: PrismaClient;
    operationTelemetry?: OperationTelemetry;
}) {
    return {
        async listRoles(studentId: number, groupId?: number) {
            if (!groupId)
                throw new BadRequestError("filter[groupId] é obrigatório.");
            await requirePermission(prisma, groupId, studentId, "ROLE_MANAGE");
            return (
                await prisma.groupRole.findMany({
                    where: { groupId },
                    include: roleInclude,
                    orderBy: { id: "asc" }
                })
            ).map(role);
        },
        async createRole(
            studentId: number,
            groupId: number,
            name: string,
            permissions: Permission[]
        ) {
            await requirePermission(prisma, groupId, studentId, "ROLE_MANAGE");
            requireGroupRule(validateRolePermissions(permissions));
            return role(
                await prisma.groupRole.create({
                    data: {
                        groupId,
                        name,
                        permissions: {
                            create: permissions.map((permission) => ({
                                permission
                            }))
                        }
                    },
                    include: roleInclude
                })
            );
        },
        patchRole(studentId: number, id: number, input: RolePatch) {
            return observeOperation(
                "group.role.patch",
                () => patchGroupRole({ prisma }, { studentId, id, input }),
                operationTelemetry
            );
        },
        async deleteRole(studentId: number, id: number) {
            const value = await loadRole(prisma, id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "ROLE_MANAGE"
            );
            if (
                await prisma.groupMembershipRole.count({
                    where: { roleId: id }
                })
            )
                throw new ConflictError("Role atribuída a membros.");
            await prisma.groupRole.delete({ where: { id } });
        }
    };
}
export type GroupRoleService = ReturnType<typeof createGroupRoleService>;
