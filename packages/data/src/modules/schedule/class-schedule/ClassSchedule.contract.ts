import { type IO, OutputBuilder } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    DayOfWeekSchema,
    defineSort,
    equalityOperators,
    type Filter,
    filterDefinition,
    type FilterValue,
    getPaginatedSchema,
    paginatedByDefault,
    paginationQuerySchema,
    PaginationQueryType,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    ResourceNotFoundProblemSchema,
    resourceSortSchema,
    serializeQueryParams,
    SpecBuilder,
    YearPeriodSchema
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const basePath = [pathSeg.literal("class-schedules")];
const tags = ["class-schedules"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "classSchedules",
    operationName: "ClassSchedules",
    pathParameters: { id: "classScheduleId" }
});

export const classScheduleDataSchema = z
    .object({
        id: z.number().int(),
        dayOfWeek: DayOfWeekSchema,
        start: z.string(),
        end: z.string(),
        roomId: z.number().int(),
        classId: z.number().int(),
        roomCode: z.string(),
        classCode: z.string(),
        unitId: z.number().int().nullable(),
        unitCode: z.string().nullable(),
        courseId: z.number().int(),
        courseCode: z.string(),
        studyPeriodId: z.number().int(),
        studyPeriodYear: z.number().int(),
        studyPeriodYearPeriod: YearPeriodSchema
    })
    .strict()
    .openapi("ClassScheduleData", {
        "x-pomi-schema": { kind: "projection", publicName: "ClassScheduleData" }
    });

export const classScheduleEntity = classScheduleDataSchema
    .strict()
    .openapi("ClassScheduleEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "ClassSchedule",
            identityFields: ["id"],
            relations: {
                roomId: { resource: "rooms", cardinality: "one" },
                classId: { resource: "classes", cardinality: "one" },
                unitId: {
                    resource: "units",
                    cardinality: "one",
                    nullable: true
                },
                courseId: { resource: "courses", cardinality: "one" },
                studyPeriodId: {
                    resource: "studyPeriods",
                    cardinality: "one"
                }
            }
        }
    });

export type ClassScheduleFilterValue = FilterValue;
export type ClassScheduleFilter = Filter;

const classScheduleFilterDefinitions = {
    "dayOfWeek": filterDefinition.enum([
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY"
    ]),
    "room.id": filterDefinition.id(),
    "room.code": filterDefinition.code({
        nonEmpty: false,
        operators: equalityOperators
    }),
    "class.id": filterDefinition.id(),
    "course.id": filterDefinition.id(),
    "course.code": filterDefinition.code({
        nonEmpty: false,
        operators: equalityOperators
    }),
    "unit.id": filterDefinition.id(),
    "unit.code": filterDefinition.code({
        nonEmpty: false,
        operators: equalityOperators
    }),
    "studyPeriod.id": filterDefinition.id(),
    "studyPeriod.year": filterDefinition.integer(),
    "studyPeriod.yearPeriod": filterDefinition.enum([
        "SUMMER",
        "FIRST_SEMESTER",
        "WINTER",
        "SECOND_SEMESTER"
    ])
};
export type ClassScheduleFilterName =
    keyof typeof classScheduleFilterDefinitions;

const classScheduleFilter = resourceFilterSchema(
    classScheduleFilterDefinitions,
    "class schedules",
    "Structured class schedule filters. Use bracket notation such as filter[course][code]=MC102."
);
export const classScheduleSort = defineSort({
    resourceName: "class schedules",
    sortableFields: [
        "id",
        "dayOfWeek",
        "start",
        "end",
        "roomCode",
        "classCode",
        "courseCode",
        "studyPeriodYear"
    ] as const,
    defaultSort: [{ field: "id", direction: "asc" }] as const,
    tieBreakers: [] as const
});

const getClassSchedulesQuery = paginationQuerySchema
    .extend({
        filter: classScheduleFilter.optional(),
        sort: resourceSortSchema(classScheduleSort).optional()
    })
    .strict()
    .openapi("GetClassSchedulesQuery", {
        "x-pomi-schema": { kind: "input", publicName: "GetClassSchedulesQuery" }
    });

const ClassSchedulePageSchema = getPaginatedSchema(classScheduleEntity).openapi(
    "PageClassSchedules",
    {
        "x-pomi-schema": {
            kind: "page",
            publicName: "PageClassSchedules"
        }
    }
);

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(classScheduleEntity, "Class schedule retrieved successfully")
        .problem(
            404,
            ResourceNotFoundProblemSchema,
            "Horário de turma não encontrado"
        )
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
        query: getClassSchedulesQuery
    }),
    response: new OutputBuilder()
        .ok(
            ClassSchedulePageSchema,
            "List of class schedules retrieved successfully"
        )
        .badRequest()
        .build()
} satisfies IO;

const contracts = {
    get,
    list
};

export default contracts;

export type ListQueryParams = Partial<PaginationQueryType>;
export type ClassScheduleListInput = z.infer<typeof getClassSchedulesQuery>;

export const classSchedulePaths = {
    list: (query: Partial<ClassScheduleListInput> = {}) => {
        const search = serializeQueryParams(
            query as unknown as Record<string, unknown>
        );
        return `/class-schedules${search ? `?${search}` : ""}`;
    },
    entity: (id: number) => `/class-schedules/${id}`
};
