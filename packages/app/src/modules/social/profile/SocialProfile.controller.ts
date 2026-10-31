import type { AuthorizationPolicy } from "#/Authorization.js";
import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import {
    ApiResponse,
    createResultResponder,
    problemInput,
    type EndpointActions
} from "@pomi/api-core";
import { socialProblemResponses } from "../Social.problems.js";
import contracts from "./SocialProfile.contract.js";

const respond = createResultResponder(socialProblemResponses);
const actions: EndpointActions<typeof contracts, AuthorizationPolicy, Context> =
    {
        getProfile: async (ctx, input) =>
            respond(
                await ctx.socialProfileService.getProfile(input.path.sid),
                ApiResponse.ok
            ),
        updateProfile: async (ctx, input) =>
            respond(
                await ctx.socialProfileService.updateProfile(
                    input.path.sid,
                    input.body
                ),
                ApiResponse.ok,
                problemInput.body
            )
    };
const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    actions
);
export default { contracts, router, registry, authRegistry };
