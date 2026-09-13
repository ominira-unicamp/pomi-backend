import { createDataEndpointRegistries, type Context } from "#/BuildHandler.js";
import {
    ApiResponse,
    buildArrayPaginationResponse,
    buildPaginationPath,
    buildPaginationResponse,
    createResultResponder,
    paginatedByDefault,
    problemResponse,
    resolvePagination,
    ResourceNotFoundProblem,
    unpaginatedByDefault,
    type EndpointActions
} from "@pomi/api-core";
import IO, {
    coauthorSchema,
    keywordSchema,
    profileSummary
} from "./ProfessorDataPortal.contract.js";
const { profile, positions, departments, keywords, coauthors } = IO;
const respond = createResultResponder({
    [ResourceNotFoundProblem.type]: problemResponse(ResourceNotFoundProblem)
});
const contracts = {
    profileList: profile.list,
    profileGet: profile.get,
    positionList: positions.list,
    positionGet: positions.get,
    departmentList: departments.list,
    departmentGet: departments.get,
    keywordList: keywords.list,
    keywordGet: keywords.get,
    coauthorList: coauthors.list,
    coauthorGet: coauthors.get
};
type Actions = EndpointActions<typeof contracts, unknown, Context>;
const actions: Actions = {
    profileList: async (ctx, input) => {
        const result = await ctx.professorDataPortalService.listProfiles(
            input.query
        );
        const pagination = resolvePagination(input.query, paginatedByDefault);
        return ApiResponse.ok(
            buildPaginationResponse<typeof profileSummary>(
                result.items,
                result.total,
                pagination,
                (link) =>
                    buildPaginationPath(
                        "/professor-data-portal-profiles",
                        input.query,
                        link
                    )
            )
        );
    },
    profileGet: async (ctx, input) =>
        respond(
            await ctx.professorDataPortalService.getProfile(input.path.id),
            ApiResponse.ok
        ),
    positionList: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.professorDataPortalService.listPositions(input.query),
                input.query,
                unpaginatedByDefault,
                "/professor-positions"
            )
        ),
    positionGet: async (ctx, input) =>
        respond(
            await ctx.professorDataPortalService.getPosition(input.path.id),
            ApiResponse.ok
        ),
    departmentList: async (ctx, input) =>
        ApiResponse.ok(
            buildArrayPaginationResponse(
                await ctx.professorDataPortalService.listDepartments(
                    input.query
                ),
                input.query,
                unpaginatedByDefault,
                "/departments"
            )
        ),
    departmentGet: async (ctx, input) =>
        respond(
            await ctx.professorDataPortalService.getDepartment(input.path.id),
            ApiResponse.ok
        ),
    keywordList: async (ctx, input) => {
        const result = await ctx.professorDataPortalService.listKeywords(
            input.query
        );
        const pagination = resolvePagination(input.query, paginatedByDefault);
        return ApiResponse.ok(
            buildPaginationResponse<typeof keywordSchema>(
                result.items,
                result.total,
                pagination,
                (link) => buildPaginationPath("/keywords", input.query, link)
            )
        );
    },
    keywordGet: async (ctx, input) =>
        respond(
            await ctx.professorDataPortalService.getKeyword(input.path.id),
            ApiResponse.ok
        ),
    coauthorList: async (ctx, input) => {
        const result = await ctx.professorDataPortalService.listCoauthors(
            input.query
        );
        const pagination = resolvePagination(input.query, paginatedByDefault);
        return ApiResponse.ok(
            buildPaginationResponse<typeof coauthorSchema>(
                result.items,
                result.total,
                pagination,
                (link) => buildPaginationPath("/coauthors", input.query, link)
            )
        );
    },
    coauthorGet: async (ctx, input) =>
        respond(
            await ctx.professorDataPortalService.getCoauthor(input.path.id),
            ApiResponse.ok
        )
};
const { router, registry, authRegistry } = createDataEndpointRegistries(
    contracts,
    actions
);
export default {
    contracts,
    router,
    registry,
    authRegistry,
    paths: { profile: (id: number) => `/professor-data-portal-profiles/${id}` }
};
