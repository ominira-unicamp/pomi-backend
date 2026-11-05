import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { periodPlanningClass } from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    ResourceNotFoundProblemSchema,
    resourceSortSchema,
    SpecBuilder,
    YearPeriodSchema,
    type Filter,
    type PaginationPolicy
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const sharedPlanningVisibilitySchema = z
    .enum(["FRIENDS", "PUBLIC"])
    .openapi("SharedPlanningVisibility", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "SharedPlanningVisibility"
        }
    });

const sharedPeriodPlanning = z
    .object({
        shareId: z.string().uuid(),
        name: z.string(),
        visibility: sharedPlanningVisibilitySchema,
        studyPeriodId: z.number().int(),
        studyPeriodYear: z.number().int(),
        studyPeriodYearPeriod: YearPeriodSchema,
        owner: z
            .object({
                publicId: z.string().uuid(),
                displayName: z.string(),
                avatarMediaId: z.uuid().nullable()
            })
            .strict()
            .nullable(),
        classes: z.array(periodPlanningClass),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime()
    })
    .strict()
    .openapi("SharedPeriodPlanning", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "SharedPeriodPlanning",
            identityFields: ["shareId"],
            relations: {
                classes: { resource: "classes", cardinality: "many" }
            }
        }
    });
const sharedPeriodPlanningPage = getPaginatedSchema(
    sharedPeriodPlanning
).openapi("SharedPeriodPlanningPage", {
    "x-pomi-schema": {
        kind: "page",
        publicName: "SharedPeriodPlanningPage"
    }
});

export const sharedPeriodPlanningPagination = {
    defaultMode: "page",
    defaultPageSize: 20,
    maxPageSize: 50,
    allowAll: false
} satisfies PaginationPolicy;

const publicPath = [pathSeg.literal("shared-period-plans")];
const studentPath = [
    pathSeg.literal("users"),
    pathSeg.param("userId"),
    pathSeg.literal("shared-period-plans")
];
const publicFilter = resourceFilterSchema(
    { studyPeriodId: filterDefinition.id() },
    "shared period plannings",
    "Structured shared planning filters. Use filter[studyPeriodId]=42.",
    { studyPeriodId: 42 }
);
const studentFilter = resourceFilterSchema(
    { ownerPublicId: filterDefinition.uuid() },
    "student shared period plannings",
    "Structured shared planning filters. Use filter[ownerPublicId]=UUID.",
    { ownerPublicId: "a375fdb0-45d9-4a79-8415-89fcb64157b6" }
);
export type SharedPeriodPlanningFilter = Filter;
export const sharedPeriodPlanningSort = defineSort({
    resourceName: "shared period plannings",
    sortableFields: ["updatedAt", "name", "studyPeriodYear"] as const,
    defaultSort: [{ field: "updatedAt", direction: "desc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});
const publicQuery = createPaginationQuerySchema(
    sharedPeriodPlanningPagination,
    {
        query: z.string().trim().min(1).optional(),
        filter: publicFilter.optional(),
        sort: resourceSortSchema(sharedPeriodPlanningSort).optional()
    }
)
    .strict()
    .openapi("ListPublicSharedPeriodPlansQuery", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "ListPublicSharedPeriodPlansQuery"
        }
    });
const sidPath = z.object({
    userId: pathParam.integer()
});
const sharePath = z.object({ shareId: z.string().uuid() });

const listPublic = {
    meta: {
        operationId: "listPublicSharedPeriodPlans",
        method: "get" as const,
        path: publicPath,
        tags: ["shared-period-plans"],
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        sdk: {
            resource: "sharedPeriodPlans",
            action: "list" as const,
            method: "list"
        },
        pagination: sharedPeriodPlanningPagination
    },
    request: z.object({ query: publicQuery }),
    response: new OutputBuilder()
        .ok(sharedPeriodPlanningPage, "Planejamentos públicos recuperados")
        .build()
} satisfies IO;

const getPublic = {
    meta: {
        operationId: "getPublicSharedPeriodPlan",
        sdk: {
            resource: "sharedPeriodPlans",
            method: "getPublic",
            action: "get" as const,
            pathParameters: { shareId: "shareId" }
        },
        method: "get" as const,
        path: [...publicPath, pathSeg.param("shareId")],
        tags: ["shared-period-plans"],
        authorization: policies.public
    },
    request: z.object({ path: sharePath }),
    response: new OutputBuilder()
        .ok(sharedPeriodPlanning, "Planejamento público recuperado")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Planejamento não encontrado"
        )
        .build()
} satisfies IO;

const listForUser = {
    meta: {
        operationId: "listUserSharedPeriodPlans",
        method: "get" as const,
        path: studentPath,
        tags: ["shared-period-plans"],
        authorization: policies.userAccess(
            "userId",
            StudentCapabilities.PLANNING_READ
        ),
        queryFeatures: { filter: true, sort: true },
        sdk: {
            resource: "userSharedPeriodPlans",
            action: "list" as const,
            method: "list",
            pathParameters: { userId: "userId" }
        },
        pagination: sharedPeriodPlanningPagination
    },
    request: z.object({
        path: sidPath,
        query: createPaginationQuerySchema(sharedPeriodPlanningPagination, {
            filter: studentFilter.optional(),
            sort: resourceSortSchema(sharedPeriodPlanningSort).optional()
        })
            .strict()
            .openapi("ListUserSharedPeriodPlansQuery", {
                "x-pomi-schema": {
                    kind: "input",
                    publicName: "ListUserSharedPeriodPlansQuery"
                }
            })
    }),
    response: new OutputBuilder()
        .ok(
            sharedPeriodPlanningPage,
            "Planejamentos compartilhados recuperados"
        )
        .build()
} satisfies IO;

const getForUser = {
    meta: {
        operationId: "getUserSharedPeriodPlan",
        sdk: {
            resource: "sharedPeriodPlans",
            method: "getForUser",
            action: "get" as const,
            pathParameters: { userId: "userId", shareId: "shareId" }
        },
        method: "get" as const,
        path: [...studentPath, pathSeg.param("shareId")],
        tags: ["shared-period-plans"],
        authorization: policies.userAccess(
            "userId",
            StudentCapabilities.PLANNING_READ
        )
    },
    request: z.object({ path: sidPath.extend(sharePath.shape) }),
    response: new OutputBuilder()
        .ok(sharedPeriodPlanning, "Planejamento compartilhado recuperado")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Planejamento não encontrado"
        )
        .build()
} satisfies IO;

export default {
    schema: sharedPeriodPlanning,
    listPublic,
    getPublic,
    listForUser,
    getForUser,
    specsBuilder: new SpecBuilder(
        publicPath,
        ["shared-period-plans"],
        "shareId",
        {
            resource: "sharedPeriodPlans",
            operationName: "PublicSharedPeriodPlans",
            pathParameters: { shareId: "shareId" }
        }
    )
};
