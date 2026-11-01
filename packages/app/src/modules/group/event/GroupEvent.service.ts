import { BadRequestError, ConflictError, NotFoundError } from "@pomi/api-core";
import type { MyPrisma, PrismaClient } from "@pomi/db";
import type z from "zod";
import { requireGroupRule, requirePermission } from "../Group.problems.js";
import type IO from "./GroupEvent.contract.js";
import {
    eventInclude,
    managedEvent,
    publicEvent
} from "./GroupEvent.presenter.js";
import {
    eventTransitions,
    planEventPatch,
    validateEventCancellation,
    validateEventDates,
    validateEventEditable,
    validateEventPublication,
    validateEventTags
} from "./GroupEvent.rules.js";

type EventInput = z.infer<typeof IO.createEvent.request>["body"];
type EventPatch = z.infer<typeof IO.patchEvent.request>["body"];
async function loadEvent(
    prisma: Pick<MyPrisma.TransactionClient, "groupEvent">,
    id: number
) {
    const value = await prisma.groupEvent.findUnique({
        where: { id },
        include: eventInclude
    });
    if (!value) throw new NotFoundError("Evento não encontrado.");
    return value;
}

async function requireTags(
    prisma: Pick<MyPrisma.TransactionClient, "tag">,
    ids: number[]
) {
    if (ids.length !== new Set(ids).size)
        throw new ConflictError("Tag repetida.");
    if ((await prisma.tag.count({ where: { id: { in: ids } } })) !== ids.length)
        throw new NotFoundError("Tag não encontrada.");
}

export function createGroupEventService({ prisma }: { prisma: PrismaClient }) {
    return {
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
            const value = await loadEvent(prisma, id);
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
            requireGroupRule(validateEventDates(input.startsAt, input.endsAt));
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
            const value = await loadEvent(prisma, id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "EVENT_EDIT"
            );
            requireGroupRule(validateEventEditable(value.status));
            const added = input.tags?.add ?? [];
            const removed = input.tags?.remove ?? [];
            requireGroupRule(validateEventTags(added, removed));
            await requireTags(prisma, added);
            const { tags: _tags, ...fields } = input;
            requireGroupRule(planEventPatch(value, fields));
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
            return managedEvent(await loadEvent(prisma, id));
        },
        async publishEvent(studentId: number, id: number) {
            const value = await loadEvent(prisma, id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "EVENT_PUBLISH"
            );
            requireGroupRule(validateEventPublication(value));
            await prisma.groupEvent.update({
                where: { id },
                data: { status: eventTransitions.publish.to }
            });
            return managedEvent(await loadEvent(prisma, id));
        },
        async cancelEvent(studentId: number, id: number) {
            const value = await loadEvent(prisma, id);
            await requirePermission(
                prisma,
                value.groupId,
                studentId,
                "EVENT_PUBLISH"
            );
            requireGroupRule(validateEventCancellation(value.status));
            await prisma.groupEvent.update({
                where: { id },
                data: { status: eventTransitions.cancel.to }
            });
            return managedEvent(await loadEvent(prisma, id));
        }
    };
}
export type GroupEventService = ReturnType<typeof createGroupEventService>;
