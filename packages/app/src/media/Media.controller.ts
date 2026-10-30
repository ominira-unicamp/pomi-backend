import type { AuthorizationPolicy } from "#/auth.js";
import { createAppEndpointRegistries } from "#/BuildHandler.js";
import { MediaUploadRateLimitError } from "#/media/MediaUploadLimiter.js";
import type { Principal } from "#/Principal.js";
import {
    ApiResponse,
    BadRequestError,
    PayloadTooLargeError,
    ServiceUnavailableError,
    UnprocessableEntityError,
    problemDetails,
    type EndpointActions
} from "@pomi/api-core";
import { ImageStorageError } from "./ImageStorage.js";
import type { MediaService } from "./MediaService.js";
import type { ImageMutationResult, ImageResourceOperations } from "./public.js";

import IO, { MediaUploadRateLimitProblem } from "./Media.contract.js";

type Context = {
    principal: Principal | undefined;
    studentAvatars: ImageResourceOperations<{ studentId: number }>;
    groupAvatars: ImageResourceOperations<{
        studentId: number;
        groupId: number;
    }>;
    mediaService: Pick<MediaService, "read">;
};

function throwTransportError(error: unknown): never {
    if (error instanceof ImageStorageError) {
        if (error.kind === "invalid-request") {
            throw new BadRequestError("Envie uma imagem multipart válida.");
        }
        if (error.kind === "payload-too-large") {
            throw new PayloadTooLargeError(
                "O envio da imagem excede o limite permitido."
            );
        }
        if (error.kind === "invalid-media") {
            throw new UnprocessableEntityError(
                "A imagem não atende aos formatos ou limites permitidos."
            );
        }
    }
    throw new ServiceUnavailableError("Serviço de imagens indisponível.");
}

async function mutate(operation: () => Promise<ImageMutationResult>) {
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
        if (error instanceof ImageStorageError) throwTransportError(error);
        throw error;
    }
}

const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    putStudentAvatar: (context, input, transport) =>
        mutate(() =>
            context.studentAvatars.replace({
                actor: context.principal,
                target: { studentId: input.path.sid },
                upload: {
                    stream: transport.request,
                    contentType: transport.request.headers["content-type"],
                    signal: transport.signal
                }
            })
        ),
    deleteStudentAvatar: async (context, input) => {
        await context.studentAvatars.remove({
            actor: context.principal,
            target: { studentId: input.path.sid }
        });
        return ApiResponse.noContent();
    },
    putGroupAvatar: (context, input, transport) =>
        mutate(() =>
            context.groupAvatars.replace({
                actor: context.principal,
                target: { studentId: input.path.sid, groupId: input.path.id },
                upload: {
                    stream: transport.request,
                    contentType: transport.request.headers["content-type"],
                    signal: transport.signal
                }
            })
        ),
    deleteGroupAvatar: async (context, input) => {
        await context.groupAvatars.remove({
            actor: context.principal,
            target: { studentId: input.path.sid, groupId: input.path.id }
        });
        return ApiResponse.noContent();
    },
    getImageVariant: async (context, input, transport) => {
        const bytes = await context.mediaService
            .read(
                context.principal,
                input.path.mediaId,
                input.path.variant,
                transport.signal
            )
            .catch((error) => {
                if (error instanceof ImageStorageError)
                    throwTransportError(error);
                throw error;
            });
        return ApiResponse.ok(bytes, [
            {
                type: "set-header",
                name: "Cache-Control",
                value: "private, no-store"
            },
            {
                type: "set-header",
                name: "Cross-Origin-Resource-Policy",
                value: "cross-origin"
            },
            {
                type: "set-header",
                name: "X-Content-Type-Options",
                value: "nosniff"
            }
        ]);
    }
};

const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        principal: request.scope.cradle.principal,
        studentAvatars: request.scope.cradle.studentAvatars,
        groupAvatars: request.scope.cradle.groupAvatars,
        mediaService: request.scope.cradle.mediaService
    })
});
export default { contracts: IO, router, registry, authRegistry };
