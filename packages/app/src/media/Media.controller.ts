import type { AuthorizationPolicy } from "#/auth.js";
import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { Principal } from "#/Principal.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { throwImageTransportError } from "./http.js";
import IO from "./Media.contract.js";
import type { MediaService } from "./MediaService.js";

type Context = {
    principal: Principal | undefined;
    mediaService: Pick<MediaService, "read">;
};
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    getImageVariant: async (context, input, transport) => {
        const bytes = await context.mediaService
            .read(
                context.principal,
                input.path.mediaId,
                input.path.variant,
                transport.signal
            )
            .catch(throwImageTransportError);
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
        mediaService: request.scope.cradle.mediaService
    })
});
export default { contracts: IO, router, registry, authRegistry };
