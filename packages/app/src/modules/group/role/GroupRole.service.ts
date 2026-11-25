import {
    observeOperation,
    type OperationTelemetry
} from "#/application/OperationTelemetry.js";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
    err,
    ok,
    prismaPaginationParams,
    resolvePagination,
    unpaginatedByDefault,
    type PaginationQuery
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
        async listRoles(
            userId: number,
            groupId?: number,
            query: PaginationQuery = {}
        ) {
            if (!groupId)
                throw new BadRequestError("filter[groupId] é obrigatório.");
            await requirePermission(prisma, groupId, userId, "ROLE_MANAGE");
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.GroupRoleWhereInput = { groupId };
            const total = await prisma.groupRole.count({ where });
            return {
                items: (
                    await prisma.groupRole.findMany({
                        ...prismaPaginationParams(pagination),
                        where,
                        include: roleInclude,
                        orderBy: { id: "asc" }
                    })
                ).map(role),
                total,
                pagination
            };
        },
        async createRole(
            userId: number,
            groupId: number,
            name: string,
            permissions: Permission[]
        ) {
            await requirePermission(prisma, groupId, userId, "ROLE_MANAGE");
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
        async patchRole(
            userId: number,
            groupId: number,
            id: number,
            input: RolePatch
        ) {
            const value = await loadRole(prisma, id);
            if (value.groupId !== groupId)
                throw new NotFoundError("Role não encontrada.");
            return observeOperation(
                "group.role.patch",
                () => patchGroupRole({ prisma }, { userId, id, input }),
                operationTelemetry
            );
        },
        async deleteRole(userId: number, groupId: number, id: number) {
            const value = await loadRole(prisma, id);
            if (value.groupId !== groupId)
                throw new NotFoundError("Role não encontrada.");
            await requirePermission(
                prisma,
                value.groupId,
                userId,
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
