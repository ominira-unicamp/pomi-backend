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
    operations,
    publicId,
    publicMeta,
    sid,
    sidId,
    studentBase,
    studentMeta
} from "../GroupContractSupport.js";

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
export const positionInput = z
    .object({
        title: z.string().trim().min(1).max(120),
        startedAt: z.iso.datetime({ offset: true }).nullable().optional(),
        endedAt: z.iso.datetime({ offset: true }).nullable().optional(),
        sortOrder: z.number().int().optional()
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
export const listPublicMemberships = {
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
export const getPublicMembership = {
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
export const listOwnMemberships = {
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
export const getOwnMembership = {
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
export const patchOwnMembership = {
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
export const listManagedMemberships = {
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
export const patchManagedMembership = {
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
export default {
    listPublicMemberships,
    getPublicMembership,
    listOwnMemberships,
    getOwnMembership,
    patchOwnMembership,
    listManagedMemberships,
    patchManagedMembership
};
