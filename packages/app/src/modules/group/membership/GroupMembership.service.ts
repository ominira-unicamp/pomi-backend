import { systemClock, type Clock } from "#/application/Clock.js";
import {
    observeOperation,
    type OperationTelemetry
} from "#/application/OperationTelemetry.js";
import {
    BadRequestError,
    NotFoundError,
    prismaPaginationParams,
    resolvePagination,
    unpaginatedByDefault,
    type PaginationQuery
} from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
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
        async listPublicMemberships(
            groupId?: number,
            publicId?: string,
            query: PaginationQuery = {}
        ) {
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.GroupMembershipWhereInput = {
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
            };
            const total = await prisma.groupMembership.count({ where });
            const values = await prisma.groupMembership.findMany({
                ...prismaPaginationParams(pagination),
                where,
                include: membershipInclude,
                orderBy: { id: "asc" }
            });
            return { items: values.map(publicMember), total, pagination };
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
        async listOwnMemberships(
            userId: number,
            groupId?: number,
            query: PaginationQuery = {}
        ) {
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.GroupMembershipWhereInput = {
                userId,
                groupId
            };
            const total = await prisma.groupMembership.count({ where });
            return {
                items: (
                    await prisma.groupMembership.findMany({
                        ...prismaPaginationParams(pagination),
                        where,
                        include: membershipInclude,
                        orderBy: [{ joinedAt: "desc" }, { id: "asc" }]
                    })
                ).map(ownMember),
                total,
                pagination
            };
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
        async listManagedMemberships(
            userId: number,
            groupId?: number,
            query: PaginationQuery = {}
        ) {
            if (!groupId)
                throw new BadRequestError("filter[groupId] é obrigatório.");
            await requirePermission(prisma, groupId, userId, [
                "MEMBER_MANAGE",
                "ROLE_MANAGE"
            ]);
            const pagination = resolvePagination(query, unpaginatedByDefault);
            const where: MyPrisma.GroupMembershipWhereInput = { groupId };
            const total = await prisma.groupMembership.count({ where });
            return {
                items: (
                    await prisma.groupMembership.findMany({
                        ...prismaPaginationParams(pagination),
                        where,
                        include: membershipInclude,
                        orderBy: { id: "asc" }
                    })
                ).map(managedMember),
                total,
                pagination
            };
        },
        async patchManagedMembership(
            userId: number,
            groupId: number,
            id: number,
            input: MemberPatch
        ) {
            const value = await loadMember(prisma, id);
            if (value.groupId !== groupId)
                throw new NotFoundError("Membro não encontrado.");
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
