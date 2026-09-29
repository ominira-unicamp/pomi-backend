import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    createPaginationQuerySchema,
    defineSort,
    filterDefinition,
    getPaginatedSchema,
    pathSeg,
    resourceFilterSchema,
    resourceSortSchema,
    SpecBuilder,
    unpaginatedByDefault,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

const specsBuilder = new SpecBuilder(
    [pathSeg.literal("exchange-places")],
    ["exchange-places"],
    "id",
    {
        resource: "exchangePlaces",
        operationName: "ExchangePlaces",
        pathParameters: { id: "exchangePlaceId" }
    }
);

const schema = z
    .object({
        id: z.number().int().positive(),
        name: z.string()
    })
    .strict()
    .openapi("ExchangePlaceListItem", {
        "x-pomi-schema": {
            kind: "projection",
            publicName: "ExchangePlaceListItem"
        }
    });

export type ExchangePlaceFilter = Filter;
const exchangePlaceFilterDefinitions = {
    id: filterDefinition.id({ positive: true }),
    name: filterDefinition.code({ operators: ["eq"] })
};
export type ExchangePlaceFilterName =
    keyof typeof exchangePlaceFilterDefinitions;
const exchangePlaceFilter = resourceFilterSchema(
    exchangePlaceFilterDefinitions,
    "exchange places",
    "Structured exchange place filters. Use bracket notation such as filter[name]=França."
);
export const exchangePlaceSort = defineSort({
    resourceName: "exchange places",
    sortableFields: ["name"] as const,
    defaultSort: [{ field: "name", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const list = {
    meta: {
        ...specsBuilder.list(),
        authorization: policies.public,
        queryFeatures: { filter: true, sort: true },
        pagination: unpaginatedByDefault
    },
    request: z.object({
        query: createPaginationQuerySchema(unpaginatedByDefault, {
            filter: exchangePlaceFilter.optional(),
            sort: resourceSortSchema(exchangePlaceSort).optional()
        }).strict()
    }),
    response: new OutputBuilder()
        .ok(
            getPaginatedSchema(schema),
            "List of exchange places retrieved successfully"
        )
        .build()
} satisfies IO;

export default { schema, list };
