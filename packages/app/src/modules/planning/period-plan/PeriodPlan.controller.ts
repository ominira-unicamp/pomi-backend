import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import { periodPlanProblemResponses } from "#/modules/planning/period-plan/PeriodPlan.problems.js";
import {
    ApiResponse,
    buildQueryPaginationResponse,
    createResultResponder,
    problemInput,
    type EndpointActions
} from "@pomi/api-core";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder(periodPlanProblemResponses);

export const periodPlanActions: Actions = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildQueryPaginationResponse(
                await ctx.periodPlanService.list(
                    await ctx.resolveUserContext(input.path.userId),
                    input.query
                ),
                input.query,
                `/users/${input.path.userId}/period-plans`
            )
        ),
    get: async (ctx, input) =>
        respond(
            await ctx.periodPlanService.getById(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id
            ),
            ApiResponse.ok
        ),
    create: async (ctx, input) =>
        respond(
            await ctx.periodPlanService.create(
                await ctx.resolveUserContext(input.path.userId),
                input.body
            ),
            ApiResponse.created,
            problemInput.body
        ),
    patch: async (ctx, input) =>
        respond(
            await ctx.periodPlanService.patch(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id,
                input.body
            ),
            ApiResponse.ok,
            problemInput.body
        ),
    remove: async (ctx, input) =>
        respond(
            await ctx.periodPlanService.remove(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id
            ),
            () => ApiResponse.noContent()
        )
};

const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    periodPlanActions
);

export default {
    contracts,
    router,
    registry,
    authRegistry,
    paths: {
        entity: (userId: number, id: number) =>
            `/users/${userId}/period-plans/${id}`
    }
};
