import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { groupId, page } from "../Group.http.js";
import { unwrapGroupMutation } from "../Group.problems.js";
import IO from "./GroupRole.contract.js";
import type { GroupRoleService } from "./GroupRole.service.js";

type Context = { groupRoleService: GroupRoleService };
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listRoles: async (ctx, input) =>
        page(
            await ctx.groupRoleService.listRoles(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/group-roles`
        ),
    createRole: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupRoleService.createRole(
                input.path.sid,
                input.query.groupId,
                input.body.name,
                input.body.permissions ?? []
            )
        ),
    patchRole: async (ctx, input) =>
        ApiResponse.ok(
            unwrapGroupMutation(
                await ctx.groupRoleService.patchRole(
                    input.path.sid,
                    input.path.id,
                    input.body
                )
            )
        ),
    deleteRole: async (ctx, input) => {
        await ctx.groupRoleService.deleteRole(input.path.sid, input.path.id);
        return ApiResponse.noContent();
    }
};
const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        groupRoleService: request.scope.cradle.groupRoleService
    })
});
export default { contracts: IO, router, registry, authRegistry };
