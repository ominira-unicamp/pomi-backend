import { type IO, OutputBuilder } from "#/Contract.js";
import {
    getPaginatedSchema,
    pathSeg,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";
import {
    base,
    entityMeta,
    groupQuery,
    id,
    listQuery,
    operations,
    publicId,
    publicMeta,
    publicTag,
    sid,
    sidId,
    studentBase,
    studentMeta
} from "../GroupContractSupport.js";

export const eventBase = z
    .object({
        id,
        groupId: id,
        name: z.string(),
        description: z.string(),
        startsAt: z.string().datetime().nullable(),
        endsAt: z.string().datetime().nullable(),
        location: z.string().nullable(),
        tags: z.array(publicTag),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime()
    })
    .strict();
export const publicEvent = eventBase.openapi(
    "GroupEvent",
    entityMeta("GroupEvent")
);
export const managedEvent = eventBase
    .extend({ status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]) })
    .strict()
    .openapi("ManagedGroupEvent", entityMeta("ManagedGroupEvent"));
export const eventBody = z
    .object({
        name: z.string().trim().min(1).max(160),
        description: z.string().trim(),
        startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
        endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
        location: z.string().trim().max(320).nullable().optional(),
        tagIds: z.array(id).optional()
    })
    .strict();
export const eventPatch = eventBody
    .omit({ tagIds: true })
    .partial()
    .extend({ tags: operations(id).optional() })
    .strict();
export const listPublicEvents = {
    meta: {
        ...publicMeta("listGroupEvents", "get", base("group-events")),
        pagination: unpaginatedByDefault
    },
    request: z.object({ query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(publicEvent), "Eventos públicos")
        .build()
} satisfies IO;
export const getPublicEvent = {
    meta: publicMeta("getGroupEvent", "get", [
        ...base("group-events"),
        pathSeg.param("id")
    ]),
    request: z.object({ path: publicId }),
    response: new OutputBuilder()
        .ok(publicEvent, "Evento público")
        .notFound()
        .build()
} satisfies IO;
export const listManagedEvents = {
    meta: {
        ...studentMeta(
            "listManagedGroupEvents",
            "get",
            studentBase("managed-group-events")
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(managedEvent), "Eventos gerenciados")
        .build()
} satisfies IO;
export const createEvent = {
    meta: studentMeta(
        "createGroupEvent",
        "post",
        studentBase("group-events"),
        true
    ),
    request: z.object({ path: sid, query: groupQuery, body: eventBody }),
    response: new OutputBuilder().created(managedEvent, "Evento criado").build()
} satisfies IO;
export const patchEvent = {
    meta: studentMeta(
        "updateGroupEvent",
        "patch",
        [...studentBase("group-events"), pathSeg.param("id")],
        true
    ),
    request: z.object({ path: sidId, body: eventPatch }),
    response: new OutputBuilder()
        .ok(managedEvent, "Evento atualizado")
        .notFound()
        .build()
} satisfies IO;
export const publishEvent = {
    meta: studentMeta(
        "publishGroupEvent",
        "post",
        [
            ...studentBase("group-events"),
            pathSeg.param("id"),
            pathSeg.literal("publish")
        ],
        true
    ),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .ok(managedEvent, "Evento publicado")
        .notFound()
        .build()
} satisfies IO;
export const cancelEvent = {
    meta: studentMeta(
        "cancelGroupEvent",
        "post",
        [
            ...studentBase("group-events"),
            pathSeg.param("id"),
            pathSeg.literal("cancel")
        ],
        true
    ),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .ok(managedEvent, "Evento cancelado")
        .notFound()
        .build()
} satisfies IO;
export default {
    listPublicEvents,
    getPublicEvent,
    listManagedEvents,
    createEvent,
    patchEvent,
    publishEvent,
    cancelEvent
};
