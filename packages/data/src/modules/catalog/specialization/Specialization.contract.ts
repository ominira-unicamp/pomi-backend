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

const basePath = [pathSeg.literal("specializations")];
const tags = ["specializations"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "specializations",
    operationName: "Specializations",
    pathParameters: { id: "specializationId" }
});
const positiveId = z.number().int().positive();

const schema = z
    .object({
        id: positiveId,
        programId: positiveId,
        programCode: z.number().int().positive(),
        programName: z.string().trim().min(1),
        code: z.string(),
        name: z.string(),
        catalogProgramVariantsCount: z.number().int(),
        studentsCount: z.number().int(),
        _paths: z.object({
            self: z.string(),
            program: z.string()
        })
    })
    .openapi("Specialization", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Specialization",
            identityFields: ["id"],
            transportFields: ["_paths"]
        }
    });

export type SpecializationFilter = Filter;
const specializationFilterDefinitions = {
    programId: filterDefinition.id({ positive: true }),
    programCode: filterDefinition.integer({ minimum: 1 }),
    code: filterDefinition.code({ uppercase: true })
};
export type SpecializationFilterName =
    keyof typeof specializationFilterDefinitions;
const specializationFilter = resourceFilterSchema(
    specializationFilterDefinitions,
    "specializations",
    "Structured specialization filters. Use bracket notation such as filter[programId]=1."
);
export const specializationSort = defineSort({
    resourceName: "specializations",
    sortableFields: ["programCode", "programName", "code", "name"] as const,
    defaultSort: [
        { field: "programCode", direction: "asc" },
        { field: "name", direction: "asc" }
    ] as const,
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
        .ok(schema, "Specialization retrieved successfully")
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
            filter: specializationFilter.optional(),
            sort: resourceSortSchema(specializationSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(schema),
            "List of specializations retrieved successfully"
        )
        .build()
} satisfies IO;
export default {
    schema,
    get,
    list
};
