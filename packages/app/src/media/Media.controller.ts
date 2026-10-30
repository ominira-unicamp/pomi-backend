import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import type { MediaTarget } from "#/media/MediaService.js";
import { MediaUploadRateLimitError } from "#/media/MediaUploadLimiter.js";
import { PictRsError } from "#/media/PictRsClient.js";
import {
    ApiResponse,
    BadRequestError,
    PayloadTooLargeError,
    ServiceUnavailableError,
    UnauthenticatedError,
    UnprocessableEntityError,
    problemDetails,
    type EndpointActions
} from "@pomi/api-core";

import IO, { MediaUploadRateLimitProblem } from "./Media.contract.js";

function requireClient(context: Context) {
    if (!context.pictRsClient) {
        throw new ServiceUnavailableError("Serviço de imagens indisponível.");
    }
    return context.pictRsClient;
}

function throwTransportError(error: unknown): never {
    if (error instanceof PictRsError) {
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

async function upload(
    context: Context,
    target: MediaTarget,
    transport: Parameters<
        EndpointActions<
            typeof IO,
            AuthorizationPolicy,
            Context
        >["putStudentAvatar"]
    >[2]
) {
    const pict = requireClient(context);
    const contentType = transport.request.headers["content-type"];
    if (typeof contentType !== "string") {
        throw new BadRequestError("Envie um arquivo multipart.");
    }
    const snapshot = await context.mediaService.prepare(
        context.principal,
        target
    );
    if (!context.principal) {
        throw new UnauthenticatedError("Autenticação necessária.");
    }
    let release: () => void;
    try {
        release = context.mediaUploadLimiter.acquire(
            context.principal.authUserId
        );
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
        throw error;
    }
    try {
        const uploaded = await pict
            .upload(transport.request, contentType, transport.signal, "square")
            .catch(throwTransportError);
        try {
            return ApiResponse.ok(
                await context.mediaService.activate(
                    context.principal,
                    snapshot,
                    uploaded
                )
            );
        } catch (error) {
            await context.mediaService.recordUnlinked(uploaded).catch(() => {});
            throw error;
        }
    } finally {
        release();
    }
}

async function remove(context: Context, target: MediaTarget) {
    const snapshot = await context.mediaService.prepare(
        context.principal,
        target
    );
    await context.mediaService.remove(context.principal, snapshot);
    return ApiResponse.noContent();
}

const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    putStudentAvatar: (context, input, transport) =>
        upload(
            context,
            { kind: "student-avatar", studentId: input.path.sid },
            transport
        ),
    deleteStudentAvatar: (context, input) =>
        remove(context, { kind: "student-avatar", studentId: input.path.sid }),
    putGroupAvatar: (context, input, transport) =>
        upload(
            context,
            {
                kind: "group-avatar",
                studentId: input.path.sid,
                groupId: input.path.id
            },
            transport
        ),
    deleteGroupAvatar: (context, input) =>
        remove(context, {
            kind: "group-avatar",
            studentId: input.path.sid,
            groupId: input.path.id
        }),
    getImageVariant: async (context, input, transport) => {
        const { alias } = await context.mediaService.resolveRead(
            context.principal,
            input.path.mediaId
        );
        const bytes = await requireClient(context)
            .readVariant(alias, input.path.variant, transport.signal)
            .catch(throwTransportError);
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

const { router, registry, authRegistry } = createAppEndpointRegistries(
    IO,
    actions
);
export default { contracts: IO, router, registry, authRegistry };
