import { BadRequestError, NotFoundError } from "@pomi/api-core";
import type { PrismaClient } from "@pomi/db";
import type z from "zod";
import { requirePermission } from "../access/GroupAccess.js";
import { loadEvent } from "../event/GroupEvent.queries.js";
import { requireGroupRule } from "../GroupRuleErrors.js";
import { requireTags } from "../GroupTags.js";
import type IO from "./GroupEvent.contract.js";
import {
    eventInclude,
    managedEvent,
    publicEvent
} from "./GroupEvent.presenter.js";
import {
    planEventPatch,
    validateEventCancellation,
    validateEventDates,
    validateEventEditable,
    validateEventPublication,
    validateEventTags
} from "./GroupEvent.rules.js";

type EventInput = z.infer<typeof IO.createEvent.request>["body"];
type EventPatch = z.infer<typeof IO.patchEvent.request>["body"];
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
                data: { status: "PUBLISHED" }
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
                data: { status: "CANCELLED" }
            });
            return managedEvent(await loadEvent(prisma, id));
        }
    };
}
export type GroupEventService = ReturnType<typeof createGroupEventService>;
