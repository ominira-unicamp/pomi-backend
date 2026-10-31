import type { AuthorizationPolicy } from "#/Authorization.js";
import { OutputBuilder } from "#/Contract.js";
import type { Principal } from "#/Principal.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import type { PathSegment } from "@pomi/api-core";
import {
    ApiResponse,
    BadRequestError,
    defineProblem,
    ForbiddenProblemSchema,
    PayloadTooLargeError,
    PayloadTooLargeProblemSchema,
    problemDetails,
    ServiceUnavailableError,
    ServiceUnavailableProblemSchema,
    UnprocessableEntityError
} from "@pomi/api-core";
import type { Request } from "express";
import z from "zod";
import { ImageStorageError } from "./ImageStorage.js";
import { MediaUploadRateLimitError } from "./MediaUploadLimiter.js";
import type {
    ImageMutationResult,
    ImageResource,
    ImageResourceOperations
} from "./public.js";

extendZodWithOpenApi(z);

export const MediaUploadRateLimitProblem = defineProblem({
    schemaName: "MediaUploadRateLimitProblem",
    typeName: "media-upload-rate-limit",
    title: "Muitos uploads de imagem",
    status: 429,
    extensions: { retryAfterSeconds: z.number().int().positive() }
});

export const imageUploadForm = z.object({
    "images[]": z.string().openapi({ type: "string", format: "binary" })
});
const imageMutationResult = z.object({
    mediaId: z.uuid(),
    revision: z.number().int().nonnegative()
});

export function imageUploadResponses() {
    return new OutputBuilder()
        .ok(imageMutationResult, "Imagem associada")
        .badRequest()
        .unauthorized()
        .problem(403, ForbiddenProblemSchema, "Acesso proibido")
        .notFound()
        .conflict()
        .problem(413, PayloadTooLargeProblemSchema, "Imagem muito grande")
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
        .build();
}

export function imageRemovalResponses() {
    return new OutputBuilder()
        .noContent("Imagem removida")
        .unauthorized()
        .problem(403, ForbiddenProblemSchema, "Acesso proibido")
        .notFound()
        .conflict()
        .build();
}

export function throwImageTransportError(error: unknown): never {
    if (!(error instanceof ImageStorageError)) throw error;
    if (error.kind === "invalid-request")
        throw new BadRequestError("Envie uma imagem multipart válida.");
    if (error.kind === "payload-too-large")
        throw new PayloadTooLargeError(
            "O envio da imagem excede o limite permitido."
        );
    if (error.kind === "invalid-media")
        throw new UnprocessableEntityError(
            "A imagem não atende aos formatos ou limites permitidos."
        );
    throw new ServiceUnavailableError("Serviço de imagens indisponível.");
}

export async function respondImageMutation(
    operation: () => Promise<ImageMutationResult>
) {
    try {
        return ApiResponse.ok(await operation());
    } catch (error) {
        if (error instanceof MediaUploadRateLimitError) {
            return ApiResponse.status(
                429,
                problemDetails(
                    MediaUploadRateLimitProblem.create({
                        detail: error.message,
                        retryAfterSeconds: error.retryAfterSeconds
                    }),
                    429
                ),
                [
                    {
                        type: "set-header",
                        name: "Retry-After",
                        value: String(error.retryAfterSeconds)
                    }
                ]
            );
        }
        throwImageTransportError(error);
    }
}

export type ImageEndpointsDefinition<
    Target,
    Path extends z.ZodObject,
    Replace extends string = string,
    Remove extends string = string
> = {
    resource: ImageResource<Target>;
    path: PathSegment[];
    pathSchema: Path;
    target(input: { path: z.output<Path> }): Target;
    authorization: AuthorizationPolicy;
    operations: { replace: Replace; remove: Remove };
    tags: string[];
    sdk: { resource: string; pathParameters: Record<string, string> };
};

export function createImageContracts<
    Target,
    Path extends z.ZodObject,
    const Replace extends string,
    const Remove extends string
>(definition: ImageEndpointsDefinition<Target, Path, Replace, Remove>) {
    const request = z.object({ path: definition.pathSchema });
    const metadata = {
        path: definition.path,
        tags: definition.tags,
        authorization: definition.authorization
    };
    const replace = {
        meta: {
            ...metadata,
            operationId: definition.operations.replace,
            method: "post" as const,
            sdk: {
                ...definition.sdk,
                method: definition.operations.replace,
                action: "create" as const
            },
            transport: {
                requestBody: {
                    mediaType: "multipart/form-data" as const,
                    schema: imageUploadForm
                }
            }
        },
        request,
        response: imageUploadResponses()
    };
    const remove = {
        meta: {
            ...metadata,
            operationId: definition.operations.remove,
            method: "delete" as const,
            sdk: {
                ...definition.sdk,
                method: definition.operations.remove,
                action: "delete" as const
            }
        },
        request,
        response: imageRemovalResponses()
    };
    if (definition.operations.replace === String(definition.operations.remove))
        throw new Error("As operações de imagem precisam ter nomes distintos.");
    return {
        [definition.operations.replace]: replace,
        [definition.operations.remove]: remove
    } as { [Key in Replace]: typeof replace } & {
        [Key in Remove]: typeof remove;
    };
}

export function createImageActions<
    Target,
    Path extends z.ZodObject,
    const Replace extends string,
    const Remove extends string,
    Context
>(
    definition: ImageEndpointsDefinition<Target, Path, Replace, Remove>,
    bindings: {
        operations(context: Context): ImageResourceOperations<Target>;
        actor(context: Context): Principal | undefined;
    }
) {
    type Transport = { request: Request; signal: AbortSignal };
    const replace = (
        context: Context,
        input: { path: z.output<Path> },
        transport: Transport
    ) =>
        respondImageMutation(() =>
            bindings.operations(context).replace({
                actor: bindings.actor(context),
                target: definition.target(input),
                upload: {
                    stream: transport.request,
                    contentType: transport.request.headers["content-type"],
                    signal: transport.signal
                }
            })
        );
    const remove = async (
        context: Context,
        input: { path: z.output<Path> }
    ) => {
        await bindings.operations(context).remove({
            actor: bindings.actor(context),
            target: definition.target(input)
        });
        return ApiResponse.noContent();
    };
    return {
        [definition.operations.replace]: replace,
        [definition.operations.remove]: remove
    } as { [Key in Replace]: typeof replace } & {
        [Key in Remove]: typeof remove;
    };
}
