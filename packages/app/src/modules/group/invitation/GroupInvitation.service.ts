import { BadRequestError, ConflictError, NotFoundError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import { requirePermission } from "../access/GroupAccess.js";
import { requireGroupRule } from "../GroupRuleErrors.js";
import { ownMember } from "../membership/GroupMembership.presenter.js";
import { loadMember } from "../membership/GroupMembership.queries.js";
import { invitation } from "./GroupInvitation.presenter.js";
import { validateInvitationAcceptance } from "./GroupInvitation.rules.js";

export function createGroupInvitationService({
    prisma
}: {
    prisma: PrismaClient;
}) {
    return {
        async listInvitations(studentId: number, groupId?: number) {
            return (
                await prisma.groupInvitation.findMany({
                    where: { recipientStudentId: studentId, groupId },
                    orderBy: { createdAt: "desc" }
                })
            ).map(invitation);
        },
        async listManagedInvitations(studentId: number, groupId?: number) {
            if (!groupId)
                throw new BadRequestError("filter[groupId] é obrigatório.");
            await requirePermission(
                prisma,
                groupId,
                studentId,
                "MEMBER_MANAGE"
            );
            return (
                await prisma.groupInvitation.findMany({
                    where: { groupId },
                    include: {
                        recipient: {
                            select: {
                                name: true,
                                publicId: true,
                                publicProfileEnabled: true,
                                avatarMediaId: true,
                                authUsers: {
                                    where: { status: "ACTIVE" },
                                    select: { id: true },
                                    take: 1
                                }
                            }
                        }
                    },
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
                })
            ).map((value) => ({
                ...invitation(value),
                recipientName: value.recipient.name,
                recipientPublicId: value.recipient.publicId,
                recipientAvatarMediaId:
                    value.recipient.publicProfileEnabled &&
                    value.recipient.authUsers.length
                        ? value.recipient.avatarMediaId
                        : null
            }));
        },
        async createInvitation(
            studentId: number,
            groupId: number,
            recipientPublicId: string
        ) {
            await requirePermission(
                prisma,
                groupId,
                studentId,
                "MEMBER_MANAGE"
            );
            const recipient = await prisma.student.findUnique({
                where: { publicId: recipientPublicId },
                select: { id: true }
            });
            if (!recipient)
                throw new NotFoundError("Estudante não encontrado.");
            const recipientStudentId = recipient.id;
            if (
                await prisma.groupMembership.count({
                    where: {
                        groupId,
                        studentId: recipientStudentId,
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
                            recipientStudentId,
                            status: "PENDING",
                            expiresAt: { lte: new Date() }
                        },
                        data: { status: "EXPIRED", pendingKey: null }
                    });
                    if (
                        await tx.groupInvitation.count({
                            where: {
                                groupId,
                                recipientStudentId,
                                pendingKey: "PENDING"
                            }
                        })
                    )
                        throw new ConflictError("Já existe convite pendente.");
                    return tx.groupInvitation.create({
                        data: {
                            groupId,
                            recipientStudentId,
                            inviterStudentId: studentId,
                            expiresAt: new Date(
                                Date.now() + 14 * 24 * 60 * 60 * 1000
                            )
                        }
                    });
                })
            );
        },
        async acceptInvitation(studentId: number, id: number) {
            const invite = await prisma.groupInvitation.findUnique({
                where: { id }
            });
            if (!invite || invite.recipientStudentId !== studentId)
                throw new NotFoundError("Convite não encontrado.");
            requireGroupRule(
                validateInvitationAcceptance(
                    invite.status,
                    invite.expiresAt,
                    new Date()
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
                        expiresAt: { gt: new Date() }
                    },
                    data: {
                        status: "ACCEPTED",
                        pendingKey: null,
                        respondedAt: new Date()
                    }
                });
                if (updated.count !== 1)
                    throw new ConflictError("Convite não está válido.");
                return tx.groupMembership.create({
                    data: { groupId: invite.groupId, studentId }
                });
            });
            return ownMember(await loadMember(prisma, member.id));
        },
        async declineInvitation(studentId: number, id: number) {
            const updated = await prisma.groupInvitation.updateMany({
                where: { id, recipientStudentId: studentId, status: "PENDING" },
                data: {
                    status: "DECLINED",
                    pendingKey: null,
                    respondedAt: new Date()
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
