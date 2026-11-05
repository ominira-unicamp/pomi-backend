import { type IO, OutputBuilder } from "#/Contract.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { pathSeg } from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const entity = z
    .object({
        principalId: z.number().int(),
        authIdentityId: z.number().int(),
        kind: z.enum(["HUMAN", "SERVICE"]),
        userId: z.number().int().nullable(),
        serviceAccountId: z.number().int().nullable(),
        roles: z.array(z.string()),
        capabilities: z.array(z.string()),
        studentId: z.number().int().nullable()
    })
    .strict()
    .openapi("CurrentUserEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "CurrentUser",
            identityFields: ["principalId"]
        }
    });

const get = {
    meta: {
        operationId: "getCurrentUser",
        sdk: {
            resource: "currentUser",
            method: "get",
            action: "get" as const
        },
        method: "get" as const,
        path: [pathSeg.literal("me")],
        tags: ["current-user"],
        authorization: policies.authenticated
    },
    request: z.object({}),
    response: new OutputBuilder().ok(entity, "Usuário atual recuperado").build()
} satisfies IO;

export default { schemas: { entity }, get };
