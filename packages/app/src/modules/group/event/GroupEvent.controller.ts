import { createAppEndpointRegistries } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import { ApiResponse, type EndpointActions } from "@pomi/api-core";
import { groupId, page } from "../Group.http.js";
import IO from "./GroupEvent.contract.js";
import type { GroupEventService } from "./GroupEvent.service.js";

type Context = { groupEventService: GroupEventService };
const actions: EndpointActions<typeof IO, AuthorizationPolicy, Context> = {
    listPublicEvents: async (ctx, input) =>
        page(
            await ctx.groupEventService.listPublicEvents(groupId(input.query)),
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
                input.path.sid,
                groupId(input.query)
            ),
            input.query,
            `/student/${input.path.sid}/managed-group-events`
        ),
    createEvent: async (ctx, input) =>
        ApiResponse.created(
            await ctx.groupEventService.createEvent(
                input.path.sid,
                input.query.groupId,
                input.body
            )
        ),
    patchEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupEventService.patchEvent(
                input.path.sid,
                input.path.id,
                input.body
            )
        ),
    publishEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupEventService.publishEvent(
                input.path.sid,
                input.path.id
            )
        ),
    cancelEvent: async (ctx, input) =>
        ApiResponse.ok(
            await ctx.groupEventService.cancelEvent(
                input.path.sid,
                input.path.id
            )
        )
};
const { router, registry, authRegistry } = createAppEndpointRegistries({
    contracts: IO,
    actions,
    createContext: (request) => ({
        groupEventService: request.scope.cradle.groupEventService
    })
});
export default { contracts: IO, router, registry, authRegistry };
