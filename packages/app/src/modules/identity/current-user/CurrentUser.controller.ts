import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/identity/current-user/CurrentUser.contract.js";
import {
    ApiResponse,
    ForbiddenError,
    type EndpointActions
} from "@pomi/api-core";

const { schemas: _schemas, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;

const actions: Actions = {
    get: async (ctx) =>
        ApiResponse.ok(await ctx.currentUserService.get(ctx.principal!)),
    completeWelcome: async (ctx, input) => {
        if (ctx.principal?.userId !== input.path.userId)
            throw new ForbiddenError("Esta operação exige a própria conta.");
        return ApiResponse.ok(
            await ctx.currentUserService.completeWelcome(ctx.principal)
        );
    }
};
const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    actions
);

export default { contracts, router, registry, authRegistry };
