import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { type LegacyStudentContext } from "#/modules/identity/LegacyStudentContext.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { groupId, page } from "../Group.http.js";
import IO from "./GroupInvitation.contract.js";
import type { GroupInvitationService } from "./GroupInvitation.service.js";

type Context = {
    groupInvitationService: GroupInvitationService;
} & LegacyStudentContext;
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listInvitations: async (ctx, input) =>
        page(
            await ctx.groupInvitationService.listInvitations(
                await ctx.resolveLegacyUser(input.path.sid),
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/group-invitations`
        ),
    listManagedInvitations: async (ctx, input) =>
        page(
            await ctx.groupInvitationService.listManagedInvitations(
                await ctx.resolveLegacyUser(input.path.sid),
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/managed-group-invitations`
        ),
    createInvitation: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupInvitationService.createInvitation(
                await ctx.resolveLegacyUser(input.path.sid),
                input.query.groupId,
                input.body.recipientPublicId
            )
        ),
    acceptInvitation: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupInvitationService.acceptInvitation(
                await ctx.resolveLegacyUser(input.path.sid),
                input.path.id
            )
        ),
    declineInvitation: async (ctx, input) => {
        await ctx.groupInvitationService.declineInvitation(
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
        groupInvitationService: request.scope.cradle.groupInvitationService
    })
});
export default { contracts: IO, router, registry, authRegistry };
