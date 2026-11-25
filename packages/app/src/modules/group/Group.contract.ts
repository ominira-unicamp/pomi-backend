import { policies, UserCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema,
    ResourceNotFoundProblemSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const id = z.number().int().positive();
const contact = z
    .object({
        id,
        type: z.string(),
        label: z.string().nullable(),
        value: z.string(),
        sortOrder: z.number().int()
    })
    .strict();
const link = z
    .object({
        id,
        label: z.string(),
        url: z.url(),
        sortOrder: z.number().int()
    })
    .strict();
const tag = z.object({ id, name: z.string(), categoryId: id }).strict();
export const groupEntity = z
    .object({
        id,
        name: z.string(),
        description: z.string().nullable(),
        status: z.enum(["ACTIVE", "ARCHIVED"]),
        avatarMediaId: z.uuid().nullable(),
        contacts: z.array(contact),
        externalLinks: z.array(link),
        tags: z.array(tag),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime()
    })
    .strict()
    .openapi("Group", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Group",
            identityFields: ["id"]
        }
    });

const contactInput = z
    .object({
        type: z.string().trim().min(1).max(40),
        label: z.string().trim().max(80).nullable().optional(),
        value: z.string().trim().min(1).max(320),
        sortOrder: z.number().int().optional()
    })
    .strict();
const linkInput = z
    .object({
        label: z.string().trim().min(1).max(80),
        url: z.url().max(2048),
        sortOrder: z.number().int().optional()
    })
    .strict();
const contactUpdate = contactInput.partial().extend({ id });
const linkUpdate = linkInput.partial().extend({ id });
const contactOperations = z
    .object({
        add: z.array(contactInput).optional(),
        update: z.array(contactUpdate).optional(),
        remove: z.array(id).optional()
    })
    .strict();
const linkOperations = z
    .object({
        add: z.array(linkInput).optional(),
        update: z.array(linkUpdate).optional(),
        remove: z.array(id).optional()
    })
    .strict();
const tagOperations = z
    .object({ add: z.array(id).optional(), remove: z.array(id).optional() })
    .strict();

export const createBody = z
    .object({
        name: z.string().trim().min(1).max(160),
        description: z.string().trim().nullable().optional(),
        contacts: z.array(contactInput).optional(),
        externalLinks: z.array(linkInput).optional(),
        tagIds: z.array(id).optional()
    })
    .strict();
export const patchBody = z
    .object({
        name: z.string().trim().min(1).max(160).optional(),
        description: z.string().trim().nullable().optional(),
        contacts: contactOperations.optional(),
        externalLinks: linkOperations.optional(),
        tags: tagOperations.optional()
    })
    .strict();

const base = [pathSeg.literal("groups")];
const studentBase = [
    pathSeg.literal("users"),
    pathSeg.param("userId"),
    pathSeg.literal("groups")
];
const groupPath = z.object({ groupId: pathParam.positiveInteger() });
const studentGroupPath = groupPath.extend({
    userId: pathParam.positiveInteger()
});

const list = {
    meta: {
        operationId: "listGroups",
        sdk: { resource: "groups", method: "list", action: "list" as const },
        method: "get" as const,
        path: base,
        tags: ["groups"],
        authorization: policies.public,
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault)
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(groupEntity), "Grupos recuperados")
        .build()
} satisfies IO;
const get = {
    meta: {
        operationId: "getGroup",
        sdk: {
            resource: "groups",
            method: "get",
            action: "get" as const,
            pathParameters: { groupId: "groupId" }
        },
        method: "get" as const,
        path: [...base, pathSeg.param("groupId")],
        tags: ["groups"],
        authorization: policies.public
    },
    request: z.object({ path: groupPath }),
    response: new OutputBuilder()
        .ok(groupEntity, "Grupo recuperado")
        .problem(404, ResourceNotFoundProblemSchema, "Grupo não encontrado")
        .build()
} satisfies IO;
const create = {
    meta: {
        operationId: "createGroup",
        sdk: {
            resource: "groups",
            method: "create",
            action: "create" as const,
            pathParameters: { userId: "userId" }
        },
        method: "post" as const,
        path: studentBase,
        tags: ["groups"],
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({
        path: z.object({ userId: pathParam.positiveInteger() }),
        body: createBody
    }),
    response: new OutputBuilder()
        .created(groupEntity, "Grupo criado")
        .problem(
            422,
            ReferenceNotFoundProblemSchema,
            "Referência não encontrada"
        )
        .build()
} satisfies IO;
const patch = {
    meta: {
        operationId: "updateGroup",
        sdk: {
            resource: "groups",
            method: "update",
            action: "update" as const,
            pathParameters: { userId: "userId", groupId: "groupId" }
        },
        method: "patch" as const,
        path: [...studentBase, pathSeg.param("groupId")],
        tags: ["groups"],
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({ path: studentGroupPath, body: patchBody }),
    response: new OutputBuilder()
        .ok(groupEntity, "Grupo atualizado")
        .problem(404, ResourceNotFoundProblemSchema, "Grupo não encontrado")
        .problem(
            422,
            ReferenceNotFoundProblemSchema,
            "Referência não encontrada"
        )
        .build()
} satisfies IO;

const archive = {
    meta: {
        operationId: "archiveGroup",
        sdk: {
            resource: "groups",
            method: "archive",
            action: "update" as const,
            pathParameters: { userId: "userId", groupId: "groupId" }
        },
        method: "post" as const,
        path: [
            ...studentBase,
            pathSeg.param("groupId"),
            pathSeg.literal("archive")
        ],
        tags: ["groups"],
        authorization: policies.userAccess(
            "userId",
            UserCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({ path: studentGroupPath }),
    response: new OutputBuilder()
        .noContent("Grupo arquivado")
        .notFound()
        .build()
} satisfies IO;

export default { list, get, create, patch, archive };
