import {
    ApiResponse,
    buildPaginationPath,
    buildPaginationResponse,
    createResultResponder,
    paginatedByDefault,
    resolvePagination,
    type EndpointActions
} from "@pomi/api-core";

import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO, {
    classScheduleEntity,
    classSchedulePaths
} from "#/modules/schedule/class-schedule/ClassSchedule.contract.js";
import { classScheduleProblemResponses } from "#/modules/schedule/class-schedule/ClassSchedule.problems.js";
type Actions = EndpointActions<typeof IO, unknown, Context>;
const respond = createResultResponder(classScheduleProblemResponses);

const list: Actions["list"] = async (ctx, input) => {
    const result = await ctx.classScheduleService.list(input.query);
    const pagination = resolvePagination(input.query, paginatedByDefault);
    return ApiResponse.ok(
        buildPaginationResponse<typeof classScheduleEntity>(
            result.items,
            result.total,
            pagination,
            (link) => buildPaginationPath("/class-schedules", input.query, link)
        )
    );
};
const get: Actions["get"] = async (ctx, input) => {
    return respond(
        await ctx.classScheduleService.getById(input.path.id),
        (value) => ApiResponse.ok(value)
    );
};

const actions: Actions = {
    list,
    get
};
const { router, registry, authRegistry } = createDataEndpointRegistries(
    IO,
    actions
);

export default {
    contracts: IO,
    router,
    registry,
    authRegistry,
    paths: {
        list: classSchedulePaths.list,
        entity: classSchedulePaths.entity
    }
};
