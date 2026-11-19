import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/identity/bot-grant/BotGrant.contract.js";
import { botGrantProblemResponses } from "#/modules/identity/bot-grant/BotGrant.problems.js";
import {
    ApiResponse,
    buildQueryPaginationResponse,
    createResultResponder,
    problemInput,
    type EndpointActions
} from "@pomi/api-core";

const { schemas: _schemas, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder(botGrantProblemResponses);
const actions: Actions = {
    listBots: async (ctx, input) =>
        ApiResponse.ok(
            buildQueryPaginationResponse(
                await ctx.botGrantService.listBots(input.query),
                input.query,
                "/bots"
            )
        ),
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildQueryPaginationResponse(
                await ctx.botGrantService.list(
                    await ctx.resolveUserContext(input.path.userId),
                    input.query
                ),
                input.query,
                `/users/${input.path.userId}/bot-grants`
            )
        ),
    replace: async (ctx, input) =>
        respond(
            await ctx.botGrantService.replace(
                await ctx.resolveUserContext(input.path.userId),
                input.path.botAuthIdentityId,
                input.body.capabilities,
                input.body.authorAuthIdentityId
            ),
            () => ApiResponse.noContent(),
            problemInput.body
        )
};
const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    actions
);
export default { contracts, router, registry, authRegistry };
