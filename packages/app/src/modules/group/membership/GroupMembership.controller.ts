import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { type UserContext } from "#/modules/identity/UserContext.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { groupId, page, profilePublicId } from "../Group.http.js";
import { unwrapGroupMutation } from "../Group.problems.js";
import IO from "./GroupMembership.contract.js";
import type { GroupMembershipService } from "./GroupMembership.service.js";

type Context = {
    groupMembershipService: GroupMembershipService;
} & UserContext;
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listPublicMemberships: async (ctx, input) =>
        page(
            await ctx.groupMembershipService.listPublicMemberships(
                groupId(input.query),
                profilePublicId(input.query),
                input.query
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
                await ctx.resolveUserContext(input.path.userId),
                groupId(input.query),
                input.query
            ),
            input.query,
            `/users/${input.path.userId}/group-memberships`
        ),
    getOwnMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupMembershipService.getOwnMembership(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id
            )
        ),
    patchOwnMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupMembershipService.patchOwnMembership(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id,
                input.body.isPublic
            )
        ),
    listManagedMemberships: async (ctx, input) =>
        page(
            await ctx.groupMembershipService.listManagedMemberships(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.query
            ),
            input.query,
            `/users/${input.path.userId}/groups/${input.path.groupId}/memberships`
        ),
    patchManagedMembership: async (ctx, input) =>
        ApiResponse.ok(
            unwrapGroupMutation(
                await ctx.groupMembershipService.patchManagedMembership(
                    await ctx.resolveUserContext(input.path.userId),
                    input.path.groupId,
                    input.path.membershipId,
                    input.body
                )
            )
        )
};
const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        resolveUserContext: (userId: number) =>
            request.scope.cradle.resolveUserContext(userId),
        groupMembershipService: request.scope.cradle.groupMembershipService
    })
});
export default { contracts: IO, router, registry, authRegistry };
