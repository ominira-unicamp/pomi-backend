import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    equalityOperators,
    filterDefinition,
    getPaginatedSchema,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    resourceSortSchema,
    serializeQueryParams,
    SpecBuilder,
    unpaginatedByDefault,
    type Filter,
    type FilterValue
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export const catalogCoursePaths = {
    list: (query: ListQueryParams = {}) => {
        const search = serializeQueryParams(
            query as unknown as Record<string, unknown>
        );
        return `/catalog-courses${search ? `?${search}` : ""}`;
    },
    entity: (id: number) => `/catalog-courses/${id}`
};

const basePath = [pathSeg.literal("catalog-courses")];
const tags = ["catalog-courses"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "catalogCourses",
    operationName: "CatalogCourses",
    pathParameters: { id: "catalogCourseId" }
});

const prerequisiteFulfillmentSchema = z
    .enum(["FULL", "PARTIAL"])
    .openapi("CatalogCoursePrerequisiteFulfillment", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "CatalogCoursePrerequisiteFulfillment"
        }
    });

const specialRequirementTypeSchema = z
    .enum(["AUTHORIZATION", "PROGRESSION_COEFFICIENT"])
    .openapi("CatalogCourseSpecialRequirementType", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "CatalogCourseSpecialRequirementType"
        }
    });

const offeringPeriodValues = [
    "ALL_PERIODS",
    "ODD_PERIODS",
    "EVEN_PERIODS",
    "UNIT_DISCRETION"
] as const;
const offeringPeriod = z
    .enum(offeringPeriodValues)
    .openapi("CourseOfferingPeriod", {
        "x-pomi-schema": {
            kind: "value-object",
            publicName: "CourseOfferingPeriod"
        }
    });

const coordinator = z
    .object({
        id: z.number().int(),
        name: z.string().min(1)
    })
    .strict();

const workload = z
    .object({
        theoreticalHours: z.number().int().nullable(),
        practicalHours: z.number().int().nullable(),
        laboratoryHours: z.number().int().nullable(),
        guidedActivityHours: z.number().int().nullable(),
        distanceHours: z.number().int().nullable(),
        guidedExtensionHours: z.number().int().nullable(),
        practicalExtensionHours: z.number().int().nullable(),
        weeks: z.number().int().nullable(),
        weeklyClassHours: z.number().int().nullable(),
        classroomHours: z.number().int().nullable()
    })
    .strict();

const prerequisiteItem = z.union([
    z
        .object({
            courseId: z.number().int(),
            fulfillment: prerequisiteFulfillmentSchema
        })
        .strict(),
    z
        .object({
            specialRequirementType: specialRequirementTypeSchema,
            specialRequirementValue: z.number().int().min(0).max(100)
        })
        .strict()
]);

export type CatalogCourseFilterValue = FilterValue;
export type CatalogCourseFilter = Filter;

const catalogCourseFilterDefinitions = {
    "catalogId": filterDefinition.id(),
    "catalogYear": filterDefinition.integer(),
    "courseId": filterDefinition.id(),
    "courseCode": filterDefinition.code({ nonEmpty: false }),
    "unit.id": filterDefinition.id(),
    "unit.code": filterDefinition.code({
        nonEmpty: false,
        operators: equalityOperators
    }),
    "coordinatorId": filterDefinition.id(),
    "offeringPeriod": filterDefinition.enum(offeringPeriodValues)
};
export type CatalogCourseFilterName =
    keyof typeof catalogCourseFilterDefinitions;

const catalogCourseFilter = resourceFilterSchema(
    catalogCourseFilterDefinitions,
    "catalog courses",
    "Structured catalog course filters. Use bracket notation such as filter[unit][code]=IC."
);

export const catalogCourseSort = defineSort({
    resourceName: "catalog courses",
    sortableFields: ["catalogYear", "code", "name", "credits"] as const,
    defaultSort: [
        { field: "catalogYear", direction: "desc" },
        { field: "code", direction: "asc" }
    ],
    tieBreakers: [{ field: "id", direction: "asc" }]
});

const prerequisites = z
    .object({
        any: z.array(z.object({ all: z.array(prerequisiteItem) }).strict())
    })
    .strict();

const catalogCourseEntity = z
    .object({
        id: z.number().int(),
        catalogId: z.number().int(),
        catalogYear: z.number().int(),
        courseId: z.number().int(),
        code: z.string().min(1),
        name: z.string().min(1),
        credits: z.number().int().min(0),
        coordinator: coordinator.nullable(),
        workload,
        offeringPeriod: offeringPeriod.nullable(),
        evaluation: z.string().nullable(),
        finalExam: z.boolean().nullable(),
        minimumAttendancePercent: z.number().int().nullable(),
        syllabus: z.string().nullable(),
        bibliography: z.string().nullable(),
        sourceUrl: z.string().nullable(),
        prerequisites
    })
    .strict()
    .openapi("CatalogCourseEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "CatalogCourse",
            identityFields: ["id"]
        }
    });

const listQuery = createPaginationQuerySchema(unpaginatedByDefault, {
    filter: catalogCourseFilter.optional(),
    sort: resourceSortSchema(catalogCourseSort).optional()
})
    .strict()
    .openapi("ListCatalogCoursesQuery", {
        "x-pomi-schema": {
            kind: "input",
            publicName: "ListCatalogCoursesQuery"
        }
    });

export type ListQueryParams = z.infer<typeof listQuery>;

const list = {
    meta: {
        ...specsBuilder.list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({ query: listQuery }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(catalogCourseEntity),
            "List of catalog courses retrieved successfully"
        )
        .build()
} satisfies IO;

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({ id: pathParam.integer() }).strict()
    }),
    response: new OutputBuilder()
        .ok(catalogCourseEntity, "Catalog course retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

export default { schema: catalogCourseEntity, list, get };
