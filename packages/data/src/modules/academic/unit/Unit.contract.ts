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

export const unitPaths = {
    entity: (id: number) => `/units/${id}`
};

const basePath = [pathSeg.literal("units")];
const tags = ["units"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "units",
    operationName: "Units",
    pathParameters: { id: "unitId" }
});

const unitEntity = z
    .object({
        id: z.number().int(),
        code: z.string(),
        name: z.string(),
        _paths: z
            .object({
                classes: z.string(),
                courses: z.string()
            })
            .strict()
    })
    .strict()
    .openapi("UnitEntity", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Unit",
            identityFields: ["id"],
            transportFields: ["_paths"]
        }
    });

export type UnitFilter = Filter;
const unitFilterDefinitions = {
    id: filterDefinition.id(),
    code: filterDefinition.code(),
    name: filterDefinition.code({ operators: ["eq"] })
};
export type UnitFilterName = keyof typeof unitFilterDefinitions;
const unitFilter = resourceFilterSchema(
    unitFilterDefinitions,
    "units",
    "Structured unit filters. Use bracket notation such as filter[code]=IC."
);

export const unitSort = defineSort({
    resourceName: "units",
    sortableFields: ["code", "name"] as const,
    defaultSort: [{ field: "code", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({
            id: pathParam.integer()
        })
    }),
    response: new OutputBuilder()
        .ok(unitEntity, "Unit retrieved successfully")
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
            filter: unitFilter.optional(),
            sort: resourceSortSchema(unitSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(unitEntity),
            "List of units retrieved successfully"
        )
        .build()
} satisfies IO;

export default {
    schema: unitEntity,
    get,
    list
};
