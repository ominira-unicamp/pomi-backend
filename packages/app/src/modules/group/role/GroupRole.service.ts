import { BadRequestError, ConflictError } from "@pomi/api-core";
import type { GroupPermission, PrismaClient } from "@pomi/db";
import type z from "zod";
import { requirePermission } from "../access/GroupAccess.js";
import { requireManagerRemains } from "../governance/GroupGovernance.js";
import { requireGroupRule } from "../GroupRuleErrors.js";
import { serializable } from "../GroupTransaction.js";
import { loadRole } from "../role/GroupRole.queries.js";
import type IO from "./GroupRole.contract.js";
import { role, roleInclude } from "./GroupRole.presenter.js";
import { validateRolePermissions } from "./GroupRole.rules.js";

type RolePatch = z.infer<typeof IO.patchRole.request>["body"];
type Permission = GroupPermission;
export function createGroupRoleService({ prisma }: { prisma: PrismaClient }) {
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
        async patchRole(studentId: number, id: number, input: RolePatch) {
            const value = await loadRole(prisma, id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "ROLE_MANAGE"
            );
            const added = input.permissions?.add ?? [];
            const removed = input.permissions?.remove ?? [];
            requireGroupRule(validateRolePermissions(added, removed));
            await serializable(prisma, async (tx) => {
                if (
                    removed.includes("ROLE_MANAGE") &&
                    value.permissions.some(
                        ({ permission }) => permission === "ROLE_MANAGE"
                    )
                )
                    await requireManagerRemains(tx, value.groupId, undefined, [
                        id
                    ]);
                if (input.name !== undefined)
                    await tx.groupRole.update({
                        where: { id },
                        data: { name: input.name }
                    });
                if (removed.length)
                    await tx.groupRolePermission.deleteMany({
                        where: { roleId: id, permission: { in: removed } }
                    });
                if (added.length)
                    await tx.groupRolePermission.createMany({
                        data: added.map((permission) => ({
                            roleId: id,
                            permission
                        })),
                        skipDuplicates: true
                    });
            });
            return role(await loadRole(prisma, id));
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
