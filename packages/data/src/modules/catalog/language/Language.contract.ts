import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    filterDefinition,
    pathParam,
    pathSeg,
    resourceFilterSchema,
    SpecBuilder,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const basePath = [pathSeg.literal("languages")];
const tags = ["languages"];
const specsBuilder = new SpecBuilder(basePath, tags, "id");

const schema = z
    .object({
        id: z.number().int(),
        name: z.string(),
        catalogLanguagesCount: z.number().int(),
        _paths: z.object({
            self: z.string()
        })
    })
    .openapi("Language");

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
        queryFeatures: { filter: true }
    },
    request: z.object({
        query: z.object({ filter: languageFilter.optional() }).strict()
    }),
    response: new OutputBuilder()
        .ok(z.array(schema), "List of languages retrieved successfully")
        .build()
} satisfies IO;

export default {
    schema,
    get,
    list
};
