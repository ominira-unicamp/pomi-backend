import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/identity/bot-grant/BotGrant.contract.js";
import { botGrantProblemResponses } from "#/modules/identity/bot-grant/BotGrant.problems.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    createResultResponder,
    problemInput,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";

const { schemas: _schemas, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder(botGrantProblemResponses);
const actions: Actions = {
    listBots: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.botGrantService.listBots(),
                input.query,
                unpaginatedByDefault,
                "/bots"
            )
        ),
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.botGrantService.list(ctx.principal!),
                input.query,
                unpaginatedByDefault,
                "/me/bot-grants"
            )
        ),
    replace: async (ctx, input) =>
        respond(
            await ctx.botGrantService.replace(
                ctx.principal!,
                input.path.botAuthUserId,
                input.body.capabilities
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
