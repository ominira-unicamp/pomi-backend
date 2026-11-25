import {
    ApiResponse,
    buildQueryPaginationResponse,
    createResultResponder,
    problemInput,
    type EndpointActions
} from "@pomi/api-core";

import { createAppEndpointRegistries, type Context } from "#/BuildHandler.js";
import type { AuthorizationPolicy } from "#/auth.js";
import IO from "#/modules/student/Student.contract.js";
import { studentProblemResponses } from "#/modules/student/Student.problems.js";

const { schema: _schema, ...contracts } = IO;
type Actions = EndpointActions<typeof contracts, AuthorizationPolicy, Context>;
const respond = createResultResponder(studentProblemResponses);

const list: Actions["list"] = async (ctx, input) =>
    ApiResponse.ok(
        buildQueryPaginationResponse(
            await ctx.studentService.list(input.query),
            input.query,
            "/admin/students"
        )
    );

const get: Actions["get"] = async (ctx, input) =>
    respond(
        await ctx.studentService.getForUser(input.path.userId),
        ApiResponse.ok
    );

const create: Actions["create"] = async (ctx, input) => {
    const result = await ctx.studentService.create(
        await ctx.resolveUserContext(input.path.userId),
        input.body
    );
    return respond(
        result,
        ({ student, linked }) =>
            linked ? ApiResponse.ok(student) : ApiResponse.created(student),
        problemInput.body
    );
};

const patch: Actions["patch"] = async (ctx, input) =>
    respond(
        await ctx.studentService.patchForUser(input.path.userId, input.body),
        ApiResponse.ok,
        problemInput.body
    );

const remove: Actions["remove"] = async (ctx, input) =>
    respond(
        await ctx.studentService.removeForUser(
            input.path.userId,
            input.body.confirmationRa
        ),
        () => ApiResponse.noContent(),
        problemInput.body
    );

const { router, registry, authRegistry } = createAppEndpointRegistries(
    contracts,
    {
        list,
        get,
        create,
        patch,
        remove
    }
);

export default {
    contracts,
    router,
    registry,
    authRegistry,
    paths: { entity: (userId: number) => `/users/${userId}/student` }
};
