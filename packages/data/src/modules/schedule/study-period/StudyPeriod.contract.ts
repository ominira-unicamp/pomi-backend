import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    resourceSortSchema,
    SpecBuilder,
    unpaginatedByDefault,
    YearPeriodSchema,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const studyPeriodPaths = {
    entity: (id: number) => `/study-periods/${id}`
};

const basePath = [pathSeg.literal("study-periods")];
const tags = ["study-periods"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "studyPeriods",
    operationName: "StudyPeriods",
    pathParameters: { id: "studyPeriodId" }
});

const studyPeriodEntity = z
    .object({
        id: z.number().int(),
        year: z.number().int(),
        yearPeriod: YearPeriodSchema,
        startDate: z.union([z.string(), z.date()]).pipe(z.coerce.date())
    })
    .strict()
    .openapi("StudyPeriodEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "StudyPeriod",
            identityFields: ["id"]
        }
    });

export type StudyPeriodFilter = Filter;
const studyPeriodFilterDefinitions = {
    id: filterDefinition.id(),
    year: filterDefinition.integer(),
    yearPeriod: filterDefinition.enum([
        "SUMMER",
        "FIRST_SEMESTER",
        "WINTER",
        "SECOND_SEMESTER"
    ])
};
export type StudyPeriodFilterName = keyof typeof studyPeriodFilterDefinitions;
const studyPeriodFilter = resourceFilterSchema(
    studyPeriodFilterDefinitions,
    "study periods",
    "Structured study period filters. Use bracket notation such as filter[year]=2025."
);
export const studyPeriodSort = defineSort({
    resourceName: "study periods",
    sortableFields: ["id", "year", "yearPeriod", "startDate"] as const,
    defaultSort: [{ field: "id", direction: "asc" }] as const,
    tieBreakers: [] as const
});

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(studyPeriodEntity, "Study period retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

const list = {
    meta: {
        ...specsBuilder.list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: studyPeriodFilter.optional(),
            sort: resourceSortSchema(studyPeriodSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(studyPeriodEntity),
            "List of study periods retrieved successfully"
        )
        .build()
} satisfies IO;

export default {
    schema: studyPeriodEntity,
    get,
    list
};
