import { OutputBuilder, type IO } from "#/BuildHandler.js";
import { policies } from "#/auth.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    comparisonOperators,
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

const basePath = [pathSeg.literal("exchange-notices")];
const specsBuilder = new SpecBuilder(basePath, ["exchange-notices"], "id", {
    resource: "exchangeNotices",
    operationName: "ExchangeNotices",
    pathParameters: { id: "exchangeNoticeId" }
});
const placeSchema = z
    .object({
        id: z.number().int().positive(),
        name: z.string()
    })
    .strict()
    .openapi("ExchangePlace", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "ExchangePlace",
            identityFields: ["id"]
        }
    });

const fileSchema = z
    .object({
        id: z.number().int().positive(),
        name: z.string(),
        url: z.string().url().nullable()
    })
    .strict()
    .openapi("ExchangeNoticeFile", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "ExchangeNoticeFile",
            identityFields: ["id"]
        }
    });

const schema = z
    .object({
        id: z.number().int().positive(),
        number: z.string().nullable(),
        issuer: z.string().nullable(),
        title: z.string().nullable(),
        place: placeSchema.nullable(),
        registrationOriginalText: z.string().nullable(),
        registrationStart: z.iso.date().nullable(),
        registrationEnd: z.iso.date().nullable(),
        files: z.array(fileSchema)
    })
    .strict()
    .openapi("ExchangeNotice", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "ExchangeNotice",
            identityFields: ["id"]
        }
    });

export type ExchangeNoticeFilter = Filter;
const exchangeNoticeFilterDefinitions = {
    number: filterDefinition.code(),
    issuer: filterDefinition.code(),
    title: filterDefinition.code(),
    placeId: filterDefinition.id({
        positive: true,
        operators: ["eq", "ne", "in"]
    }),
    placeName: filterDefinition.code({ operators: ["eq"] }),
    registrationStart: filterDefinition.date({
        operators: comparisonOperators
    }),
    registrationEnd: filterDefinition.date({ operators: comparisonOperators })
};
export type ExchangeNoticeFilterName =
    keyof typeof exchangeNoticeFilterDefinitions;
const exchangeNoticeFilter = resourceFilterSchema(
    exchangeNoticeFilterDefinitions,
    "exchange notices",
    "Structured exchange notice filters. Use bracket notation such as filter[registrationEnd][gte]=2026-01-01."
);

export const exchangeNoticeSort = defineSort({
    resourceName: "exchange notices",
    sortableFields: [
        "registrationEnd",
        "registrationStart",
        "number",
        "issuer",
        "title",
        "place.name"
    ] as const,
    defaultSort: [
        { field: "registrationEnd", direction: "desc" },
        { field: "registrationStart", direction: "desc" }
    ],
    tieBreakers: [{ field: "id", direction: "desc" }]
});

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({ id: pathParam.positiveInteger() })
    }),
    response: new OutputBuilder()
        .ok(schema, "Exchange notice retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

const listQuery = createPaginationQuerySchema(unpaginatedByDefault, {
    filter: exchangeNoticeFilter.optional(),
    sort: resourceSortSchema(exchangeNoticeSort).optional(),
    q: z.string().trim().min(1).optional()
}).strict();

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
            getPaginatedSchema(schema),
            "List of exchange notices retrieved successfully"
        )
        .badRequest()
        .build()
} satisfies IO;

export default { schema, get, list };
