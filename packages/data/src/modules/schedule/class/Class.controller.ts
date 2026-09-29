import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO, { classPaths } from "#/modules/schedule/class/Class.contract.js";
import {
    ApiResponse,
    buildPaginationPath,
    buildPaginationResponse,
    createResultResponder,
    paginatedByDefault,
    problemResponse,
    resolvePagination,
    ResourceNotFoundProblem,
    serializeQueryParams,
    type EndpointActions
} from "@pomi/api-core";
const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const respond = createResultResponder({
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem)
});

function listPath(query: Record<string, unknown>) {
    const search = serializeQueryParams(query);
    return `/classes${search ? `?${search}` : ""}`;
}

const actions: Actions = {
    list: async (ctx, input) => {
        const result = await ctx.classService.list(input.query);
        const pagination = resolvePagination(input.query, paginatedByDefault);
        return ApiResponse.ok(
            buildPaginationResponse<typeof IO.schema>(
                result.items,
                result.total,
                pagination,
                (link) => buildPaginationPath("/classes", input.query, link)
            )
        );
    },
    get: async (ctx, input) =>
        respond(await ctx.classService.getById(input.path.id), ApiResponse.ok)
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
    paths: {
        entity: classPaths.entity,
        list: listPath
    }
};
