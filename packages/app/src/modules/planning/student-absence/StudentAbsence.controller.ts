import {
    ApiResponse,
    buildQueryPaginationResponse,
    createResultResponder,
    problemInput,
    type EndpointActions
} from "@pomi/api-core";

import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/planning/student-absence/StudentAbsence.contract.js";
import { studentAbsenceProblemResponses } from "#/modules/planning/student-absence/StudentAbsence.problems.js";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder(studentAbsenceProblemResponses);

const list: Actions["list"] = async (ctx, input) =>
    ApiResponse.ok(
        buildQueryPaginationResponse(
            await ctx.studentAbsenceService.list(
                await ctx.resolveUserContext(input.path.userId),
                input.query
            ),
            input.query,
            `/users/${input.path.userId}/absences`
        )
    );

const create: Actions["create"] = async (ctx, input) =>
    respond(
        await ctx.studentAbsenceService.create(
            await ctx.resolveUserContext(input.path.userId),
            { ...input.body, courseAttemptId: input.path.attemptId }
        ),
        ApiResponse.created,
        problemInput.body
    );

const remove: Actions["remove"] = async (ctx, input) =>
    respond(
        await ctx.studentAbsenceService.remove(
            await ctx.resolveUserContext(input.path.userId),
            input.path.id,
            input.path.attemptId
        ),
        () => ApiResponse.noContent()
    );

const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    { list, create, remove }
);

export default {
    contracts,
    router,
    registry,
    authRegistry,
    paths: {
        entity: (userId: number, courseAttemptId: number, id: number) =>
            `/users/${userId}/course-attempts/${courseAttemptId}/absences/${id}`,
        list: (userId: number) => `/users/${userId}/absences`
    }
};
