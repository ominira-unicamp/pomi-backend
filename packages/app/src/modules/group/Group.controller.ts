import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";
import IO from "./Group.contract.js";
import type { GroupService } from "./Group.service.js";

type Context = { groupService: GroupService };
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.groupService.list(),
                input.query,
                unpaginatedByDefault,
                "/groups"
            )
        ),
    get: async (ctx, input) =>
        ApiResponse.ok(await ctx.groupService.get(input.path.id)),
    create: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupService.create(input.path.sid, input.body)
        ),
    patch: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupService.patch(
                input.path.sid,
                input.path.id,
                input.body
            )
        ),
    archive: async (ctx, input) => {
        await ctx.groupService.archive(input.path.sid, input.path.id);
        return ApiResponse.noContent();
    }
};

const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        groupService: request.scope.cradle.groupService
    })
});
export default { contracts: IO, router, registry, authRegistry };
