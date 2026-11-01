import {
    isTransactionConflict,
    runAtomic
} from "#/application/transactions.js";
import { err, ok, type Result } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import {
    checkGroupPermission,
    type GroupAccessFailure
} from "../access/Group.access.js";
import { loadGovernanceFacts } from "../governance/GroupGovernance.queries.js";
import { validateManagerRetention } from "../governance/GroupGovernance.rules.js";
import { role, roleInclude } from "./GroupRole.presenter.js";
import type { RolePatch } from "./GroupRole.schemas.js";

export type PatchGroupRoleFailure =
    | GroupAccessFailure
    | { kind: "conflict" | "concurrent-change"; message: string };
export async function patchGroupRole(
    { prisma }: { prisma: PrismaClient },
    {
        studentId,
        id,
        input
    }: { studentId: number; id: number; input: RolePatch }
): Promise<Result<ReturnType<typeof role>, PatchGroupRoleFailure>> {
    try {
        return await runAtomic<ReturnType<typeof role>, PatchGroupRoleFailure>(
            prisma,
            async (tx) => {
                const value = await tx.groupRole.findUnique({
                    where: { id },
                    include: roleInclude
                });
                if (!value)
                    return err({
                        kind: "not-found",
                        message: "Role não encontrada."
                    });
                const access = await checkGroupPermission(
                    tx,
                    value.groupId,
                    studentId,
                    "ROLE_MANAGE"
                );
                if (access.isErr()) return err(access.error);
                const added = input.permissions?.add ?? [];
                const removed = input.permissions?.remove ?? [];
                const permissions = [...added, ...removed];
                if (permissions.length !== new Set(permissions).size)
                    return err({
                        kind: "conflict",
                        message: "Permissão repetida."
                    });
                if (
                    removed.includes("ROLE_MANAGE") &&
                    value.permissions.some(
                        ({ permission }) => permission === "ROLE_MANAGE"
                    )
                ) {
                    const change = {
                        kind: "remove-manager-permission" as const,
                        roleId: id
                    };
                    const facts = await loadGovernanceFacts(
                        tx,
                        value.groupId,
                        change
                    );
                    const governance = validateManagerRetention(
                        facts.assignments,
                        change,
                        facts.addedManagerRoleIds
                    );
                    if (governance.isErr())
                        return err({
                            kind: "conflict",
                            message: governance.error.message
                        });
                }
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
                const updated = await tx.groupRole.findUnique({
                    where: { id },
                    include: roleInclude
                });
                return updated
                    ? ok(role(updated))
                    : err({
                          kind: "not-found",
                          message: "Role não encontrada."
                      });
            },
            { isolationLevel: "Serializable" }
        );
    } catch (error) {
        if (isTransactionConflict(error))
            return err({
                kind: "concurrent-change",
                message: "O grupo mudou durante a operação. Tente novamente."
            });
        throw error;
    }
}
