import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { type UserContext } from "#/modules/identity/UserContext.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { page } from "../Group.http.js";
import { unwrapGroupMutation } from "../Group.problems.js";
import IO from "./GroupRole.contract.js";
import type { GroupRoleService } from "./GroupRole.service.js";

type Context = { groupRoleService: GroupRoleService } & UserContext;
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listRoles: async (ctx, input) =>
        page(
            await ctx.groupRoleService.listRoles(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.query
            ),
            input.query,
            `/users/${input.path.userId}/groups/${input.path.groupId}/roles`
        ),
    createRole: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupRoleService.createRole(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.body.name,
                input.body.permissions ?? []
            )
        ),
    patchRole: async (ctx, input) =>
        ApiResponse.ok(
            unwrapGroupMutation(
                await ctx.groupRoleService.patchRole(
                    await ctx.resolveUserContext(input.path.userId),
                    input.path.groupId,
                    input.path.roleId,
                    input.body
                )
            )
        ),
    deleteRole: async (ctx, input) => {
        await ctx.groupRoleService.deleteRole(
            await ctx.resolveUserContext(input.path.userId),
            input.path.groupId,
            input.path.roleId
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
        groupRoleService: request.scope.cradle.groupRoleService
    })
});
export default { contracts: IO, router, registry, authRegistry };
