import {
    ApiResponse,
    buildPaginationResponse,
    createResultResponder,
    type EndpointActions
} from "@pomi/api-core";

import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO, { coursePaths } from "#/modules/academic/course/Course.contract.js";
import { courseProblemResponses } from "#/modules/academic/course/Course.problems.js";
import z from "zod";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const respond = createResultResponder(courseProblemResponses);

const list: Actions["list"] = async (ctx, input) => {
    const result = await ctx.courseService.list(input.query);
    return ApiResponse.ok(
        buildPaginationResponse<typeof IO.schema>(
            result.items as Array<z.infer<typeof IO.schema>>,
            result.total,
            result.pagination,
            (pagination) => coursePaths.list({ ...input.query, ...pagination })
        )
    );
};

const get: Actions["get"] = async (ctx, input) =>
    respond(await ctx.courseService.getById(input.path.id), ApiResponse.ok);

const actions: Actions = { list, get };
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
        list: coursePaths.list,
        entity: coursePaths.entity
    }
};
