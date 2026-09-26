import { policies, StudentCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    pathParam,
    pathSeg,
    ReferenceNotFoundProblemSchema
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const path = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("exchange-notice-subscription")
];

const studentPath = z.object({
    sid: pathParam.positiveInteger()
});

const entity = z
    .object({
        studentId: z.number().int().positive(),
        enabled: z.boolean(),
        placeIds: z.array(z.number().int().positive())
    })
    .strict()
    .openapi("ExchangeNoticeSubscription", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "ExchangeNoticeSubscription"
        }
    });

const patchBody = z
    .object({
        enabled: z.boolean().optional(),
        placeIds: z.array(z.number().int().positive()).optional()
    })
    .strict()
    .refine(
        (value) => value.enabled !== undefined || value.placeIds !== undefined,
        { message: "At least one field must be provided" }
    )
    .refine(
        (value) =>
            !value.placeIds ||
            new Set(value.placeIds).size === value.placeIds.length,
        { path: ["placeIds"], message: "placeIds must not contain duplicates" }
    )
    .openapi("PatchExchangeNoticeSubscriptionBody", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "PatchExchangeNoticeSubscriptionBody"
        }
    });

const get = {
    meta: {
        operationId: "getExchangeNoticeSubscription",
        sdk: {
            resource: "exchangeNoticeSubscriptions",
            method: "get",
            action: "get" as const,
            pathParameters: { sid: "studentId" }
        },
        method: "get" as const,
        path,
        tags: ["exchange-notice-subscriptions"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PROFILE_READ
        )
    },
    request: z.object({ path: studentPath }),
    response: new OutputBuilder()
        .ok(entity, "Preferências de editais recuperadas")
        .build()
} satisfies IO;

const patch = {
    meta: {
        operationId: "updateExchangeNoticeSubscription",
        sdk: {
            resource: "exchangeNoticeSubscriptions",
            method: "update",
            action: "update" as const,
            pathParameters: { sid: "studentId" }
        },
        method: "patch" as const,
        path,
        tags: ["exchange-notice-subscriptions"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PROFILE_WRITE
        )
    },
    request: z.object({ path: studentPath, body: patchBody }),
    response: new OutputBuilder()
        .ok(entity, "Preferências de editais atualizadas")
        .problem(
            422,
            ReferenceNotFoundProblemSchema,
            "Local de intercâmbio não encontrado"
        )
        .build()
} satisfies IO;

export default { entity, get, patch };
