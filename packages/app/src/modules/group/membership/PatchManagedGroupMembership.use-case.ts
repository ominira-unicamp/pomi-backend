import type { Clock } from "#/application/Clock.js";
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
import {
    managedMember,
    membershipInclude
} from "./GroupMembership.presenter.js";
import {
    validateActiveMembership,
    validatePositionDates,
    validatePositionOperations,
    validateRoleAssignments
} from "./GroupMembership.rules.js";
import type { MemberPatch } from "./GroupMembership.schemas.js";

export type PatchManagedGroupMembershipFailure =
    | GroupAccessFailure
    | { kind: "conflict" | "concurrent-change"; message: string };
export async function patchManagedGroupMembership(
    { prisma, clock }: { prisma: PrismaClient; clock: Clock },
    { userId, id, input }: { userId: number; id: number; input: MemberPatch }
): Promise<
    Result<ReturnType<typeof managedMember>, PatchManagedGroupMembershipFailure>
> {
    try {
        return await runAtomic<
            ReturnType<typeof managedMember>,
            PatchManagedGroupMembershipFailure
        >(
            prisma,
            async (tx) => {
                const value = await tx.groupMembership.findUnique({
                    where: { id },
                    include: membershipInclude
                });
                if (!value)
                    return err({
                        kind: "not-found",
                        message: "Vínculo não encontrado."
                    });
                if (
                    input.positions ||
                    input.leave ||
                    (!input.roles && !input.positions)
                ) {
                    const access = await checkGroupPermission(
                        tx,
                        value.groupId,
                        userId,
                        "MEMBER_MANAGE"
                    );
                    if (access.isErr()) return err(access.error);
                }
                if (input.roles) {
                    const access = await checkGroupPermission(
                        tx,
                        value.groupId,
                        userId,
                        "ROLE_MANAGE"
                    );
                    if (access.isErr()) return err(access.error);
                }
                const active = validateActiveMembership(value.activeKey);
                if (active.isErr())
                    return err({
                        kind: "conflict",
                        message: active.error.message
                    });
                const roleIds = [
                    ...(input.roles?.add ?? []),
                    ...(input.roles?.remove ?? [])
                ];
                const rolesValid = validateRoleAssignments(roleIds);
                if (rolesValid.isErr())
                    return err({
                        kind: "conflict",
                        message: rolesValid.error.message
                    });
                if (
                    (await tx.groupRole.count({
                        where: { groupId: value.groupId, id: { in: roleIds } }
                    })) !== roleIds.length
                )
                    return err({
                        kind: "not-found",
                        message: "Role não pertence ao grupo."
                    });
                const positionIds = [
                    ...(input.positions?.update ?? []).map(({ id }) => id),
                    ...(input.positions?.remove ?? [])
                ];
                const positionsValid = validatePositionOperations(positionIds);
                if (positionsValid.isErr())
                    return err({
                        kind: "conflict",
                        message: positionsValid.error.message
                    });
                if (
                    (await tx.groupPosition.count({
                        where: { membershipId: id, id: { in: positionIds } }
                    })) !== positionIds.length
                )
                    return err({
                        kind: "not-found",
                        message: "Cargo não pertence ao vínculo."
                    });
                const positions = [
                    ...(input.positions?.add ?? []),
                    ...(input.positions?.update ?? [])
                ];
                const datesValid = validatePositionDates(
                    value.positions,
                    positions
                );
                if (datesValid.isErr())
                    return err({
                        kind: "conflict",
                        message: datesValid.error.message
                    });

                if (input.leave || input.roles?.remove?.length) {
                    const change = {
                        kind: "change-membership" as const,
                        membershipId: id,
                        leave: input.leave === true,
                        addRoleIds: input.roles?.add ?? [],
                        removeRoleIds: input.roles?.remove ?? []
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
                if (input.positions?.remove?.length)
                    await tx.groupPosition.deleteMany({
                        where: {
                            membershipId: id,
                            id: { in: input.positions.remove }
                        }
                    });
                for (const item of input.positions?.update ?? []) {
                    const { id: positionId, ...data } = item;
                    await tx.groupPosition.update({
                        where: { id: positionId },
                        data: {
                            ...data,
                            startedAt:
                                data.startedAt === undefined
                                    ? undefined
                                    : data.startedAt,
                            endedAt:
                                data.endedAt === undefined
                                    ? undefined
                                    : data.endedAt
                        }
                    });
                }
                if (input.positions?.add?.length)
                    await tx.groupPosition.createMany({
                        data: input.positions.add.map((item) => ({
                            membershipId: id,
                            ...item
                        }))
                    });
                if (input.roles?.remove?.length)
                    await tx.groupMembershipRole.deleteMany({
                        where: {
                            membershipId: id,
                            roleId: { in: input.roles.remove }
                        }
                    });
                if (input.roles?.add?.length)
                    await tx.groupMembershipRole.createMany({
                        data: input.roles.add.map((roleId) => ({
                            groupId: value.groupId,
                            membershipId: id,
                            roleId
                        })),
                        skipDuplicates: true
                    });
                if (input.leave)
                    await tx.groupMembership.update({
                        where: { id },
                        data: {
                            activeKey: null,
                            leftAt: clock.now(),
                            isPublic: false
                        }
                    });

                const updated = await tx.groupMembership.findUnique({
                    where: { id },
                    include: membershipInclude
                });
                return updated
                    ? ok(managedMember(updated))
                    : err({
                          kind: "not-found",
                          message: "Vínculo não encontrado."
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
