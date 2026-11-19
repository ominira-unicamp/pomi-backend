import { type IO, OutputBuilder } from "#/Contract.js";
import { Capabilities, policies } from "#/auth.js";
import { AdminIdentityManagedByCliProblem } from "#/modules/identity/auth-identity/AuthIdentity.problems.js";
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

const capabilityValues = Object.values(Capabilities) as ["ACADEMIC_WRITE"];
const authIdentityStatusSchema = z
    .enum(["ACTIVE", "DISABLED"])
    .openapi("AuthIdentityStatus", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "AuthIdentityStatus"
        }
    });
const authCapabilitySchema = z
    .enum(capabilityValues)
    .openapi("AuthCapability", {
        "x-pomi-schema": { kind: "value-object", publicName: "AuthCapability" }
    });
const entity = z
    .object({
        id: z.number().int(),
        principalId: z.number().int(),
        userId: z.number().int().nullable(),
        serviceAccountId: z.number().int().nullable(),
        issuer: z.string(),
        subject: z.string(),
        email: z.string().nullable(),
        displayName: z.string().nullable(),
        status: authIdentityStatusSchema,
        roles: z.array(
            z.object({
                authIdentityId: z.number().int(),
                role: z.string()
            })
        ),
        capabilities: z.array(
            z.object({
                authIdentityId: z.number().int(),
                capability: z.string()
            })
        )
    })
    .strict()
    .openapi("AuthIdentityEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "AuthIdentity",
            identityFields: ["id"]
        }
    });
const createBody = z
    .object({
        issuer: z.url(),
        subject: z.string().min(1),
        displayName: z.string().min(1).max(200),
        capabilities: z.array(authCapabilitySchema).default([])
    })
    .strict()
    .openapi("CreateBotAuthIdentityBody", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "CreateBotAuthIdentityBody"
        }
    });
const patchBody = z
    .object({
        status: authIdentityStatusSchema.optional(),
        displayName: z.string().min(1).max(200).optional(),
        capabilities: z.array(authCapabilitySchema).optional()
    })
    .strict()
    .openapi("PatchAuthIdentityBody", {
        "x-pomi-schema": { kind: "input", publicName: "PatchAuthIdentityBody" }
    });
const path = z.object({
    id: pathParam.integer()
});
export const authIdentitySort = defineSort({
    resourceName: "auth users",
    sortableFields: ["id", "displayName", "email", "status"] as const,
    defaultSort: [{ field: "id", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
const list = {
    meta: {
        operationId: "listAuthIdentities",
        sdk: {
            resource: "authIdentities",
            method: "list",
            action: "list" as const
        },
        method: "get" as const,
        path: [pathSeg.literal("admin"), pathSeg.literal("auth-identities")],
        tags: ["auth-identities"],
        authorization: policies.admin,
        queryFeatures: { sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            sort: resourceSortSchema(authIdentitySort).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(entity), "Identidades recuperadas")
        .build()
} satisfies IO;
const create = {
    meta: {
        operationId: "createAuthIdentity",
        sdk: {
            resource: "authIdentities",
            method: "create",
            action: "create" as const
        },
        method: "post" as const,
        path: [pathSeg.literal("admin"), pathSeg.literal("auth-identities")],
        tags: ["auth-identities"],
        authorization: policies.admin
    },
    request: z.object({ body: createBody }),
    response: new OutputBuilder().created(entity, "Bot criado").build()
} satisfies IO;
const patch = {
    meta: {
        operationId: "updateAuthIdentity",
        sdk: {
            resource: "authIdentities",
            method: "update",
            action: "update" as const,
            pathParameters: { id: "authIdentityId" }
        },
        method: "patch" as const,
        path: [
            pathSeg.literal("admin"),
            pathSeg.literal("auth-identities"),
            pathSeg.param("id")
        ],
        tags: ["auth-identities"],
        authorization: policies.admin
    },
    request: z.object({ path, body: patchBody }),
    response: new OutputBuilder()
        .ok(entity, "Identidade atualizada")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Identidade não encontrada"
        )
        .problem(
            403,
            AdminIdentityManagedByCliProblem.schema,
            "Identidade administrada pela linha de comando"
        )
        .build()
} satisfies IO;
export default { schemas: { entity }, list, create, patch };
