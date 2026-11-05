import { type IO, OutputBuilder } from "#/Contract.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { pathParam, pathSeg } from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const unsubscribe = {
    meta: {
        operationId: "unsubscribeExchangeNotices",
        sdk: {
            resource: "exchangeNoticeSubscriptions",
            method: "unsubscribe",
            action: "update" as const,
            pathParameters: { userId: "userId" }
        },
        method: "post" as const,
        path: [
            pathSeg.literal("users"),
            pathSeg.param("userId"),
            pathSeg.literal("exchange-notice-subscription"),
            pathSeg.literal("unsubscribe")
        ],
        tags: ["exchange-notice-subscriptions"],
        authorization: policies.public
    },
    request: z.object({
        path: z.object({ userId: pathParam.positiveInteger() }),
        query: z.object({ token: z.string().min(1) })
    }),
    response: new OutputBuilder()
        .ok(
            z.object({ enabled: z.literal(false) }).strict(),
            "Notificações desativadas"
        )
        .build()
} satisfies IO;

export default { unsubscribe };
