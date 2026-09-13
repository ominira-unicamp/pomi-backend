import { policies, StudentCapabilities } from "#/Authorization.js";
import { OutputBuilder, type IO } from "#/Contract.js";
import { periodPlanningClass } from "#/modules/planning/period-plan/PeriodPlan.contract.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    ResourceNotFoundProblemSchema,
    SpecBuilder,
    type Filter,
    type PaginationPolicy
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const sharedPeriodPlanning = z
    .object({
        shareId: z.string().uuid(),
        name: z.string(),
        visibility: z.enum(["FRIENDS", "PUBLIC"]),
        studyPeriodId: z.number().int(),
        studyPeriodYear: z.number().int(),
        studyPeriodYearPeriod: z.enum([
            "SUMMER",
            "FIRST_SEMESTER",
            "WINTER",
            "SECOND_SEMESTER"
        ]),
        owner: z
            .object({
                publicId: z.string().uuid(),
                displayName: z.string()
            })
            .strict()
            .nullable(),
        classes: z.array(periodPlanningClass),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime()
    })
    .strict()
    .openapi("SharedPeriodPlanning");
const sharedPeriodPlanningPage = getPaginatedSchema(
    sharedPeriodPlanning
).openapi("SharedPeriodPlanningPage");

export const sharedPeriodPlanningPagination = {
    defaultMode: "page",
    defaultPageSize: 20,
    maxPageSize: 50,
    allowAll: false
} satisfies PaginationPolicy;

const publicPath = [pathSeg.literal("shared-period-plannings")];
const studentPath = [
    pathSeg.literal("student"),
    pathSeg.param("sid"),
    pathSeg.literal("shared-period-plannings")
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
const publicQuery = createPaginationQuerySchema(
    sharedPeriodPlanningPagination,
    {
        query: z.string().trim().min(1).optional(),
        filter: publicFilter.optional()
    }
)
    .strict()
    .openapi("ListPublicSharedPeriodPlanningsQuery");
const sidPath = z.object({
    sid: pathParam.integer()
});
const sharePath = z.object({ shareId: z.string().uuid() });

const listPublic = {
    meta: {
        method: "get" as const,
        path: publicPath,
        tags: ["shared-period-plannings"],
        authorization: policies.public,
        queryFeatures: { filter: true },
        sdk: { resource: "sharedPeriodPlannings", action: "list" as const },
        pagination: sharedPeriodPlanningPagination
    },
    request: z.object({ query: publicQuery }),
    response: new OutputBuilder()
        .ok(sharedPeriodPlanningPage, "Planejamentos públicos recuperados")
        .build()
} satisfies IO;

const getPublic = {
    meta: {
        method: "get" as const,
        path: [...publicPath, pathSeg.param("shareId")],
        tags: ["shared-period-plannings"],
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

const listForStudent = {
    meta: {
        method: "get" as const,
        path: studentPath,
        tags: ["shared-period-plannings"],
        authorization: policies.studentAccess(
            "sid",
            StudentCapabilities.PLANNING_READ
        ),
        queryFeatures: { filter: true },
        sdk: {
            resource: "studentSharedPeriodPlannings",
            action: "list" as const,
            pathParameters: { sid: "studentId" }
        },
        pagination: sharedPeriodPlanningPagination
    },
    request: z.object({
        path: sidPath,
        query: createPaginationQuerySchema(sharedPeriodPlanningPagination, {
            filter: studentFilter.optional()
        })
            .strict()
            .openapi("ListStudentSharedPeriodPlanningsQuery")
    }),
    response: new OutputBuilder()
        .ok(
            sharedPeriodPlanningPage,
            "Planejamentos compartilhados recuperados"
        )
        .build()
} satisfies IO;

const getForStudent = {
    meta: {
        method: "get" as const,
        path: [...studentPath, pathSeg.param("shareId")],
        tags: ["shared-period-plannings"],
        authorization: policies.studentAccess(
            "sid",
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
    listForStudent,
    getForStudent,
    specsBuilder: new SpecBuilder(
        publicPath,
        ["shared-period-plannings"],
        "shareId"
    )
};
