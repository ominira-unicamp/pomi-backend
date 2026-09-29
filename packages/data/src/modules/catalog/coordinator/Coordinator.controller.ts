import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO, {
    coordinatorPaths
} from "#/modules/catalog/coordinator/Coordinator.contract.js";
import {
    ApiResponse,
    buildPaginationResponse,
    createResultResponder,
    problemResponse,
    ResourceNotFoundProblem,
    type EndpointActions
} from "@pomi/api-core";
import z from "zod";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const respond = createResultResponder({
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem)
});

const list: Actions["list"] = async (ctx, input) => {
    const result = await ctx.coordinatorService.list(input.query);
    return ApiResponse.ok(
        buildPaginationResponse<typeof IO.schema>(
            result.items as Array<z.infer<typeof IO.schema>>,
            result.total,
            result.pagination,
            (pagination) =>
                coordinatorPaths.list({
                    ...input.query,
                    ...pagination
                })
        )
    );
};

const get: Actions["get"] = async (ctx, input) =>
    respond(
        await ctx.coordinatorService.getById(input.path.id),
        ApiResponse.ok
    );

const { router, registry, authRegistry } = createDataEndpointRegistries(
    contracts,
    { list, get }
);

export default {
    contracts,
    router,
    registry,
    authRegistry,
    paths: coordinatorPaths
};
