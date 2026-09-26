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

const basePath = [pathSeg.literal("languages")];
const tags = ["languages"];
const specsBuilder = new SpecBuilder(basePath, tags, "id", {
    resource: "languages",
    operationName: "Languages",
    pathParameters: { id: "languageId" }
});

const schema = z
    .object({
        id: z.number().int(),
        name: z.string(),
        catalogLanguagesCount: z.number().int()
    })
    .openapi("Language", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Language",
            identityFields: ["id"]
        }
    });

export type LanguageFilter = Filter;
const languageFilterDefinitions = {
    id: filterDefinition.id(),
    name: filterDefinition.code({ operators: ["eq"] })
};
export type LanguageFilterName = keyof typeof languageFilterDefinitions;
const languageFilter = resourceFilterSchema(
    languageFilterDefinitions,
    "languages",
    "Structured language filters. Use bracket notation such as filter[name]=Português."
);
export const languageSort = defineSort({
    resourceName: "languages",
    sortableFields: ["name"] as const,
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
        .ok(schema, "Language retrieved successfully")
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
            filter: languageFilter.optional(),
            sort: resourceSortSchema(languageSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(schema),
            "List of languages retrieved successfully"
        )
        .build()
} satisfies IO;

export default {
    schema,
    get,
    list
};
