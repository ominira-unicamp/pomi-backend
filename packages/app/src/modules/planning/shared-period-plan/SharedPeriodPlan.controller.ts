import type { AuthorizationPolicy } from "#/auth.js";
import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import IO from "#/modules/planning/shared-period-plan/SharedPeriodPlan.contract.js";
import {
    ApiResponse,
    buildPaginationResponse,
    createResultResponder,
    problemResponse,
    ResourceNotFoundProblem,
    serializeQueryParams,
    type EndpointActions
} from "@pomi/api-core";

const { schema: _schema, specsBuilder: _specsBuilder, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder({
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem)
});

const actions: Actions = {
    listPublic: async (ctx, input) => {
        const result = await ctx.sharedPeriodPlanService.listPublic(
            input.query
        );
        return ApiResponse.ok(
            buildPaginationResponse<typeof IO.schema>(
                result.items,
                result.total,
                result.pagination,
                (pagination) =>
                    queryPath(
                        "/shared-period-plannings",
                        input.query,
                        pagination
                    )
            )
        );
    },
    getPublic: async (ctx, input) =>
        respond(
            await ctx.sharedPeriodPlanService.getPublic(input.path.shareId),
            ApiResponse.ok
        ),
    listForStudent: async (ctx, input) => {
        const result = await ctx.sharedPeriodPlanService.listForStudent(
            input.path.sid,
            input.query
        );
        return ApiResponse.ok(
            buildPaginationResponse<typeof IO.schema>(
                result.items,
                result.total,
                result.pagination,
                (pagination) =>
                    queryPath(
                        `/student/${input.path.sid}/shared-period-plannings`,
                        input.query,
                        pagination
                    )
            )
        );
    },
    getForStudent: async (ctx, input) =>
        respond(
            await ctx.sharedPeriodPlanService.getForStudent(
                input.path.sid,
                input.path.shareId
            ),
            ApiResponse.ok
        )
};

function queryPath(
    path: string,
    query: Record<string, unknown>,
    pagination: Record<string, unknown>
) {
    const search = serializeQueryParams({ ...query, ...pagination });
    return `${path}${search ? `?${search}` : ""}`;
}

const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    actions
);

export default { contracts, router, registry, authRegistry };
