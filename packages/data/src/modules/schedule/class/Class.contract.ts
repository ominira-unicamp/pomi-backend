import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    paginatedByDefault,
    paginationQuerySchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    resourceSortSchema,
    SpecBuilder,
    YearPeriodSchema,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const classPaths = {
    entity: (id: number) => `/classes/${id}`
};

const basePath = [pathSeg.literal("classes")];
const tags = ["classes"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "classes",
    operationName: "Classes",
    pathParameters: { id: "classeId" }
});

const classEntity = z
    .object({
        id: z.number().int(),
        code: z.string(),
        reservationPrograms: z.array(
            z
                .object({
                    id: z.number().int(),
                    code: z.number().int(),
                    name: z.string()
                })
                .strict()
        ),
        courseId: z.number().int(),
        studyPeriodId: z.number().int(),
        professorIds: z.array(z.number().int()),
        studyPeriodYear: z.number().int(),
        studyPeriodYearPeriod: YearPeriodSchema,
        courseCode: z.string(),
        unitId: z.number().int().nullable(),
        unitCode: z.string().nullable(),
        professors: z.array(
            z
                .object({
                    id: z.number().int(),
                    name: z.string()
                })
                .strict()
        )
    })
    .strict()
    .openapi("ClassEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Class",
            identityFields: ["id"]
        }
    });

export type ClassFilter = Filter;
const classFilterDefinitions = {
    classCode: filterDefinition.code({ operators: ["eq"] }),
    unitId: filterDefinition.id(),
    unitCode: filterDefinition.code({ operators: ["eq"] }),
    courseId: filterDefinition.id(),
    courseCode: filterDefinition.code({ operators: ["eq"] }),
    studyPeriodId: filterDefinition.id(),
    studyPeriodYear: filterDefinition.integer(),
    studyPeriodYearPeriod: filterDefinition.enum([
        "SUMMER",
        "FIRST_SEMESTER",
        "WINTER",
        "SECOND_SEMESTER"
    ]),
    professorId: filterDefinition.id(),
    professorName: filterDefinition.code({ operators: ["eq"] })
};
export type ClassFilterName = keyof typeof classFilterDefinitions;
const classFilter = resourceFilterSchema(
    classFilterDefinitions,
    "classes",
    "Structured class filters. Use bracket notation such as filter[courseCode]=MC102."
);
export const classSort = defineSort({
    resourceName: "classes",
    sortableFields: [
        "id",
        "classCode",
        "courseCode",
        "studyPeriodYear"
    ] as const,
    defaultSort: [{ field: "id", direction: "asc" }] as const,
    tieBreakers: [] as const
});

const listClassesQuery = paginationQuerySchema
    .extend({
        filter: classFilter.optional(),
        sort: resourceSortSchema(classSort).optional()
    })
    .strict()
    .openapi("GetClassesQuery", {
        "x-pomi-schema": { kind: "input", publicName: "GetClassesQuery" }
    });

const PageClassesSchema = getPaginatedSchema(classEntity);

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(classEntity, "Class retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

const list = {
    meta: {
        ...specsBuilder.list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: paginatedByDefault
    },
    request: z.object({
        query: listClassesQuery
    }),
    response: new OutputBuilder()
        .ok(PageClassesSchema, "List of classes retrieved successfully")
        .badRequest()
        .build()
} satisfies IO;

export default {
    schema: classEntity,
    get,
    list
};

export type ListQueryParams = Partial<z.infer<typeof listClassesQuery>>;
