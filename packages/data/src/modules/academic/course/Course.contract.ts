import { OutputBuilder } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineResource,
    equalityOperators,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    serializeQueryParams,
    type Filter,
    type FilterValue,
    type PaginationPolicy
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const coursePaths = {
    list: (query: ListQueryParams = {}) => {
        const search = serializeQueryParams(
            query as unknown as Record<string, unknown>
        );
        return `/courses${search ? `?${search}` : ""}`;
    },
    entity: (id: number) => `/courses/${id}`
};

const courses = defineResource({
    collectionPath: [pathSeg.literal("courses")],
    memberParameter: "id",
    tag: "courses",
    operationName: "Courses",
    sdk: {
        resource: "courses",
        pathParameters: { id: "courseId" }
    }
});

const courseEntity = z
    .object({
        id: z.number().int(),
        code: z.string().min(1),
        name: z.string().min(1),
        credits: z.number().int().min(0),
        prefix: z.string().min(1),
        unitId: z.number().int().nullable(),
        unitCode: z.string().min(1).nullable(),
        _paths: z
            .object({
                classes: z.string(),
                unit: z.string().nullable(),
                catalogCourses: z.string()
            })
            .strict()
    })
    .strict()
    .openapi("CourseEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Course",
            identityFields: ["id"],
            transportFields: ["_paths"]
        }
    });

export type CourseFilterValue = FilterValue;
export type CourseFilter = Filter;

const courseFilterDefinitions = {
    "catalogYear": filterDefinition.integer(),
    "code": filterDefinition.code(),
    "credits": filterDefinition.integer({
        minimum: 0,
        operators: ["eq", "ne", "gt", "gte", "lt", "lte", "in"]
    }),
    "tagId": filterDefinition.id({ positive: true }),
    "unit.code": filterDefinition.code({ operators: equalityOperators }),
    "unit.id": filterDefinition.id({ positive: true })
};
export type CourseFilterName = keyof typeof courseFilterDefinitions;

const courseFilter = resourceFilterSchema(
    courseFilterDefinitions,
    "courses",
    "Structured course filters. Use bracket notation such as filter[credits][gte]=4.",
    {
        credits: { gte: 4 },
        unit: { code: "IC" }
    }
);

export const coursePagination = {
    defaultMode: "all",
    defaultPageSize: 20,
    maxPageSize: 1000,
    allowAll: true
} satisfies PaginationPolicy;

const PageCoursesSchema = getPaginatedSchema(courseEntity).openapi(
    "PageCourses",
    {
        "x-pomi-schema": {
            kind: "page",
            publicName: "PageCourses",
            transportFields: ["_paths"]
        }
    }
);

const listCourseQuery = createPaginationQuerySchema(coursePagination, {
    filter: courseFilter.optional()
})
    .strict()
    .openapi("ListCoursesQuery", {
        "x-pomi-schema": { kind: "input", publicName: "ListCoursesQuery" }
    });

const get = courses.get({
    authorization: policies.public,
    operationId: "getCourses",
    request: z.object({
        path: z.object({ id: pathParam.integer() }).strict()
    }),
    response: new OutputBuilder()
        .ok(courseEntity, "Course retrieved successfully")
        .notFound()
        .build()
});

const list = courses.list({
    authorization: policies.public,
    operationId: "listCourses",
    item: courseEntity,
    pagination: coursePagination,
    request: z.object({ query: listCourseQuery }),
    response: new OutputBuilder()
        .ok(PageCoursesSchema, "List of courses retrieved successfully")
        .build()
});

export type ListQueryParams = z.infer<typeof list.request.shape.query>;

export default {
    schema: courseEntity,
    get,
    list
};
