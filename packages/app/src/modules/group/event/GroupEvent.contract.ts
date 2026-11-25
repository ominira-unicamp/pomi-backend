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
    groupResourceQuery,
    id,
    listQuery,
    operations,
    publicId,
    publicMeta,
    publicTag,
    studentMeta,
    userGroupBase,
    userGroupEventPath,
    userGroupPath
} from "../Group.http.js";

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
        ...publicMeta({
            operationId: "listGroupEvents",
            method: "get",
            path: base("group-events"),
            sdkAction: "list",
            queryFeatures: { filter: true }
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(publicEvent), "Eventos públicos")
        .build()
} satisfies IO;
export const getPublicEvent = {
    meta: publicMeta({
        operationId: "getGroupEvent",
        method: "get",
        path: [...base("group-events"), pathSeg.param("id")],
        sdkAction: "get",
        queryFeatures: { filter: false }
    }),
    request: z.object({ path: publicId }),
    response: new OutputBuilder()
        .ok(publicEvent, "Evento público")
        .notFound()
        .build()
} satisfies IO;
export const listManagedEvents = {
    meta: {
        ...studentMeta({
            operationId: "listManagedGroupEvents",
            method: "get",
            path: userGroupBase("events"),
            sdkAction: "list",
            queryFeatures: { filter: false },
            capability: "USER_PROFILE_READ"
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: userGroupPath, query: groupResourceQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(managedEvent), "Eventos gerenciados")
        .build()
} satisfies IO;
export const createEvent = {
    meta: studentMeta({
        operationId: "createGroupEvent",
        method: "post",
        path: userGroupBase("events"),
        sdkAction: "create",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({ path: userGroupPath, body: eventBody }),
    response: new OutputBuilder().created(managedEvent, "Evento criado").build()
} satisfies IO;
export const patchEvent = {
    meta: studentMeta({
        operationId: "updateGroupEvent",
        method: "patch",
        path: [...userGroupBase("events"), pathSeg.param("eventId")],
        sdkAction: "update",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({ path: userGroupEventPath, body: eventPatch }),
    response: new OutputBuilder()
        .ok(managedEvent, "Evento atualizado")
        .notFound()
        .build()
} satisfies IO;
export const publishEvent = {
    meta: studentMeta({
        operationId: "publishGroupEvent",
        method: "post",
        path: [
            ...userGroupBase("events"),
            pathSeg.param("eventId"),
            pathSeg.literal("publish")
        ],
        sdkAction: "create",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({ path: userGroupEventPath }),
    response: new OutputBuilder()
        .ok(managedEvent, "Evento publicado")
        .notFound()
        .build()
} satisfies IO;
export const cancelEvent = {
    meta: studentMeta({
        operationId: "cancelGroupEvent",
        method: "post",
        path: [
            ...userGroupBase("events"),
            pathSeg.param("eventId"),
            pathSeg.literal("cancel")
        ],
        sdkAction: "create",
        queryFeatures: { filter: false },
        capability: "USER_PROFILE_WRITE"
    }),
    request: z.object({ path: userGroupEventPath }),
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
