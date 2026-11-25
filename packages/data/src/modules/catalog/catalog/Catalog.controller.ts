import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO from "#/modules/catalog/catalog/Catalog.contract.js";
import {
    ApiResponse,
    buildQueryPaginationResponse,
    createResultResponder,
    problemResponse,
    ResourceNotFoundProblem,
    type EndpointActions
} from "@pomi/api-core";
const { schemas: _schemas, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const respond = createResultResponder({
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem)
});
const actions: Actions = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildQueryPaginationResponse(
                await ctx.catalogService.list(input.query),
                input.query,
                "/catalogs"
            )
        ),
    get: async (ctx, input) =>
        respond(await ctx.catalogService.getById(input.path.id), ApiResponse.ok)
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
    paths: { entity: (id: number) => `/catalogs/${id}` }
};
