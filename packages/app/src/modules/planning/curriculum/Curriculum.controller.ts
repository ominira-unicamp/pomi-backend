import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/planning/curriculum/Curriculum.contract.js";
import { curriculumProblemResponses } from "#/modules/planning/curriculum/Curriculum.problems.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    createResultResponder,
    problemInput,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";

const { schema: _schema, summarySchema: _summarySchema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder(curriculumProblemResponses);

const actions: Actions = {
    list: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.curriculumService.list(
                    await ctx.resolveUserContext(input.path.userId),
                    input.query
                ),
                input.query,
                unpaginatedByDefault,
                `/users/${input.path.userId}/curriculums`
            )
        ),
    get: async (ctx, input) =>
        respond(
            await ctx.curriculumService.getById(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id
            ),
            ApiResponse.ok
        ),
    create: async (ctx, input) =>
        respond(
            await ctx.curriculumService.create(
                await ctx.resolveUserContext(input.path.userId),
                input.body
            ),
            ApiResponse.created,
            problemInput.body
        ),
    patch: async (ctx, input) =>
        respond(
            await ctx.curriculumService.patch(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id,
                input.body
            ),
            ApiResponse.ok,
            problemInput.body
        ),
    remove: async (ctx, input) =>
        respond(
            await ctx.curriculumService.remove(
                await ctx.resolveUserContext(input.path.userId),
                input.path.id
            ),
            () => ApiResponse.noContent()
        )
};

const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    actions
);

export default {
    contracts,
    router,
    registry,
    authRegistry,
    paths: {
        entity: (userId: number, id: number) =>
            `/users/${userId}/curriculums/${id}`
    }
};
