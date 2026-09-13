import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO from "#/modules/schedule/daily-menu/DailyMenu.contract.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    createResultResponder,
    problemResponse,
    ResourceNotFoundProblem,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const respond = createResultResponder({
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem)
});
const actions: Actions = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.dailyMenuService.list(input.query),
                input.query,
                unpaginatedByDefault,
                "/daily-menus"
            )
        ),
    get: async (ctx, input) =>
        respond(
            await ctx.dailyMenuService.getById(input.path.id),
            ApiResponse.ok
        )
};
const { router, registry, authRegistry } = createDataEndpointRegistries(
    contracts,
    actions
);

export default {
    contracts,
    router,
    registry,
    authRegistry,
    paths: { entity: (id: number) => `/daily-menus/${id}` }
};
