import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";
import IO from "./GroupCommunity.contract.js";

const page = <T>(
    items: T[],
    query: Parameters<typeof buildArrayPaginationResponse<T>>[1],
    path: string
) =>
    ApiResponse.ok(
        buildArrayPaginationResponse(items, query, unpaginatedByDefault, path)
    );
const groupId = (query: {
    filter?: { path: string[]; values: (string | number)[] }[];
}) =>
    query.filter?.find((entry) => entry.path.join(".") === "groupId")
        ?.values[0] as number | undefined;
const profilePublicId = (query: {
    filter?: { path: string[]; values: (string | number)[] }[];
}) =>
    query.filter?.find((entry) => entry.path.join(".") === "publicId")
        ?.values[0] as string | undefined;
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listPublicMemberships: async (ctx, input) =>
        page(
            await ctx.groupCommunityService.listPublicMemberships(
                groupId(input.query),
                profilePublicId(input.query)
            ),
            input.query,
            "/group-memberships"
        ),
    getPublicMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.getPublicMembership(input.path.id)
        ),
    listOwnMemberships: async (ctx, input) =>
        page(
            await ctx.groupCommunityService.listOwnMemberships(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/group-memberships`
        ),
    getOwnMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.getOwnMembership(
                input.path.sid,
                input.path.id
            )
        ),
    patchOwnMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.patchOwnMembership(
                input.path.sid,
                input.path.id,
                input.body.isPublic
            )
        ),
    listManagedMemberships: async (ctx, input) =>
        page(
            await ctx.groupCommunityService.listManagedMemberships(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/managed-group-memberships`
        ),
    patchManagedMembership: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.patchManagedMembership(
                input.path.sid,
                input.path.id,
                input.body
            )
        ),
    listInvitations: async (ctx, input) =>
        page(
            await ctx.groupCommunityService.listInvitations(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/group-invitations`
        ),
    listManagedInvitations: async (ctx, input) =>
        page(
            await ctx.groupCommunityService.listManagedInvitations(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/managed-group-invitations`
        ),
    createInvitation: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupCommunityService.createInvitation(
                input.path.sid,
                input.query.groupId,
                input.body.recipientPublicId
            )
        ),
    acceptInvitation: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.acceptInvitation(
                input.path.sid,
                input.path.id
            )
        ),
    declineInvitation: async (ctx, input) => {
        await ctx.groupCommunityService.declineInvitation(
            input.path.sid,
            input.path.id
        );
        return ApiResponse.noContent();
    },
    listRoles: async (ctx, input) =>
        page(
            await ctx.groupCommunityService.listRoles(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/group-roles`
        ),
    createRole: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupCommunityService.createRole(
                input.path.sid,
                input.query.groupId,
                input.body.name,
                input.body.permissions ?? []
            )
        ),
    patchRole: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.patchRole(
                input.path.sid,
                input.path.id,
                input.body
            )
        ),
    deleteRole: async (ctx, input) => {
        await ctx.groupCommunityService.deleteRole(
            input.path.sid,
            input.path.id
        );
        return ApiResponse.noContent();
    },
    listPublicEvents: async (ctx, input) =>
        page(
            await ctx.groupCommunityService.listPublicEvents(
                groupId(input.query)
            ),
            input.query,
            "/group-events"
        ),
    getPublicEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.getPublicEvent(input.path.id)
        ),
    listManagedEvents: async (ctx, input) =>
        page(
            await ctx.groupCommunityService.listManagedEvents(
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/managed-group-events`
        ),
    createEvent: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupCommunityService.createEvent(
                input.path.sid,
                input.query.groupId,
                input.body
            )
        ),
    patchEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.patchEvent(
                input.path.sid,
                input.path.id,
                input.body
            )
        ),
    publishEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.publishEvent(
                input.path.sid,
                input.path.id
            )
        ),
    cancelEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupCommunityService.cancelEvent(
                input.path.sid,
                input.path.id
            )
        )
};

const { router, registry, authRegistry } = createAppEndpointRegistries(
    IO,
    actions
);
export default { contracts: IO, router, registry, authRegistry };
