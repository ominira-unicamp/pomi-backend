import { type IO, OutputBuilder } from "#/Contract.js";
import {
    policies,
    StudentCapabilities,
    type StudentCapability
} from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    ResourceNotFoundProblemSchema,
    resourceSortSchema,
    unpaginatedByDefault
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const capabilities = Object.values(StudentCapabilities) as [
    StudentCapability,
    ...StudentCapability[]
];
const studentCapabilitySchema = z
    .enum(capabilities)
    .openapi("StudentCapability", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "StudentCapability"
        }
    });
const entity = z
    .object({
        id: z.number().int(),
        studentId: z.number().int(),
        botAuthUserId: z.number().int(),
        capability: studentCapabilitySchema,
        createdAt: z.coerce.date(),
        revokedAt: z.coerce.date().nullable(),
        botAuthUser: z.object({
            id: z.number().int(),
            displayName: z.string().nullable()
        })
    })
    .strict()
    .openapi("BotGrantEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "BotGrant",
            identityFields: ["id"]
        }
    });

const bot = z
    .object({ id: z.number().int(), displayName: z.string().nullable() })
    .strict()
    .openapi("BotIdentityEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "BotIdentity",
            identityFields: ["id"]
        }
    });
const path = z.object({
    botAuthUserId: pathParam.integer()
});
const replaceBody = z
    .object({ capabilities: z.array(studentCapabilitySchema) })
    .strict()
    .openapi("ReplaceBotGrantBody", {
        "x-pomi-schema": { kind: "input", publicName: "ReplaceBotGrantBody" }
    });
export const botIdentitySort = defineSort({
    resourceName: "bots",
    sortableFields: ["displayName"] as const,
    defaultSort: [{ field: "displayName", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
export const botGrantSort = defineSort({
    resourceName: "bot grants",
    sortableFields: ["createdAt", "capability", "botDisplayName"] as const,
    defaultSort: [{ field: "createdAt", direction: "desc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const listBots = {
    meta: {
        operationId: "listBots",
        sdk: {
            resource: "bots",
            method: "list",
            action: "list" as const
        },
        method: "get" as const,
        path: [pathSeg.literal("bots")],
        tags: ["bot-grants"],
        authorization: policies.authenticated,
        queryFeatures: { sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            sort: resourceSortSchema(botIdentitySort).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(bot), "Bots ativos recuperados")
        .build()
} satisfies IO;
const list = {
    meta: {
        operationId: "listBotGrants",
        sdk: {
            resource: "botGrants",
            method: "list",
            action: "list" as const
        },
        method: "get" as const,
        path: [pathSeg.literal("me"), pathSeg.literal("bot-grants")],
        tags: ["bot-grants"],
        authorization: policies.authenticated,
        queryFeatures: { sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            sort: resourceSortSchema(botGrantSort).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(entity), "Permissões de bots recuperadas")
        .build()
} satisfies IO;
const replace = {
    meta: {
        operationId: "replaceBotGrant",
        sdk: {
            resource: "botGrants",
            method: "replace",
            action: "update" as const,
            pathParameters: { botAuthUserId: "botAuthUserId" }
        },
        method: "put" as const,
        path: [
            pathSeg.literal("me"),
            pathSeg.literal("bot-grants"),
            pathSeg.param("botAuthUserId")
        ],
        tags: ["bot-grants"],
        authorization: policies.authenticated
    },
    request: z.object({ path, body: replaceBody }),
    response: new OutputBuilder()
        .noContent()
        .problem(404, ResourceNotFoundProblemSchema, "Bot não encontrado")
        .build()
} satisfies IO;

export default {
    schemas: { entity, bot, replaceBody },
    listBots,
    list,
    replace
};
