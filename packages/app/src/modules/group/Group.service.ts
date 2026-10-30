import { ConflictError, ForbiddenError, NotFoundError } from "@pomi/api-core";
import type { GroupPermission, MyPrisma, PrismaClient } from "@pomi/db";
import type z from "zod";
import type IO from "./Group.contract.js";

type CreateInput = z.infer<typeof IO.create.request>["body"];
type PatchInput = z.infer<typeof IO.patch.request>["body"];

const groupSelection = {
    contacts: {
        orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }]
    },
    links: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
    tags: { include: { tag: true }, orderBy: { tagId: "asc" as const } }
};

async function requireGroupPermission(
    prisma: PrismaClient,
    groupId: number,
    studentId: number,
    permission: GroupPermission
) {
    const granted = await prisma.groupMembershipRole.findFirst({
        where: {
            groupId,
            membership: { studentId, activeKey: "ACTIVE" },
            role: {
                permissions: {
                    some: { permission }
                }
            }
        },
        select: { roleId: true }
    });
    if (!granted)
        throw new ForbiddenError("Permissão insuficiente neste grupo.");
}

async function checkTagIds(prisma: PrismaClient, ids: number[]) {
    if (new Set(ids).size !== ids.length)
        throw new ConflictError("Tag repetida na requisição.");
    const count = await prisma.tag.count({ where: { id: { in: ids } } });
    if (count !== ids.length)
        throw new NotFoundError("Uma ou mais tags não existem.");
}

function serialize(
    group: MyPrisma.GroupGetPayload<{ include: typeof groupSelection }>
) {
    return {
        id: group.id,
        name: group.name,
        description: group.description,
        status: group.status,
        avatarMediaId: group.avatarMediaId,
        contacts: group.contacts.map(
            ({ id, type, label, value, sortOrder }) => ({
                id,
                type,
                label,
                value,
                sortOrder
            })
        ),
        externalLinks: group.links.map(({ id, label, url, sortOrder }) => ({
            id,
            label,
            url,
            sortOrder
        })),
        tags: group.tags.map(({ tag }) => ({
            id: tag.id,
            name: tag.name,
            categoryId: tag.categoryId
        })),
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString()
    };
}

export function createGroupService({ prisma }: { prisma: PrismaClient }) {
    async function load(id: number) {
        const group = await prisma.group.findFirst({
            where: { id, status: "ACTIVE" },
            include: groupSelection
        });
        if (!group) throw new NotFoundError("Grupo não encontrado.");
        return serialize(group);
    }
    return {
        async list() {
            const groups = await prisma.group.findMany({
                where: { status: "ACTIVE" },
                include: groupSelection,
                orderBy: [{ name: "asc" }, { id: "asc" }]
            });
            return groups.map(serialize);
        },
        get: load,
        async create(studentId: number, input: CreateInput) {
            await checkTagIds(prisma, input.tagIds ?? []);
            const group = await prisma.$transaction(async (tx) => {
                const created = await tx.group.create({
                    data: {
                        name: input.name,
                        description: input.description,
                        contacts: { create: input.contacts },
                        links: { create: input.externalLinks },
                        tags: {
                            create: (input.tagIds ?? []).map((tagId) => ({
                                tagId
                            }))
                        }
                    }
                });
                const member = await tx.groupMembership.create({
                    data: { groupId: created.id, studentId }
                });
                const role = await tx.groupRole.create({
                    data: {
                        groupId: created.id,
                        name: "Administração",
                        permissions: {
                            create: [
                                "GROUP_EDIT",
                                "GROUP_TAG_MANAGE",
                                "MEMBER_MANAGE",
                                "ROLE_MANAGE",
                                "EVENT_CREATE",
                                "EVENT_EDIT",
                                "EVENT_PUBLISH"
                            ].map((permission) => ({
                                permission: permission as GroupPermission
                            }))
                        }
                    }
                });
                await tx.groupMembershipRole.create({
                    data: {
                        groupId: created.id,
                        membershipId: member.id,
                        roleId: role.id
                    }
                });
                return created;
            });
            return load(group.id);
        },
        async patch(studentId: number, id: number, input: PatchInput) {
            await load(id);
            if (
                input.name !== undefined ||
                input.description !== undefined ||
                input.contacts ||
                input.externalLinks ||
                !input.tags
            )
                await requireGroupPermission(
                    prisma,
                    id,
                    studentId,
                    "GROUP_EDIT"
                );
            if (input.tags)
                await requireGroupPermission(
                    prisma,
                    id,
                    studentId,
                    "GROUP_TAG_MANAGE"
                );
            const addedTags = input.tags?.add ?? [];
            const removedTags = input.tags?.remove ?? [];
            if (addedTags.some((tagId) => removedTags.includes(tagId)))
                throw new ConflictError(
                    "A mesma tag não pode ser adicionada e removida."
                );
            await checkTagIds(prisma, addedTags);
            await prisma.$transaction(async (tx) => {
                const contactIds = [
                    ...(input.contacts?.update ?? []).map(({ id }) => id),
                    ...(input.contacts?.remove ?? [])
                ];
                const linkIds = [
                    ...(input.externalLinks?.update ?? []).map(({ id }) => id),
                    ...(input.externalLinks?.remove ?? [])
                ];
                if (
                    contactIds.length !== new Set(contactIds).size ||
                    linkIds.length !== new Set(linkIds).size
                )
                    throw new ConflictError("Recurso repetido na requisição.");
                if (
                    contactIds.length !==
                    (await tx.groupContact.count({
                        where: { groupId: id, id: { in: contactIds } }
                    }))
                )
                    throw new NotFoundError("Contato não pertence ao grupo.");
                if (
                    linkIds.length !==
                    (await tx.groupLink.count({
                        where: { groupId: id, id: { in: linkIds } }
                    }))
                )
                    throw new NotFoundError("Link não pertence ao grupo.");
                await tx.group.update({
                    where: { id },
                    data: { name: input.name, description: input.description }
                });
                if (input.contacts?.remove?.length)
                    await tx.groupContact.deleteMany({
                        where: {
                            groupId: id,
                            id: { in: input.contacts.remove }
                        }
                    });
                for (const item of input.contacts?.update ?? []) {
                    const { id: contactId, ...data } = item;
                    await tx.groupContact.update({
                        where: { id: contactId },
                        data
                    });
                }
                if (input.contacts?.add?.length)
                    await tx.groupContact.createMany({
                        data: input.contacts.add.map((contact) => ({
                            groupId: id,
                            ...contact
                        }))
                    });
                if (input.externalLinks?.remove?.length)
                    await tx.groupLink.deleteMany({
                        where: {
                            groupId: id,
                            id: { in: input.externalLinks.remove }
                        }
                    });
                for (const item of input.externalLinks?.update ?? []) {
                    const { id: linkId, ...data } = item;
                    await tx.groupLink.update({ where: { id: linkId }, data });
                }
                if (input.externalLinks?.add?.length)
                    await tx.groupLink.createMany({
                        data: input.externalLinks.add.map((link) => ({
                            groupId: id,
                            ...link
                        }))
                    });
                if (removedTags.length)
                    await tx.groupTag.deleteMany({
                        where: { groupId: id, tagId: { in: removedTags } }
                    });
                if (addedTags.length)
                    await tx.groupTag.createMany({
                        data: addedTags.map((tagId) => ({
                            groupId: id,
                            tagId
                        })),
                        skipDuplicates: true
                    });
            });
            return load(id);
        },
        async archive(studentId: number, id: number) {
            await load(id);
            await requireGroupPermission(prisma, id, studentId, "GROUP_EDIT");
            await prisma.group.update({
                where: { id },
                data: { status: "ARCHIVED" }
            });
        }
    };
}

export type GroupService = ReturnType<typeof createGroupService>;
