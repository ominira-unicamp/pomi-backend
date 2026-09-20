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

const basePath = [pathSeg.literal("daily-menus")];
const specsBuilder = new SpecBuilder(basePath, ["daily-menus"], "id", {
    resource: "dailyMenus",
    operationName: "DailyMenus",
    pathParameters: { id: "dailyMenuId" }
});

const mealPeriodSchema = z.enum(["LUNCH", "DINNER"]).openapi("MealPeriod", {
    "x-pomi-schema": { kind: "value-object", publicName: "MealPeriod" }
});
const mealDietSchema = z.enum(["TRADITIONAL", "VEGAN"]).openapi("MealDiet", {
    "x-pomi-schema": { kind: "value-object", publicName: "MealDiet" }
});
const mealStatusSchema = z
    .enum(["AVAILABLE", "NOT_REGISTERED"])
    .openapi("MealStatus", {
        "x-pomi-schema": { kind: "value-object", publicName: "MealStatus" }
    });
const mealSchema = z
    .object({
        id: z.number().int().positive(),
        period: mealPeriodSchema,
        diet: mealDietSchema,
        status: mealStatusSchema,
        mainDish: z.string().nullable(),
        items: z.array(z.string()),
        observations: z.array(z.string()),
        serviceNotes: z.array(z.string())
    })
    .strict()
    .openapi("Meal", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "Meal",
            identityFields: ["id"]
        }
    });

const schema = z
    .object({
        id: z.number().int().positive(),
        date: z.iso.date(),
        meals: z.array(mealSchema),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
        _paths: z.object({ self: z.string() }).strict()
    })
    .strict()
    .openapi("DailyMenu", {
        "x-pomi-schema": {
            kind: "entity",
            publicName: "DailyMenu",
            identityFields: ["id"],
            transportFields: ["_paths"]
        }
    });

export type DailyMenuFilter = Filter;
const dailyMenuFilterDefinitions = {
    date: filterDefinition.date({ operators: ["eq", "gte", "lte"] })
};
export type DailyMenuFilterName = keyof typeof dailyMenuFilterDefinitions;
const dailyMenuFilter = resourceFilterSchema(
    dailyMenuFilterDefinitions,
    "daily menus",
    "Structured daily menu filters. Use bracket notation such as filter[date][gte]=2026-08-20."
);
export const dailyMenuSort = defineSort({
    resourceName: "daily menus",
    sortableFields: ["date", "createdAt", "updatedAt"] as const,
    defaultSort: [{ field: "date", direction: "asc" }] as const,
    tieBreakers: [{ field: "id", direction: "asc" }] as const
});

const get = {
    meta: { ...specsBuilder.get(), authorization: policies.public },
    request: z.object({
        path: z.object({ id: pathParam.positiveInteger() })
    }),
    response: new OutputBuilder()
        .ok(schema, "Daily menu retrieved successfully")
        .notFound()
        .build()
} satisfies IO;

const listQuery = createPaginationQuerySchema(unpaginatedByDefault, {
    filter: dailyMenuFilter.optional(),
    sort: resourceSortSchema(dailyMenuSort).optional()
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
            "List of daily menus retrieved successfully"
        )
        .badRequest()
        .build()
} satisfies IO;

export default { schema, get, list };
