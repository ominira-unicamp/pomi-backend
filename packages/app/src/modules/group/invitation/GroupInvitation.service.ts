import { systemClock, type Clock } from "#/application/Clock.js";
import { BadRequestError, ConflictError, NotFoundError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import { requireGroupRule, requirePermission } from "../Group.problems.js";
import { ownMember } from "../membership/GroupMembership.presenter.js";
import { loadMember } from "../membership/GroupMembership.queries.js";
import { invitation, invitationInclude } from "./GroupInvitation.presenter.js";
import { validateInvitationAcceptance } from "./GroupInvitation.rules.js";

export function createGroupInvitationService({
    prisma,
    clock = systemClock
}: {
    prisma: PrismaClient;
    clock?: Clock;
}) {
    return {
        async listInvitations(userId: number, groupId?: number) {
            return (
                await prisma.groupInvitation.findMany({
                    where: { recipientUserId: userId, groupId },
                    include: invitationInclude,
                    orderBy: { createdAt: "desc" }
                })
            ).map((value) => invitation(value, clock.now()));
        },
        async listManagedInvitations(userId: number, groupId?: number) {
            if (!groupId)
                throw new BadRequestError("filter[groupId] é obrigatório.");
            await requirePermission(prisma, groupId, userId, "MEMBER_MANAGE");
            return (
                await prisma.groupInvitation.findMany({
                    where: { groupId },
                    include: invitationInclude,
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
                })
            ).map((value) => ({
                ...invitation(value, clock.now()),
                recipientName: value.recipientUser.name ?? "Usuário do POMI",
                recipientPublicId: value.recipientUser.publicId,
                recipientAvatarMediaId:
                    value.recipientUser.publicProfileEnabled &&
                    value.recipientUser.principal.identities.length
                        ? value.recipientUser.avatarMediaId
                        : null
            }));
        },
        async createInvitation(
            userId: number,
            groupId: number,
            recipientPublicId: string
        ) {
            await requirePermission(prisma, groupId, userId, "MEMBER_MANAGE");
            const recipient = await prisma.user.findUnique({
                where: { publicId: recipientPublicId },
                select: { id: true }
            });
            if (!recipient)
                throw new NotFoundError("Estudante não encontrado.");
            const recipientUserId = recipient.id;
            if (
                await prisma.groupMembership.count({
                    where: {
                        groupId,
                        userId: recipientUserId,
                        activeKey: "ACTIVE"
                    }
                })
            )
                throw new ConflictError("A pessoa já é membro.");
            return invitation(
                await prisma.$transaction(async (tx) => {
                    await tx.groupInvitation.updateMany({
                        where: {
                            groupId,
                            recipientUserId,
                            status: "PENDING",
                            expiresAt: { lte: clock.now() }
                        },
                        data: { status: "EXPIRED", pendingKey: null }
                    });
                    if (
                        await tx.groupInvitation.count({
                            where: {
                                groupId,
                                recipientUserId,
                                pendingKey: "PENDING"
                            }
                        })
                    )
                        throw new ConflictError("Já existe convite pendente.");
                    return tx.groupInvitation.create({
                        include: invitationInclude,
                        data: {
                            groupId,
                            recipientUserId,
                            inviterUserId: userId,
                            expiresAt: new Date(
                                clock.now().getTime() + 14 * 24 * 60 * 60 * 1000
                            )
                        }
                    });
                }),
                clock.now()
            );
        },
        async acceptInvitation(userId: number, id: number) {
            const invite = await prisma.groupInvitation.findUnique({
                where: { id }
            });
            if (!invite || invite.recipientUserId !== userId)
                throw new NotFoundError("Convite não encontrado.");
            requireGroupRule(
                validateInvitationAcceptance(
                    invite.status,
                    invite.expiresAt,
                    clock.now()
                )
            );
            if (
                !(await prisma.group.count({
                    where: { id: invite.groupId, status: "ACTIVE" }
                }))
            )
                throw new ConflictError("Grupo arquivado.");
            const member = await prisma.$transaction(async (tx) => {
                const updated = await tx.groupInvitation.updateMany({
                    where: {
                        id,
                        status: "PENDING",
                        expiresAt: { gt: clock.now() }
                    },
                    data: {
                        status: "ACCEPTED",
                        pendingKey: null,
                        respondedAt: clock.now()
                    }
                });
                if (updated.count !== 1)
                    throw new ConflictError("Convite não está válido.");
                return tx.groupMembership.create({
                    data: { groupId: invite.groupId, userId }
                });
            });
            return ownMember(await loadMember(prisma, member.id));
        },
        async declineInvitation(userId: number, id: number) {
            const updated = await prisma.groupInvitation.updateMany({
                where: { id, recipientUserId: userId, status: "PENDING" },
                data: {
                    status: "DECLINED",
                    pendingKey: null,
                    respondedAt: clock.now()
                }
            });
            if (!updated.count)
                throw new NotFoundError("Convite pendente não encontrado.");
        }
    };
}
export type GroupInvitationService = ReturnType<
    typeof createGroupInvitationService
>;
