import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { groupId, page, profilePublicId } from "../Group.http.js";
import { unwrapGroupMutation } from "../Group.problems.js";
import IO from "./GroupMembership.contract.js";
import type { GroupMembershipService } from "./GroupMembership.service.js";

type Context = { groupMembershipService: GroupMembershipService };
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listPublicMemberships: async (ctx, input) =>
        page(
            await ctx.groupMembershipService.listPublicMemberships(
                groupId(input.query),
                profilePublicId(input.query)
            ),
            input.query,
            "/group-memberships"
        ),
    getPublicMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupMembershipService.getPublicMembership(input.path.id)
        ),
    listOwnMemberships: async (ctx, input) =>
        page(
            await ctx.groupMembershipService.listOwnMemberships(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/group-memberships`
        ),
    getOwnMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupMembershipService.getOwnMembership(
                input.path.sid,
                input.path.id
            )
        ),
    patchOwnMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupMembershipService.patchOwnMembership(
                input.path.sid,
                input.path.id,
                input.body.isPublic
            )
        ),
    listManagedMemberships: async (ctx, input) =>
        page(
            await ctx.groupMembershipService.listManagedMemberships(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/managed-group-memberships`
        ),
    patchManagedMembership: async (ctx, input) =>
        ApiResponse.ok(
            unwrapGroupMutation(
                await ctx.groupMembershipService.patchManagedMembership(
                    input.path.sid,
                    input.path.id,
                    input.body
                )
            )
        )
};
const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        groupMembershipService: request.scope.cradle.groupMembershipService
    })
});
export default { contracts: IO, router, registry, authRegistry };
