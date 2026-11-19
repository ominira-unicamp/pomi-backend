import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { type UserContext } from "#/modules/identity/UserContext.js";
import {
    ApiResponse,
    buildQueryPaginationResponse,
    type EndpointActions
} from "@pomi/api-core";
import IO from "./Group.contract.js";
import type { GroupService } from "./Group.service.js";

type Context = { groupService: GroupService } & UserContext;
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildQueryPaginationResponse(
                await ctx.groupService.list(input.query),
                input.query,
                "/groups"
            )
        ),
    get: async (ctx, input) =>
        ApiResponse.ok(await ctx.groupService.get(input.path.groupId)),
    create: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupService.create(
                await ctx.resolveUserContext(input.path.userId),
                input.body
            )
        ),
    patch: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupService.patch(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.body
            )
        ),
    archive: async (ctx, input) => {
        await ctx.groupService.archive(
            await ctx.resolveUserContext(input.path.userId),
            input.path.groupId
        );
        return ApiResponse.noContent();
    }
};

const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        resolveUserContext: (userId: number) =>
            request.scope.cradle.resolveUserContext(userId),
        groupService: request.scope.cradle.groupService
    })
});
export default { contracts: IO, router, registry, authRegistry };
