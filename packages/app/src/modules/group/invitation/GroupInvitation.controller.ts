import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { type UserContext } from "#/modules/identity/UserContext.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { groupId, page } from "../Group.http.js";
import IO from "./GroupInvitation.contract.js";
import type { GroupInvitationService } from "./GroupInvitation.service.js";

type Context = {
    groupInvitationService: GroupInvitationService;
} & UserContext;
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listInvitations: async (ctx, input) =>
        page(
            await ctx.groupInvitationService.listInvitations(
                await ctx.resolveUserContext(input.path.userId),
                groupId(input.query),
                input.query
            ),
            input.query,
            `/users/${input.path.userId}/group-invitations`
        ),
    listManagedInvitations: async (ctx, input) =>
        page(
            await ctx.groupInvitationService.listManagedInvitations(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.query
            ),
            input.query,
            `/users/${input.path.userId}/groups/${input.path.groupId}/invitations`
        ),
    createInvitation: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupInvitationService.createInvitation(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.body.recipientPublicId
            )
        ),
    acceptInvitation: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupInvitationService.acceptInvitation(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id
            )
        ),
    declineInvitation: async (ctx, input) => {
        await ctx.groupInvitationService.declineInvitation(
            await ctx.resolveUserContext(input.path.userId),
            input.path.id
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
        groupInvitationService: request.scope.cradle.groupInvitationService
    })
});
export default { contracts: IO, router, registry, authRegistry };
