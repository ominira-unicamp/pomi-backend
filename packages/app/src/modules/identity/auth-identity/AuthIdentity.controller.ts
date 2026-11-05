import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/identity/auth-identity/AuthIdentity.contract.js";
import { authIdentityProblemResponses } from "#/modules/identity/auth-identity/AuthIdentity.problems.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    createResultResponder,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";
const { schemas: _schemas, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder(authIdentityProblemResponses);
const actions: Actions = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.authIdentityService.list(input.query),
                input.query,
                unpaginatedByDefault,
                "/admin/auth-identities"
            )
        ),
    create: async (ctx, input) =>
        ApiResponse.created(await ctx.authIdentityService.create(input.body)),
    patch: async (ctx, input) =>
        respond(
            await ctx.authIdentityService.patch(input.path.id, input.body),
            ApiResponse.ok
        )
};
const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    actions
);
export default { contracts, router, registry, authRegistry };
