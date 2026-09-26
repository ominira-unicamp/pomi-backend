import {
    ApiResponse,
    ResourceNotFoundProblem,
    buildPaginationPath,
    buildPaginationResponse,
    createResultResponder,
    paginateItems,
    paginatedByDefault,
    problemResponse,
    resolvePagination,
    type EndpointActions
} from "@pomi/api-core";

import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/academic/evaluation-summary/EvaluationSummary.contract.js";

const {
    professorSummary: _professorSummary,
    courseSummary: _courseSummary,
    pairSummary: _pairSummary,
    ...contracts
} = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder({
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem)
});

const professorSummaries: Actions["professorSummaries"] = async (
    ctx,
    input
) => {
    const summaries = await ctx.evaluationSummaryService.listProfessorSummaries(
        input.query
    );
    const pagination = resolvePagination(input.query, paginatedByDefault);
    return ApiResponse.ok(
        buildPaginationResponse<typeof IO.professorSummary>(
            paginateItems(summaries, pagination),
            summaries.length,
            pagination,
            (link) =>
                buildPaginationPath(
                    "/professors/evaluation-summaries",
                    input.query,
                    link
                )
        )
    );
};

const courseSummaries: Actions["courseSummaries"] = async (ctx, input) => {
    const summaries = await ctx.evaluationSummaryService.listCourseSummaries(
        input.query
    );
    const pagination = resolvePagination(input.query, paginatedByDefault);
    return ApiResponse.ok(
        buildPaginationResponse<typeof IO.courseSummary>(
            paginateItems(summaries, pagination),
            summaries.length,
            pagination,
            (link) =>
                buildPaginationPath(
                    "/courses/evaluation-summaries",
                    input.query,
                    link
                )
        )
    );
};

const pair: Actions["pair"] = async (ctx, input) => {
    return respond(
        await ctx.evaluationSummaryService.getPairSummary(input.query.filter),
        ApiResponse.ok
    );
};

const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    { professorSummaries, courseSummaries, pair }
);

export default { contracts, router, registry, authRegistry };
