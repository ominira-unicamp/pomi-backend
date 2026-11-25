import {
    ApiResponse,
    buildArrayPaginationResponse,
    createResultResponder,
    problemInput,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";

import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/academic/evaluation/professor/ProfessorEvaluation.contract.js";
import { professorEvaluationProblemResponses } from "#/modules/academic/evaluation/professor/ProfessorEvaluation.problems.js";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder(professorEvaluationProblemResponses);

const get: Actions["get"] = async (ctx, input) =>
    respond(
        await ctx.professorEvaluationService.get({
            userId: await ctx.resolveUserContext(input.path.userId),
            classId: input.path.classId,
            professorId: input.path.professorId
        }),
        ApiResponse.ok
    );

const put: Actions["put"] = async (ctx, input) =>
    respond(
        await ctx.professorEvaluationService.put(
            {
                userId: await ctx.resolveUserContext(input.path.userId),
                classId: input.path.classId,
                professorId: input.path.professorId
            },
            input.body
        ),
        ApiResponse.ok,
        problemInput.body
    );

const listPending: Actions["listPending"] = async (ctx, input) =>
    ApiResponse.ok(
        buildArrayPaginationResponse(
            await ctx.professorEvaluationService.listPending(
                await ctx.resolveUserContext(input.path.userId),
                input.query
            ),
            input.query,
            unpaginatedByDefault,
            `/users/${input.path.userId}/professor-evaluations/pending`
        )
    );

const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    { get, put, listPending }
);

export default { contracts, router, registry, authRegistry };
