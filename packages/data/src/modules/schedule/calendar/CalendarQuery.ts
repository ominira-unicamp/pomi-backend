import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
    filterDefinition,
    resourceFilterSchema,
    type Filter
} from "@pomi/api-core";
import z from "zod";

extendZodWithOpenApi(z);

export type CalendarFilter = Filter;
const calendarFilterDefinitions = {
    startDate: filterDefinition.dateTime(),
    endDate: filterDefinition.dateTime(),
    tagId: filterDefinition.id()
};

const calendarFilterSchema = resourceFilterSchema(
    calendarFilterDefinitions,
    "calendar feed",
    "Structured calendar feed filters. Use bracket notation such as filter[tagId]=1."
);

export const calendarQuerySchema = z
    .object({ filter: calendarFilterSchema.optional() })
    .strict();

export type CalendarFeedQuery = z.infer<typeof calendarQuerySchema>;
