import { systemClock, type Clock } from "#/application/Clock.js";
import {
    observeOperation,
    type OperationTelemetry
} from "#/application/OperationTelemetry.js";
import { BadRequestError, NotFoundError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import { requireGroupRule, requirePermission } from "../Group.problems.js";
import { loadMember } from "../membership/GroupMembership.queries.js";
import {
    managedMember,
    membershipInclude,
    ownMember,
    publicMember
} from "./GroupMembership.presenter.js";
import { validateMembershipVisibility } from "./GroupMembership.rules.js";
import type { MemberPatch } from "./GroupMembership.schemas.js";
import { patchManagedGroupMembership } from "./PatchManagedGroupMembership.use-case.js";

export function createGroupMembershipService({
    prisma,
    clock = systemClock,
    operationTelemetry
}: {
    prisma: PrismaClient;
    clock?: Clock;
    operationTelemetry?: OperationTelemetry;
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
                        user: {
                            publicId,
                            publicProfileEnabled: true,
                            principal: {
                                identities: {
                                    some: {
                                        status: "ACTIVE"
                                    }
                                }
                            }
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
        async listOwnMemberships(userId: number, groupId?: number) {
            return (
                await prisma.groupMembership.findMany({
                    where: { userId, groupId },
                    include: membershipInclude,
                    orderBy: { joinedAt: "desc" }
                })
            ).map(ownMember);
        },
        async getOwnMembership(userId: number, id: number) {
            const value = await loadMember(prisma, id);
            if (value.userId !== userId)
                throw new NotFoundError("Vínculo não encontrado.");
            return ownMember(value);
        },
        async patchOwnMembership(
            userId: number,
            id: number,
            isPublic: boolean
        ) {
            const value = await loadMember(prisma, id);
            if (value.userId !== userId)
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
        async listManagedMemberships(userId: number, groupId?: number) {
            if (!groupId)
                throw new BadRequestError("filter[groupId] é obrigatório.");
            await requirePermission(prisma, groupId, userId, [
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
        patchManagedMembership(userId: number, id: number, input: MemberPatch) {
            return observeOperation(
                "group.membership.patch",
                () =>
                    patchManagedGroupMembership(
                        { prisma, clock },
                        { userId, id, input }
                    ),
                operationTelemetry
            );
        }
    };
}
export type GroupMembershipService = ReturnType<
    typeof createGroupMembershipService
>;
