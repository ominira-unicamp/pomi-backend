import type { AuthorizationPolicy } from "#/Authorization.js";
import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import {
    ApiResponse,
    buildPaginationResponse,
    createResultResponder,
    serializeQueryParams,
    type EndpointActions
} from "@pomi/api-core";
import { socialProblemResponses } from "../Social.problems.js";
import type { person } from "../Social.schemas.js";
import contracts from "./SocialPeople.contract.js";

const respond = createResultResponder(socialProblemResponses);
const actions: EndpointActions<typeof contracts, AuthorizationPolicy, Context> =
    {
        listPeople: async (ctx, input) => {
            const result = await ctx.socialPeopleService.listPeople(
                input.path.sid,
                input.query
            );
            return ApiResponse.ok(
                buildPaginationResponse<typeof person>(
                    result.items,
                    result.total,
                    result.pagination,
                    (pagination) => {
                        const search = serializeQueryParams({
                            ...input.query,
                            ...pagination
                        });
                        return `/student/${input.path.sid}/people${search ? `?${search}` : ""}`;
                    }
                )
            );
        },
        getPerson: async (ctx, input) =>
            respond(
                await ctx.socialPeopleService.getPerson(
                    input.path.sid,
                    input.path.publicId
                ),
                ApiResponse.ok
            )
    };
const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    actions
);
export default { contracts, router, registry, authRegistry };
