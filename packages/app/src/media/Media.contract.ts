import { policies, StudentCapabilities } from "#/Authorization.js";
import { type IO, OutputBuilder } from "#/Contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    defineProblem,
    ForbiddenProblemSchema,
    pathParam,
    pathSeg,
    type PathSegment,
    PayloadTooLargeProblemSchema,
    ServiceUnavailableProblemSchema
} from "@pomi/api-core";
import type { Readable } from "node:stream";
import z from "zod";

extendZodWithOpenApi(z);

export const MediaUploadRateLimitProblem = defineProblem({
    schemaName: "MediaUploadRateLimitProblem",
    typeName: "media-upload-rate-limit",
    title: "Muitos uploads de imagem",
    status: 429,
    extensions: { retryAfterSeconds: z.number().int().positive() }
});

const student = [pathSeg.literal("student"), pathSeg.param("sid")];
const group = [...student, pathSeg.literal("groups"), pathSeg.param("id")];
const studentPath = z.object({ sid: pathParam.positiveInteger() });
const groupPath = studentPath.extend({ id: pathParam.positiveInteger() });
const uploadForm = z.object({
    "images[]": z.string().openapi({ type: "string", format: "binary" })
});
const image = z.object({
    mediaId: z.uuid(),
    revision: z.number().int().nonnegative()
});

function mutation<Path extends typeof studentPath | typeof groupPath>(
    operationId: string,
    method: "post" | "delete",
    path: PathSegment[],
    pathSchema: Path,
    groupMutation = false
) {
    return {
        meta: {
            operationId,
            method,
            path,
            tags: ["media"],
            authorization: policies.studentAccess(
                "sid",
                StudentCapabilities.PROFILE_WRITE
            ),
            sdk: {
                resource: "media",
                method: operationId,
                action:
                    method === "post"
                        ? ("create" as const)
                        : ("delete" as const),
                pathParameters: (groupMutation
                    ? { sid: "studentId", id: "groupId" }
                    : { sid: "studentId" }) as Record<string, string>
            },
            ...(method === "post"
                ? {
                      transport: {
                          requestBody: {
                              mediaType: "multipart/form-data" as const,
                              schema: uploadForm
                          }
                      }
                  }
                : {})
        },
        request: z.object({ path: pathSchema }),
        response:
            method === "post"
                ? new OutputBuilder()
                      .ok(image, "Imagem associada")
                      .badRequest()
                      .unauthorized()
                      .problem(403, ForbiddenProblemSchema, "Acesso proibido")
                      .notFound()
                      .conflict()
                      .problem(
                          413,
                          PayloadTooLargeProblemSchema,
                          "Imagem muito grande"
                      )
                      .unprocessableEntity()
                      .problem(
                          429,
                          MediaUploadRateLimitProblem.schema,
                          "Limite de uploads de imagem"
                      )
                      .problem(
                          503,
                          ServiceUnavailableProblemSchema,
                          "Serviço de imagens indisponível"
                      )
                      .build()
                : new OutputBuilder()
                      .noContent("Imagem removida")
                      .unauthorized()
                      .problem(403, ForbiddenProblemSchema, "Acesso proibido")
                      .notFound()
                      .conflict()
                      .build()
    };
}

const IO = {
    putStudentAvatar: mutation(
        "putStudentAvatar",
        "post",
        [...student, pathSeg.literal("avatar")],
        studentPath
    ),
    deleteStudentAvatar: mutation(
        "deleteStudentAvatar",
        "delete",
        [...student, pathSeg.literal("avatar")],
        studentPath
    ),
    putGroupAvatar: mutation(
        "putGroupAvatar",
        "post",
        [...group, pathSeg.literal("avatar")],
        groupPath,
        true
    ),
    deleteGroupAvatar: mutation(
        "deleteGroupAvatar",
        "delete",
        [...group, pathSeg.literal("avatar")],
        groupPath,
        true
    ),
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
