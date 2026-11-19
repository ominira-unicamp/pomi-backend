import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { type UserContext } from "#/modules/identity/UserContext.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { groupId, page } from "../Group.http.js";
import IO from "./GroupEvent.contract.js";
import type { GroupEventService } from "./GroupEvent.service.js";

type Context = { groupEventService: GroupEventService } & UserContext;
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listPublicEvents: async (ctx, input) =>
        page(
            await ctx.groupEventService.listPublicEvents(
                groupId(input.query),
                input.query
            ),
            input.query,
            "/group-events"
        ),
    getPublicEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupEventService.getPublicEvent(input.path.id)
        ),
    listManagedEvents: async (ctx, input) =>
        page(
            await ctx.groupEventService.listManagedEvents(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.query
            ),
            input.query,
            `/users/${input.path.userId}/groups/${input.path.groupId}/events`
        ),
    createEvent: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupEventService.createEvent(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.body
            )
        ),
    patchEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupEventService.patchEvent(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.path.eventId,
                input.body
            )
        ),
    publishEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupEventService.publishEvent(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.path.eventId
            )
        ),
    cancelEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupEventService.cancelEvent(
                await ctx.resolveUserContext(input.path.userId),
                input.path.groupId,
                input.path.eventId
            )
        )
};
const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        resolveUserContext: (userId: number) =>
            request.scope.cradle.resolveUserContext(userId),
        groupEventService: request.scope.cradle.groupEventService
    })
});
export default { contracts: IO, router, registry, authRegistry };
