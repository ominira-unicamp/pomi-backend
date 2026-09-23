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
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const basePath = [pathSeg.literal("calendar-tags")];
const tags = ["calendar-tags"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "calendarTags",
    operationName: "CalendarTags",
    pathParameters: { id: "calendarTagId" }
});

const schema = z
    .object({
        id: z.number().int(),
        name: z.string()
    })
    .strict()
    .openapi("CalendarTag", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "CalendarTag",
            identityFields: ["id"]
        }
    });

export type CalendarTagFilter = Filter;
const calendarTagFilterDefinitions = {
    id: filterDefinition.id(),
    name: filterDefinition.code({ operators: ["eq"] })
};
export type CalendarTagFilterName = keyof typeof calendarTagFilterDefinitions;
const calendarTagFilter = resourceFilterSchema(
    calendarTagFilterDefinitions,
    "calendar tags",
    "Structured calendar tag filters. Use bracket notation such as filter[name]=feriado."
);
export const calendarTagSort = defineSort({
    resourceName: "calendar tags",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({ id: pathParam.positiveInteger() })
    }),
    response: new OutputBuilder()
        .ok(schema, "Calendar tag retrieved successfully")
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
            filter: calendarTagFilter.optional(),
            sort: resourceSortSchema(calendarTagSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(schema),
            "List of calendar tags retrieved successfully"
        )
        .build()
} satisfies IO;

export default {
    schema,
    get,
    list
};
