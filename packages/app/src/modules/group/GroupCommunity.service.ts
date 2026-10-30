import {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError
} from "@pomi/api-core";
import type { GroupPermission, MyPrisma, PrismaClient } from "@pomi/db";
import type z from "zod";
import type IO from "./GroupCommunity.contract.js";

type MemberPatch = z.infer<typeof IO.patchManagedMembership.request>["body"];
type EventInput = z.infer<typeof IO.createEvent.request>["body"];
type EventPatch = z.infer<typeof IO.patchEvent.request>["body"];
type RolePatch = z.infer<typeof IO.patchRole.request>["body"];
type Permission = GroupPermission;

const membershipInclude = {
    student: {
        select: {
            name: true,
            publicId: true,
            publicProfileEnabled: true,
            publicDisplayName: true,
            avatarMediaId: true,
            authUsers: {
                where: { status: "ACTIVE" as const },
                select: { id: true },
                take: 1
            }
        }
    },
    positions: {
        orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }]
    },
    roles: { include: { role: { include: { permissions: true } } } }
};
const eventInclude = {
    tags: { include: { tag: true }, orderBy: { tagId: "asc" as const } }
};
const roleInclude = { permissions: true };

type Membership = MyPrisma.GroupMembershipGetPayload<{
    include: typeof membershipInclude;
}>;
type Event = MyPrisma.GroupEventGetPayload<{ include: typeof eventInclude }>;
type Role = MyPrisma.GroupRoleGetPayload<{ include: typeof roleInclude }>;
const date = (value: Date | null) => value?.toISOString() ?? null;

function memberBase(value: Membership) {
    return {
        id: value.id,
        groupId: value.groupId,
        joinedAt: value.joinedAt.toISOString(),
        positions: value.positions.map((position) => ({
            id: position.id,
            title: position.title,
            startedAt: date(position.startedAt),
            endedAt: date(position.endedAt),
            sortOrder: position.sortOrder
        }))
    };
}
function publicMember(value: Membership) {
    return {
        ...memberBase(value),
        displayName:
            value.student.publicProfileEnabled && value.student.authUsers.length
                ? (value.student.publicDisplayName ?? value.student.name)
                : value.student.name,
        profilePublicId:
            value.student.publicProfileEnabled && value.student.authUsers.length
                ? value.student.publicId
                : null,
        avatarMediaId:
            value.student.publicProfileEnabled && value.student.authUsers.length
                ? value.student.avatarMediaId
                : null
    };
}
function ownMember(value: Membership) {
    return {
        ...memberBase(value),
        studentId: value.studentId,
        isPublic: value.isPublic,
        leftAt: date(value.leftAt),
        roles: value.roles.map(({ role }) => ({
            id: role.id,
            name: role.name
        })),
        permissions: [
            ...new Set(
                value.roles.flatMap(({ role }) =>
                    role.permissions.map(({ permission }) => permission)
                )
            )
        ].sort()
    };
}
function managedMember(value: Membership) {
    return {
        ...ownMember(value),
        studentName: value.student.name,
        avatarMediaId: publicMember(value).avatarMediaId
    };
}
function publicEvent(value: Event) {
    return {
        id: value.id,
        groupId: value.groupId,
        name: value.name,
        description: value.description,
        startsAt: date(value.startsAt),
        endsAt: date(value.endsAt),
        location: value.location,
        tags: value.tags.map(({ tag }) => ({
            id: tag.id,
            name: tag.name,
            categoryId: tag.categoryId
        })),
        createdAt: value.createdAt.toISOString(),
        updatedAt: value.updatedAt.toISOString()
    };
}
function managedEvent(value: Event) {
    return { ...publicEvent(value), status: value.status };
}
function role(value: Role) {
    return {
        id: value.id,
        groupId: value.groupId,
        name: value.name,
        permissions: value.permissions.map(({ permission }) => permission)
    };
}
function invitation(value: {
    id: number;
    groupId: number;
    recipientStudentId: number;
    inviterStudentId: number;
    status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
    expiresAt: Date;
    createdAt: Date;
    respondedAt: Date | null;
}) {
    return {
        id: value.id,
        groupId: value.groupId,
        recipientStudentId: value.recipientStudentId,
        inviterStudentId: value.inviterStudentId,
        status:
            value.status === "PENDING" && value.expiresAt <= new Date()
                ? ("EXPIRED" as const)
                : value.status,
        expiresAt: value.expiresAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
        respondedAt: date(value.respondedAt)
    };
}

async function requirePermission(
    prisma: PrismaClient,
    groupId: number,
    studentId: number,
    permission: Permission | Permission[]
) {
    if (
        !(await prisma.group.count({
            where: { id: groupId, status: "ACTIVE" }
        }))
    )
        throw new NotFoundError("Grupo não encontrado.");
    const found = await prisma.groupMembershipRole.findFirst({
        where: {
            groupId,
            membership: { studentId, activeKey: "ACTIVE" },
            role: {
                permissions: {
                    some: {
                        permission: {
                            in: Array.isArray(permission)
                                ? permission
                                : [permission]
                        }
                    }
                }
            }
        },
        select: { roleId: true }
    });
    if (!found) throw new ForbiddenError("Permissão insuficiente neste grupo.");
}
async function requireTags(prisma: PrismaClient, ids: number[]) {
    if (ids.length !== new Set(ids).size)
        throw new ConflictError("Tag repetida.");
    if ((await prisma.tag.count({ where: { id: { in: ids } } })) !== ids.length)
        throw new NotFoundError("Tag não encontrada.");
}
async function requireManagerRemains(
    prisma: Pick<MyPrisma.TransactionClient, "groupMembershipRole">,
    groupId: number,
    excludedMembershipId?: number,
    excludedRoleIds: number[] = []
) {
    const other = await prisma.groupMembershipRole.findFirst({
        where: {
            groupId,
            membershipId:
                excludedMembershipId === undefined
                    ? undefined
                    : { not: excludedMembershipId },
            membership: { activeKey: "ACTIVE" },
            roleId: excludedRoleIds.length
                ? { notIn: excludedRoleIds }
                : undefined,
            role: { permissions: { some: { permission: "ROLE_MANAGE" } } }
        },
        select: { membershipId: true }
    });
    if (!other)
        throw new ConflictError("O grupo precisa manter um gestor de roles.");
}

async function serializable<T>(
    prisma: PrismaClient,
    work: (tx: MyPrisma.TransactionClient) => Promise<T>
) {
    try {
        return await prisma.$transaction(work, {
            isolationLevel: "Serializable"
        });
    } catch (error) {
        if ((error as { code?: string }).code === "P2034")
            throw new ConflictError(
                "O grupo mudou durante a operação. Tente novamente."
            );
        throw error;
    }
}

export function createGroupCommunityService({
    prisma
}: {
    prisma: PrismaClient;
}) {
    async function loadMember(id: number) {
        const value = await prisma.groupMembership.findUnique({
            where: { id },
            include: membershipInclude
        });
        if (!value) throw new NotFoundError("Vínculo não encontrado.");
        return value;
    }
    async function loadEvent(id: number) {
        const value = await prisma.groupEvent.findUnique({
            where: { id },
            include: eventInclude
        });
        if (!value) throw new NotFoundError("Evento não encontrado.");
        return value;
    }
    async function loadRole(id: number) {
        const value = await prisma.groupRole.findUnique({
            where: { id },
            include: roleInclude
        });
        if (!value) throw new NotFoundError("Role não encontrada.");
        return value;
    }
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
            const value = await loadMember(id);
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
            const value = await loadMember(id);
            if (value.studentId !== studentId)
                throw new NotFoundError("Vínculo não encontrado.");
            return ownMember(value);
        },
        async patchOwnMembership(
            studentId: number,
            id: number,
            isPublic: boolean
        ) {
            const value = await loadMember(id);
            if (value.studentId !== studentId)
                throw new NotFoundError("Vínculo não encontrado.");
            if (value.activeKey !== "ACTIVE" && isPublic)
                throw new ConflictError(
                    "Vínculo encerrado não pode ser publicado."
                );
            await prisma.groupMembership.update({
                where: { id },
                data: { isPublic }
            });
            return ownMember(await loadMember(id));
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
            const value = await loadMember(id);
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
            if (value.activeKey !== "ACTIVE")
                throw new ConflictError("Vínculo encerrado.");
            const roleIds = [
                ...(input.roles?.add ?? []),
                ...(input.roles?.remove ?? [])
            ];
            if (roleIds.length !== new Set(roleIds).size)
                throw new ConflictError("Role repetida na requisição.");
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
            if (positionIds.length !== new Set(positionIds).size)
                throw new ConflictError("Cargo repetido na requisição.");
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
            for (const position of positions) {
                const previous =
                    "id" in position
                        ? value.positions.find(({ id }) => id === position.id)
                        : undefined;
                const start =
                    position.startedAt === undefined
                        ? previous?.startedAt
                        : position.startedAt && new Date(position.startedAt);
                const end =
                    position.endedAt === undefined
                        ? previous?.endedAt
                        : position.endedAt && new Date(position.endedAt);
                if (start && end && end < start)
                    throw new ConflictError("Fim do cargo anterior ao início.");
            }
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
            return managedMember(await loadMember(id));
        },
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
            if (invite.status !== "PENDING" || invite.expiresAt <= new Date())
                throw new ConflictError("Convite não está válido.");
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
            return ownMember(await loadMember(member.id));
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
        },
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
            if (permissions.length !== new Set(permissions).size)
                throw new ConflictError("Permissão repetida.");
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
            const value = await loadRole(id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "ROLE_MANAGE"
            );
            const added = input.permissions?.add ?? [];
            const removed = input.permissions?.remove ?? [];
            if (
                [...added, ...removed].length !==
                new Set([...added, ...removed]).size
            )
                throw new ConflictError("Permissão repetida.");
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
            return role(await loadRole(id));
        },
        async deleteRole(studentId: number, id: number) {
            const value = await loadRole(id);
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
        },
        async listPublicEvents(groupId?: number) {
            return (
                await prisma.groupEvent.findMany({
                    where: {
                        groupId,
                        status: "PUBLISHED",
                        group: { status: "ACTIVE" }
                    },
                    include: eventInclude,
                    orderBy: [{ startsAt: "asc" }, { id: "asc" }]
                })
            ).map(publicEvent);
        },
        async getPublicEvent(id: number) {
            const value = await loadEvent(id);
            if (
                value.status !== "PUBLISHED" ||
                !(await prisma.group.count({
                    where: { id: value.groupId, status: "ACTIVE" }
                }))
            )
                throw new NotFoundError("Evento público não encontrado.");
            return publicEvent(value);
        },
        async listManagedEvents(studentId: number, groupId?: number) {
            if (!groupId)
                throw new BadRequestError("filter[groupId] é obrigatório.");
            await requirePermission(prisma, groupId, studentId, [
                "EVENT_CREATE",
                "EVENT_EDIT",
                "EVENT_PUBLISH"
            ]);
            return (
                await prisma.groupEvent.findMany({
                    where: { groupId },
                    include: eventInclude,
                    orderBy: { id: "asc" }
                })
            ).map(managedEvent);
        },
        async createEvent(
            studentId: number,
            groupId: number,
            input: EventInput
        ) {
            await requirePermission(prisma, groupId, studentId, "EVENT_CREATE");
            await requireTags(prisma, input.tagIds ?? []);
            if (
                input.startsAt &&
                input.endsAt &&
                new Date(input.endsAt) < new Date(input.startsAt)
            )
                throw new ConflictError("Fim do evento anterior ao início.");
            const { tagIds, ...fields } = input;
            const value = await prisma.groupEvent.create({
                data: {
                    ...fields,
                    groupId,
                    tags: { create: (tagIds ?? []).map((tagId) => ({ tagId })) }
                },
                include: eventInclude
            });
            return managedEvent(value);
        },
        async patchEvent(studentId: number, id: number, input: EventPatch) {
            const value = await loadEvent(id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "EVENT_EDIT"
            );
            if (value.status === "CANCELLED")
                throw new ConflictError("Evento cancelado.");
            const added = input.tags?.add ?? [];
            const removed = input.tags?.remove ?? [];
            if (added.some((tagId) => removed.includes(tagId)))
                throw new ConflictError("Tag repetida em operações opostas.");
            await requireTags(prisma, added);
            const { tags: _tags, ...fields } = input;
            const start =
                fields.startsAt === undefined
                    ? value.startsAt
                    : fields.startsAt && new Date(fields.startsAt);
            const end =
                fields.endsAt === undefined
                    ? value.endsAt
                    : fields.endsAt && new Date(fields.endsAt);
            if (start && end && end < start)
                throw new ConflictError("Fim do evento anterior ao início.");
            if (
                value.status === "PUBLISHED" &&
                (!start ||
                    !(fields.name ?? value.name).trim() ||
                    !(fields.description ?? value.description).trim())
            )
                throw new ConflictError(
                    "Evento publicado exige nome, descrição e início."
                );
            await prisma.$transaction(async (tx) => {
                await tx.groupEvent.update({ where: { id }, data: fields });
                if (removed.length)
                    await tx.groupEventTag.deleteMany({
                        where: { eventId: id, tagId: { in: removed } }
                    });
                if (added.length)
                    await tx.groupEventTag.createMany({
                        data: added.map((tagId) => ({ eventId: id, tagId })),
                        skipDuplicates: true
                    });
            });
            return managedEvent(await loadEvent(id));
        },
        async publishEvent(studentId: number, id: number) {
            const value = await loadEvent(id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "EVENT_PUBLISH"
            );
            if (
                value.status !== "DRAFT" ||
                !value.name.trim() ||
                !value.description.trim() ||
                !value.startsAt
            )
                throw new ConflictError(
                    "Evento não está pronto para publicação."
                );
            if (value.endsAt && value.endsAt < value.startsAt)
                throw new ConflictError("Fim do evento anterior ao início.");
            await prisma.groupEvent.update({
                where: { id },
                data: { status: "PUBLISHED" }
            });
            return managedEvent(await loadEvent(id));
        },
        async cancelEvent(studentId: number, id: number) {
            const value = await loadEvent(id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "EVENT_PUBLISH"
            );
            if (value.status !== "PUBLISHED")
                throw new ConflictError(
                    "Somente evento publicado pode ser cancelado."
                );
            await prisma.groupEvent.update({
                where: { id },
                data: { status: "CANCELLED" }
            });
            return managedEvent(await loadEvent(id));
        }
    };
}

export type GroupCommunityService = ReturnType<
    typeof createGroupCommunityService
>;
