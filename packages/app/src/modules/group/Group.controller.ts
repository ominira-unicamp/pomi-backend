import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { type LegacyStudentContext } from "#/modules/identity/LegacyStudentContext.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";
import IO from "./Group.contract.js";
import type { GroupService } from "./Group.service.js";

type Context = { groupService: GroupService } & LegacyStudentContext;
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
            await ctx.groupService.create(
                await ctx.resolveLegacyUser(input.path.sid),
                input.body
            )
        ),
    patch: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupService.patch(
                await ctx.resolveLegacyUser(input.path.sid),
                input.path.id,
                input.body
            )
        ),
    archive: async (ctx, input) => {
        await ctx.groupService.archive(
            await ctx.resolveLegacyUser(input.path.sid),
            input.path.id
        );
        return ApiResponse.noContent();
    }
};

const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        resolveLegacyUser: (studentId: number) =>
            request.scope.cradle.resolveLegacyUser(studentId),
        groupService: request.scope.cradle.groupService
    })
});
export default { contracts: IO, router, registry, authRegistry };
