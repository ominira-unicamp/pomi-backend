import { policies } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    ForbiddenProblemSchema,
    pathSeg,
    ServiceUnavailableProblemSchema
} from "@pomi/api-core";
import type { Readable } from "node:stream";
import z from "zod";

extendZodWithOpenApi(z);

const IO = {
    getImageVariant: {
        meta: {
            operationId: "getImageVariant",
            method: "get" as const,
            path: [
                pathSeg.literal("media"),
                pathSeg.param("mediaId"),
                pathSeg.param("variant")
            ],
            tags: ["media"],
            authorization: policies.optionalAuth,
            sdk: {
                resource: "media",
                method: "getImageVariant",
                action: "get" as const,
                pathParameters: { mediaId: "mediaId", variant: "variant" }
            },
            transport: { responseBody: "stream" as const }
        },
        request: z.object({
            path: z.object({
                mediaId: z.uuid(),
                variant: z.enum(["avatarSmall", "avatarLarge"])
            })
        }),
        response: new OutputBuilder()
            .ok(
                z.custom<Readable>().openapi({
                    type: "string",
                    format: "binary"
                }),
                "Variante WebP com autorização reavaliada, Cache-Control: private, no-store e Cross-Origin-Resource-Policy: cross-origin.",
                { mediaType: "image/webp" }
            )
            .unauthorized()
            .problem(403, ForbiddenProblemSchema, "Acesso proibido")
            .notFound()
            .problem(
                503,
                ServiceUnavailableProblemSchema,
                "Serviço de imagens indisponível"
            )
            .build()
    }
} satisfies Record<string, IO>;

export default IO;
