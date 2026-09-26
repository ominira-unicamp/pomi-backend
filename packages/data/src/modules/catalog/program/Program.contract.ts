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

const basePath = [pathSeg.literal("programs")];
const tags = ["programs"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "programs",
    operationName: "Programs",
    pathParameters: { id: "programId" }
});

const schema = z
    .object({
        id: z.number().int(),
        code: z.number().int(),
        name: z.string(),
        unitId: z.number().int(),
        unit: z.object({
            id: z.number().int(),
            code: z.string()
        }),
        catalogProgramsCount: z.number().int()
    })
    .openapi("Program", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Program",
            identityFields: ["id"]
        }
    });

export type ProgramFilter = Filter;
const programFilterDefinitions = { unitId: filterDefinition.id() };
export type ProgramFilterName = keyof typeof programFilterDefinitions;
const programFilter = resourceFilterSchema(
    programFilterDefinitions,
    "programs",
    "Structured program filters. Use bracket notation such as filter[unitId]=1."
);
export const programSort = defineSort({
    resourceName: "programs",
    sortableFields: ["code", "name", "unitCode"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
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
        .ok(schema, "Program retrieved successfully")
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
            filter: programFilter.optional(),
            sort: resourceSortSchema(programSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(schema),
            "List of programs retrieved successfully"
        )
        .build()
} satisfies IO;

export default {
    schema,
    get,
    list
};
