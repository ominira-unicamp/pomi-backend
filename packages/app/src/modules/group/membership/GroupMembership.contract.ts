import { type IO, OutputBuilder } from "#/Contract.js";
import {
    createPaginationQuerySchema,
    filterDefinition,
    getPaginatedSchema,
    pathSeg,
    resourceFilterSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";
import {
    base,
    entityMeta,
    groupPermission,
    id,
    listQuery,
    publicId,
    publicMeta,
    sid,
    sidId,
    studentBase,
    studentMeta
} from "../Group.http.js";
import { memberPatch } from "./GroupMembership.schemas.js";
export { memberPatch, positionInput } from "./GroupMembership.schemas.js";

export const publicMembershipQuery = createPaginationQuerySchema(
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
export const position = z
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
        avatarMediaId: z.uuid().nullable(),
        joinedAt: z.string().datetime(),
        positions: z.array(position)
    })
    .strict()
    .openapi("PublicGroupMembership", entityMeta("PublicGroupMembership"));
export const ownMembership = publicMembership
    .omit({ displayName: true, profilePublicId: true, avatarMediaId: true })
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
    .extend({ studentName: z.string(), avatarMediaId: z.uuid().nullable() })
    .strict()
    .openapi("ManagedGroupMembership", entityMeta("ManagedGroupMembership"));
export const listPublicMemberships = {
    meta: {
        ...publicMeta({
            operationId: "listPublicGroupMemberships",
            method: "get",
            path: base("group-memberships"),
            sdkAction: "list",
            queryFeatures: { filter: true }
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ query: publicMembershipQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(publicMembership), "Membros públicos")
        .build()
} satisfies IO;
export const getPublicMembership = {
    meta: publicMeta({
        operationId: "getPublicGroupMembership",
        method: "get",
        path: [...base("group-memberships"), pathSeg.param("id")],
        sdkAction: "get",
        queryFeatures: { filter: false }
    }),
    request: z.object({ path: publicId }),
    response: new OutputBuilder()
        .ok(publicMembership, "Membro público")
        .notFound()
        .build()
} satisfies IO;
export const listOwnMemberships = {
    meta: {
        ...studentMeta({
            operationId: "listStudentGroupMemberships",
            method: "get",
            path: studentBase("group-memberships"),
            sdkAction: "list",
            queryFeatures: { filter: true },
            capability: "STUDENT_PROFILE_READ"
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(ownMembership), "Vínculos do estudante")
        .build()
} satisfies IO;
export const getOwnMembership = {
    meta: studentMeta({
        operationId: "getStudentGroupMembership",
        method: "get",
        path: [...studentBase("group-memberships"), pathSeg.param("id")],
        sdkAction: "get",
        queryFeatures: { filter: false },
        capability: "STUDENT_PROFILE_READ"
    }),
    request: z.object({ path: sidId }),
    response: new OutputBuilder()
        .ok(ownMembership, "Vínculo do estudante")
        .notFound()
        .build()
} satisfies IO;
export const patchOwnMembership = {
    meta: studentMeta({
        operationId: "updateStudentGroupMembership",
        method: "patch",
        path: [...studentBase("group-memberships"), pathSeg.param("id")],
        sdkAction: "update",
        queryFeatures: { filter: false },
        capability: "STUDENT_PROFILE_WRITE"
    }),
    request: z.object({
        path: sidId,
        body: z.object({ isPublic: z.boolean() }).strict()
    }),
    response: new OutputBuilder()
        .ok(ownMembership, "Visibilidade atualizada")
        .notFound()
        .build()
} satisfies IO;
export const listManagedMemberships = {
    meta: {
        ...studentMeta({
            operationId: "listManagedGroupMemberships",
            method: "get",
            path: studentBase("managed-group-memberships"),
            sdkAction: "list",
            queryFeatures: { filter: true },
            capability: "STUDENT_PROFILE_READ"
        }),
        pagination: unpaginatedByDefault
    },
    request: z.object({ path: sid, query: listQuery }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(managedMembership), "Membros gerenciados")
        .build()
} satisfies IO;
export const patchManagedMembership = {
    meta: studentMeta({
        operationId: "updateManagedGroupMembership",
        method: "patch",
        path: [
            ...studentBase("managed-group-memberships"),
            pathSeg.param("id")
        ],
        sdkAction: "update",
        queryFeatures: { filter: false },
        capability: "STUDENT_PROFILE_WRITE"
    }),
    request: z.object({ path: sidId, body: memberPatch }),
    response: new OutputBuilder()
        .ok(managedMembership, "Membro atualizado")
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
    patchManagedMembership
};
