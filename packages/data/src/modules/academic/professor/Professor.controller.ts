import {
    ApiResponse,
    buildPaginationPath,
    buildPaginationResponse,
    createResultResponder,
    paginatedByDefault,
    resolvePagination,
    serializeQueryParams,
    type EndpointActions
} from "@pomi/api-core";

import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO, {
    professorPaths,
    type ListQueryParams
} from "#/modules/academic/professor/Professor.contract.js";
import { ResourceNotFoundProblem, problemResponse } from "@pomi/api-core";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const respond = createResultResponder({
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem)
});

const list: Actions["list"] = async (ctx, input) => {
    const result = await ctx.professorService.list(input.query);
    const pagination = resolvePagination(input.query, paginatedByDefault);
    return ApiResponse.ok(
        buildPaginationResponse<typeof IO.schema>(
            result.items,
            result.total,
            pagination,
            (link) => buildPaginationPath("/professors", input.query, link)
        )
    );
};

const get: Actions["get"] = async (ctx, input) =>
    respond(await ctx.professorService.getById(input.path.id), ApiResponse.ok);

function listPath(query: ListQueryParams) {
    const search = serializeQueryParams(
        query as unknown as Record<string, unknown>
    );
    return `/professors${search ? `?${search}` : ""}`;
}

const { router, registry, authRegistry } = createDataEndpointRegistries(
    contracts,
    { list, get }
);

export default {
    contracts,
    router,
    registry,
    authRegistry,
    paths: { list: listPath, entity: professorPaths.entity }
};
