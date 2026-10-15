import { policies, StudentCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);
const entityMeta = (publicName: string) => ({
    "x-pomi-schema": {
        kind: "entity",
        publicName,
        identityFields: ["id"]
    } as const
});
const id = z.number().int().positive();
const pathId = pathParam.positiveInteger();
const student = [pathSeg.literal("student"), pathSeg.param("sid")];
const listQuery = createPaginationQuerySchema(unpaginatedByDefault, {
    filter: resourceFilterSchema(
        { groupId: filterDefinition.id({ positive: true }) },
        "grupos",
        "Filtre por filter[groupId]=42.",
        { groupId: 42 }
    ).optional()
});
const publicMembershipQuery = createPaginationQuerySchema(
    unpaginatedByDefault,
    {
        filter: resourceFilterSchema(
            {
                groupId: filterDefinition.id({ positive: true }),
                publicId: filterDefinition.uuid({ operators: ["eq"] })
            },
            "membros públicos de grupos",
            "Filtre por filter[groupId]=42 ou filter[publicId]=UUID.",
            { publicId: "a375fdb0-45d9-4a79-8415-89fcb64157b6" }
        ).optional()
    }
);
const publicTag = z.object({ id, name: z.string(), categoryId: id }).strict();
const groupPermission = z.enum([
    "GROUP_EDIT",
    "GROUP_TAG_MANAGE",
    "MEMBER_MANAGE",
    "ROLE_MANAGE",
    "EVENT_CREATE",
    "EVENT_EDIT",
    "EVENT_PUBLISH"
]);
const position = z
    .object({
        id,
        title: z.string(),
        startedAt: z.string().datetime().nullable(),
        endedAt: z.string().datetime().nullable(),
        sortOrder: z.number().int()
    })
    .strict();
export const publicMembership = z
    .object({
        id,
        groupId: id,
        displayName: z.string(),
        profilePublicId: z.string().uuid().nullable(),
        joinedAt: z.string().datetime(),
        positions: z.array(position)
    })
    .strict()
    .openapi("PublicGroupMembership", entityMeta("PublicGroupMembership"));
export const ownMembership = publicMembership
    .omit({ displayName: true, profilePublicId: true })
    .extend({
        studentId: id,
        isPublic: z.boolean(),
        leftAt: z.string().datetime().nullable(),
        roles: z.array(z.object({ id, name: z.string() }).strict()),
        permissions: z.array(groupPermission)
    })
    .strict()
    .openapi("OwnGroupMembership", entityMeta("OwnGroupMembership"));
export const managedMembership = ownMembership
    .extend({ studentName: z.string() })
    .strict()
    .openapi("ManagedGroupMembership", entityMeta("ManagedGroupMembership"));
const eventBase = z
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
export const role = z
    .object({
        id,
        groupId: id,
        name: z.string(),
        permissions: z.array(z.string())
    })
    .strict()
    .openapi("GroupRole", entityMeta("GroupRole"));
export const invitation = z
    .object({
        id,
        groupId: id,
        recipientStudentId: id,
        inviterStudentId: id,
        status: z.enum([
            "PENDING",
            "ACCEPTED",
            "DECLINED",
            "CANCELLED",
            "EXPIRED"
        ]),
        expiresAt: z.string().datetime(),
        createdAt: z.string().datetime(),
        respondedAt: z.string().datetime().nullable()
    })
    .strict()
    .openapi("GroupInvitation", entityMeta("GroupInvitation"));
export const managedInvitation = invitation
    .extend({
        recipientName: z.string(),
        recipientPublicId: z.string().uuid()
    })
    .strict()
    .openapi("ManagedGroupInvitation", entityMeta("ManagedGroupInvitation"));

const positionInput = z
    .object({
        title: z.string().trim().min(1).max(120),
        startedAt: z.iso.datetime({ offset: true }).nullable().optional(),
        endedAt: z.iso.datetime({ offset: true }).nullable().optional(),
        sortOrder: z.number().int().optional()
    })
    .strict();
const operations = <T extends z.ZodType>(value: T) =>
    z
        .object({
            add: z.array(value).optional(),
            remove: z.array(id).optional()
        })
        .strict();
export const memberPatch = z
    .object({
        positions: z
            .object({
                add: z.array(positionInput).optional(),
                update: z
                    .array(positionInput.partial().extend({ id }))
                    .optional(),
                remove: z.array(id).optional()
            })
            .strict()
            .optional(),
        roles: operations(id).optional(),
        leave: z.boolean().optional()
    })
    .strict();
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
export const rolePatch = z
    .object({
        name: z.string().trim().min(1).max(80).optional(),
        permissions: z
            .object({
                add: z.array(groupPermission).optional(),
                remove: z.array(groupPermission).optional()
            })
            .strict()
            .optional()
    })
    .strict();
const base = (name: string) => [pathSeg.literal(name)];
const studentBase = (name: string) => [...student, pathSeg.literal(name)];
const sdk = (
    name: string,
    method: "get" | "post" | "patch" | "delete",
    path: ReturnType<typeof base>
) => ({
    resource: "groupCommunity",
    method: name,
    action: (name.startsWith("list")
        ? "list"
        : method === "post"
          ? "create"
          : method === "patch"
            ? "update"
            : method === "delete"
              ? "delete"
              : "get") as "list" | "create" | "update" | "delete" | "get",
    pathParameters: Object.fromEntries(
        path
            .filter((segment) => segment.type === "param")
            .map((segment) => [
                segment.name,
                segment.name === "sid" ? "studentId" : segment.name
            ])
    )
});
const publicMeta = (
    name: string,
    method: "get",
    path: ReturnType<typeof base>
) => ({
    operationId: name,
    sdk: sdk(name, method, path),
    method,
    path,
    tags: ["groups"],
    authorization: policies.public,
    queryFeatures: { filter: name.startsWith("list") }
});
const studentMeta = (
    name: string,
    method: "get" | "post" | "patch" | "delete",
    path: ReturnType<typeof studentBase>,
    write = false
) => ({
    operationId: name,
    sdk: sdk(name, method, path),
    method,
    path,
    tags: ["groups"],
    authorization: policies.studentAccess(
        "sid",
        write
            ? StudentCapabilities.PROFILE_WRITE
            : StudentCapabilities.PROFILE_READ
    ),
    queryFeatures: { filter: name.startsWith("list") }
});
const sid = z.object({ sid: pathId });
const sidId = sid.extend({ id: pathId });
const publicId = z.object({ id: pathId });
const groupQuery = z.object({ groupId: pathId }).strict();
const listPublicMemberships = {
    meta: {
        ...publicMeta(
            "listPublicGroupMemberships",
            "get",
            base("group-memberships")
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({ query: publicMembershipQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(publicMembership), "Membros públicos")
        .build()
} satisfies IO;
const getPublicMembership = {
    meta: publicMeta("getPublicGroupMembership", "get", [
        ...base("group-memberships"),
        pathSeg.param("id")
    ]),
    request: z.object({ path: publicId }),
    response: new OutputBuilder()
        .ok(publicMembership, "Membro público")
        .notFound()
        .build()
} satisfies IO;
const listOwnMemberships = {
    meta: {
        ...studentMeta(
            "listStudentGroupMemberships",
            "get",
            studentBase("group-memberships")
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(ownMembership), "Vínculos do estudante")
        .build()
} satisfies IO;
const getOwnMembership = {
    meta: studentMeta("getStudentGroupMembership", "get", [
        ...studentBase("group-memberships"),
        pathSeg.param("id")
    ]),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .ok(ownMembership, "Vínculo do estudante")
        .notFound()
        .build()
} satisfies IO;
const patchOwnMembership = {
    meta: studentMeta(
        "updateStudentGroupMembership",
        "patch",
        [...studentBase("group-memberships"), pathSeg.param("id")],
        true
    ),
    request: z.object({
        path: sidId,
        body: z.object({ isPublic: z.boolean() }).strict()
    }),
    response: new OutputBuilder()
        .ok(ownMembership, "Visibilidade atualizada")
        .notFound()
        .build()
} satisfies IO;
const listManagedMemberships = {
    meta: {
        ...studentMeta(
            "listManagedGroupMemberships",
            "get",
            studentBase("managed-group-memberships")
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(managedMembership), "Membros gerenciados")
        .build()
} satisfies IO;
const patchManagedMembership = {
    meta: studentMeta(
        "updateManagedGroupMembership",
        "patch",
        [...studentBase("managed-group-memberships"), pathSeg.param("id")],
        true
    ),
    request: z.object({ path: sidId, body: memberPatch }),
    response: new OutputBuilder()
        .ok(managedMembership, "Membro atualizado")
        .notFound()
        .build()
} satisfies IO;
const listInvitations = {
    meta: {
        ...studentMeta(
            "listGroupInvitations",
            "get",
            studentBase("group-invitations")
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(invitation), "Convites recebidos")
        .build()
} satisfies IO;
const listManagedInvitations = {
    meta: {
        ...studentMeta(
            "listManagedGroupInvitations",
            "get",
            studentBase("managed-group-invitations")
        ),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(managedInvitation),
            "Convites enviados pelo grupo"
        )
        .build()
} satisfies IO;
const createInvitation = {
    meta: studentMeta(
        "createGroupInvitation",
        "post",
        studentBase("group-invitations"),
        true
    ),
    request: z.object({
        path: sid,
        query: groupQuery,
        body: z.object({ recipientPublicId: z.string().uuid() }).strict()
    }),
    response: new OutputBuilder().created(invitation, "Convite criado").build()
} satisfies IO;
const acceptInvitation = {
    meta: studentMeta(
        "acceptGroupInvitation",
        "post",
        [
            ...studentBase("group-invitations"),
            pathSeg.param("id"),
            pathSeg.literal("accept")
        ],
        true
    ),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .ok(ownMembership, "Convite aceito")
        .notFound()
        .build()
} satisfies IO;
const declineInvitation = {
    meta: studentMeta(
        "declineGroupInvitation",
        "post",
        [
            ...studentBase("group-invitations"),
            pathSeg.param("id"),
            pathSeg.literal("decline")
        ],
        true
    ),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .noContent("Convite recusado")
        .notFound()
        .build()
} satisfies IO;
const listRoles = {
    meta: {
        ...studentMeta("listGroupRoles", "get", studentBase("group-roles")),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(role), "Roles do grupo")
        .build()
} satisfies IO;
const createRole = {
    meta: studentMeta(
        "createGroupRole",
        "post",
        studentBase("group-roles"),
        true
    ),
    request: z.object({
        path: sid,
        query: groupQuery,
        body: z
            .object({
                name: z.string().trim().min(1).max(80),
                permissions: z.array(groupPermission).optional()
            })
            .strict()
    }),
    response: new OutputBuilder().created(role, "Role criada").build()
} satisfies IO;
const patchRole = {
    meta: studentMeta(
        "updateGroupRole",
        "patch",
        [...studentBase("group-roles"), pathSeg.param("id")],
        true
    ),
    request: z.object({ path: sidId, body: rolePatch }),
    response: new OutputBuilder().ok(role, "Role atualizada").notFound().build()
} satisfies IO;
const deleteRole = {
    meta: studentMeta(
        "deleteGroupRole",
        "delete",
        [...studentBase("group-roles"), pathSeg.param("id")],
        true
    ),
    request: z.object({ path: sidId }),
    response: new OutputBuilder().noContent("Role removida").notFound().build()
} satisfies IO;
const listPublicEvents = {
    meta: {
        ...publicMeta("listGroupEvents", "get", base("group-events")),
        pagination: unpaginatedByDefault
    },
    request: z.object({ query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(publicEvent), "Eventos públicos")
        .build()
} satisfies IO;
const getPublicEvent = {
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
const listManagedEvents = {
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
const createEvent = {
    meta: studentMeta(
        "createGroupEvent",
        "post",
        studentBase("group-events"),
        true
    ),
    request: z.object({ path: sid, query: groupQuery, body: eventBody }),
    response: new OutputBuilder().created(managedEvent, "Evento criado").build()
} satisfies IO;
const patchEvent = {
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
const publishEvent = {
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
const cancelEvent = {
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
    listPublicMemberships,
    getPublicMembership,
    listOwnMemberships,
    getOwnMembership,
    patchOwnMembership,
    listManagedMemberships,
    patchManagedMembership,
    listInvitations,
    listManagedInvitations,
    createInvitation,
    acceptInvitation,
    declineInvitation,
    listRoles,
    createRole,
    patchRole,
    deleteRole,
    listPublicEvents,
    getPublicEvent,
    listManagedEvents,
    createEvent,
    patchEvent,
    publishEvent,
    cancelEvent
};
