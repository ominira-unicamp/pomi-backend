import { BadRequestError, NotFoundError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import type z from "zod";
import { requirePermission } from "../access/GroupAccess.js";
import { requireManagerRemains } from "../governance/GroupGovernance.js";
import { requireGroupRule } from "../GroupRuleErrors.js";
import { serializable } from "../GroupTransaction.js";
import { loadMember } from "../membership/GroupMembership.queries.js";
import type IO from "./GroupMembership.contract.js";
import {
    managedMember,
    membershipInclude,
    ownMember,
    publicMember
} from "./GroupMembership.presenter.js";
import {
    validateActiveMembership,
    validateMembershipVisibility,
    validatePositionDates,
    validatePositionOperations,
    validateRoleAssignments
} from "./GroupMembership.rules.js";

type MemberPatch = z.infer<typeof IO.patchManagedMembership.request>["body"];
export function createGroupMembershipService({
    prisma
}: {
    prisma: PrismaClient;
}) {
    return {
        async listPublicMemberships(groupId?: number, publicId?: string) {
            const values = await prisma.groupMembership.findMany({
                where: {
                    groupId,
                    isPublic: true,
                    activeKey: "ACTIVE",
                    group: { status: "ACTIVE" },
                    ...(publicId && {
                        student: {
                            publicId,
                            publicProfileEnabled: true,
                            authUsers: { some: { status: "ACTIVE" } }
                        }
                    })
                },
                include: membershipInclude,
                orderBy: { id: "asc" }
            });
            return values.map(publicMember);
        },
        async getPublicMembership(id: number) {
            const value = await loadMember(prisma, id);
            if (
                !value.isPublic ||
                value.activeKey !== "ACTIVE" ||
                !(await prisma.group.count({
                    where: { id: value.groupId, status: "ACTIVE" }
                }))
            )
                throw new NotFoundError("Membro público não encontrado.");
            return publicMember(value);
        },
        async listOwnMemberships(studentId: number, groupId?: number) {
            return (
                await prisma.groupMembership.findMany({
                    where: { studentId, groupId },
                    include: membershipInclude,
                    orderBy: { joinedAt: "desc" }
                })
            ).map(ownMember);
        },
        async getOwnMembership(studentId: number, id: number) {
            const value = await loadMember(prisma, id);
            if (value.studentId !== studentId)
                throw new NotFoundError("Vínculo não encontrado.");
            return ownMember(value);
        },
        async patchOwnMembership(
            studentId: number,
            id: number,
            isPublic: boolean
        ) {
            const value = await loadMember(prisma, id);
            if (value.studentId !== studentId)
                throw new NotFoundError("Vínculo não encontrado.");
            requireGroupRule(
                validateMembershipVisibility(value.activeKey, isPublic)
            );
            await prisma.groupMembership.update({
                where: { id },
                data: { isPublic }
            });
            return ownMember(await loadMember(prisma, id));
        },
        async listManagedMemberships(studentId: number, groupId?: number) {
            if (!groupId)
                throw new BadRequestError("filter[groupId] é obrigatório.");
            await requirePermission(prisma, groupId, studentId, [
                "MEMBER_MANAGE",
                "ROLE_MANAGE"
            ]);
            return (
                await prisma.groupMembership.findMany({
                    where: { groupId },
                    include: membershipInclude,
                    orderBy: { id: "asc" }
                })
            ).map(managedMember);
        },
        async patchManagedMembership(
            studentId: number,
            id: number,
            input: MemberPatch
        ) {
            const value = await loadMember(prisma, id);
            if (
                input.positions ||
                input.leave ||
                (!input.roles && !input.positions)
            )
                await requirePermission(
                    prisma,
                    value.groupId,
                    studentId,
                    "MEMBER_MANAGE"
                );
            if (input.roles)
                await requirePermission(
                    prisma,
                    value.groupId,
                    studentId,
                    "ROLE_MANAGE"
                );
            requireGroupRule(validateActiveMembership(value.activeKey));
            const roleIds = [
                ...(input.roles?.add ?? []),
                ...(input.roles?.remove ?? [])
            ];
            requireGroupRule(validateRoleAssignments(roleIds));
            if (
                (await prisma.groupRole.count({
                    where: { groupId: value.groupId, id: { in: roleIds } }
                })) !== roleIds.length
            )
                throw new NotFoundError("Role não pertence ao grupo.");
            const positionIds = [
                ...(input.positions?.update ?? []).map(({ id }) => id),
                ...(input.positions?.remove ?? [])
            ];
            requireGroupRule(validatePositionOperations(positionIds));
            if (
                (await prisma.groupPosition.count({
                    where: { membershipId: id, id: { in: positionIds } }
                })) !== positionIds.length
            )
                throw new NotFoundError("Cargo não pertence ao vínculo.");
            const positions = [
                ...(input.positions?.add ?? []),
                ...(input.positions?.update ?? [])
            ];
            requireGroupRule(validatePositionDates(value.positions, positions));
            await serializable(prisma, async (tx) => {
                if (input.leave)
                    await requireManagerRemains(tx, value.groupId, id);
                else if (input.roles?.remove?.length)
                    await requireManagerRemains(
                        tx,
                        value.groupId,
                        undefined,
                        input.roles.remove
                    );
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
                            leftAt: new Date(),
                            isPublic: false
                        }
                    });
            });
            return managedMember(await loadMember(prisma, id));
        }
    };
}
export type GroupMembershipService = ReturnType<
    typeof createGroupMembershipService
>;
