import type { AuthorizationPolicy } from "#/Authorization.js";
import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    createResultResponder,
    problemInput,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";
import {
    socialProblemResponses,
    toAcceptFriendshipProblem
} from "../Social.problems.js";
import contracts from "./SocialFriendship.contract.js";

const respond = createResultResponder(socialProblemResponses);
const actions: EndpointActions<typeof contracts, AuthorizationPolicy, Context> =
    {
        listFriendships: async (ctx, input) =>
            ApiResponse.ok(
                buildArrayPaginationResponse(
                    await ctx.socialFriendshipService.listFriendships(
                        await ctx.resolveLegacyUser(input.path.sid),
                        input.query
                    ),
                    input.query,
                    unpaginatedByDefault,
                    `/student/${input.path.sid}/friendships`
                )
            ),
        createFriendship: async (ctx, input) =>
            respond(
                await ctx.socialFriendshipService.createFriendship(
                    await ctx.resolveLegacyUser(input.path.sid),
                    input.body.targetPublicId
                ),
                ApiResponse.created,
                problemInput.body
            ),
        acceptFriendship: async (ctx, input) =>
            respond(
                (
                    await ctx.socialFriendshipService.acceptFriendship(
                        await ctx.resolveLegacyUser(input.path.sid),
                        input.path.id
                    )
                ).mapErr(toAcceptFriendshipProblem),
                ApiResponse.ok
            ),
        removeFriendship: async (ctx, input) =>
            respond(
                await ctx.socialFriendshipService.removeFriendship(
                    await ctx.resolveLegacyUser(input.path.sid),
                    input.path.id
                ),
                () => ApiResponse.noContent()
            )
    };
const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    actions
);
export default { contracts, router, registry, authRegistry };
