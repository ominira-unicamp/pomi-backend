import { type IO, OutputBuilder } from "#/Contract.js";
import { Capabilities, policies } from "#/auth.js";
import { AdminIdentityManagedByCliProblem } from "#/modules/identity/auth-user/AuthUser.problems.js";
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
const authUserStatusSchema = z
    .enum(["ACTIVE", "DISABLED"])
    .openapi("AuthUserStatus", {
        "x-pomi-schema": { kind: "value-object", publicName: "AuthUserStatus" }
    });
const authCapabilitySchema = z
    .enum(capabilityValues)
    .openapi("AuthCapability", {
        "x-pomi-schema": { kind: "value-object", publicName: "AuthCapability" }
    });
const entity = z
    .object({
        id: z.number().int(),
        issuer: z.string(),
        subject: z.string(),
        email: z.string().nullable(),
        displayName: z.string().nullable(),
        status: authUserStatusSchema,
        roles: z.array(
            z.object({
                authUserId: z.number().int(),
                role: z.string()
            })
        ),
        capabilities: z.array(
            z.object({
                authUserId: z.number().int(),
                capability: z.string()
            })
        )
    })
    .strict()
    .openapi("AuthUserEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "AuthUser",
            identityFields: ["id"]
        }
    });
const createBody = z
    .object({
        subject: z.string().min(1),
        displayName: z.string().min(1).max(200),
        capabilities: z.array(authCapabilitySchema).default([])
    })
    .strict()
    .openapi("CreateBotAuthUserBody", {
        "x-pomi-schema": { kind: "input", publicName: "CreateBotAuthUserBody" }
    });
const patchBody = z
    .object({
        status: authUserStatusSchema.optional(),
        displayName: z.string().min(1).max(200).optional(),
        capabilities: z.array(authCapabilitySchema).optional()
    })
    .strict()
    .openapi("PatchAuthUserBody", {
        "x-pomi-schema": { kind: "input", publicName: "PatchAuthUserBody" }
    });
const path = z.object({
    id: pathParam.integer()
});
export const authUserSort = defineSort({
    resourceName: "auth users",
    sortableFields: ["id", "displayName", "email", "status"] as const,
    defaultSort: [{ field: "id", direction: "asc" }] as const,
    tieBreakers: [] as const
});
const list = {
    meta: {
        operationId: "listAuthUsers",
        sdk: {
            resource: "authUsers",
            method: "list",
            action: "list" as const
        },
        method: "get" as const,
        path: [pathSeg.literal("admin"), pathSeg.literal("auth-users")],
        tags: ["auth-users"],
        authorization: policies.admin,
        queryFeatures: { sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            sort: resourceSortSchema(authUserSort).optional()
        })
    }),
    response: new OutputBuilder()
        .ok(getPaginatedSchema(entity), "Identidades recuperadas")
        .build()
} satisfies IO;
const create = {
    meta: {
        operationId: "createAuthUser",
        sdk: {
            resource: "authUsers",
            method: "create",
            action: "create" as const
        },
        method: "post" as const,
        path: [pathSeg.literal("admin"), pathSeg.literal("auth-users")],
        tags: ["auth-users"],
        authorization: policies.admin
    },
    request: z.object({ body: createBody }),
    response: new OutputBuilder().created(entity, "Bot criado").build()
} satisfies IO;
const patch = {
    meta: {
        operationId: "updateAuthUser",
        sdk: {
            resource: "authUsers",
            method: "update",
            action: "update" as const,
            pathParameters: { id: "authUserId" }
        },
        method: "patch" as const,
        path: [
            pathSeg.literal("admin"),
            pathSeg.literal("auth-users"),
            pathSeg.param("id")
        ],
        tags: ["auth-users"],
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
