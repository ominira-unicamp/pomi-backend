import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    filterDefinition,
    getPaginatedSchema,
    paginationQuerySchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    SpecBuilder,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const classPaths = {
    entity: (id: number) => `/classes/${id}`
};

const basePath = [pathSeg.literal("classes")];
const tags = ["classes"];
const specsBuilder = new SpecBuilder(basePath, tags, "id");

const classEntity = z
    .object({
        id: z.number().int(),
        code: z.string(),
        reservations: z.array(z.number().int()),
        courseId: z.number().int(),
        studyPeriodId: z.number().int(),
        professorIds: z.array(z.number().int()),
        studyPeriodYear: z.number().int(),
        studyPeriodYearPeriod: z.enum([
            "SUMMER",
            "FIRST_SEMESTER",
            "WINTER",
            "SECOND_SEMESTER"
        ]),
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
        ),
        _paths: z
            .object({
                studyPeriod: z.string(),
                unit: z.string().nullable(),
                course: z.string(),
                class: z.string(),
                classSchedules: z.string(),
                professors: z.string()
            })
            .strict()
    })
    .strict()
    .openapi("ClassEntity");

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

const listClassesQuery = paginationQuerySchema
    .extend({ filter: classFilter.optional() })
    .strict()
    .openapi("GetClassesQuery");

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
        queryFeatures: { filter: true }
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
